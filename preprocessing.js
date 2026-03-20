// preprocessing.js — Signal Processing Pipeline
// Pipeline stages: smooth → resample → normalize
// Each stage is independently testable.

const Preprocessing = (() => {
  // Fixed output length after resampling (all templates have this many points)
  const RESAMPLE_LENGTH = 50;
  // Moving-average window for smoothing
  const SMOOTH_WINDOW = 3;

  // Extract a single channel (by key) from an array of sample objects
  function _extractChannel(samples, key) {
    return samples.map(s => s[key] || 0);
  }

  // Moving-average smoothing — reduces high-frequency noise
  function smooth(arr, windowSize) {
    const w = windowSize || SMOOTH_WINDOW;
    const half = Math.floor(w / 2);
    return arr.map((_, i) => {
      const lo = Math.max(0, i - half);
      const hi = Math.min(arr.length - 1, i + half);
      let sum = 0;
      for (let j = lo; j <= hi; j++) sum += arr[j];
      return sum / (hi - lo + 1);
    });
  }

  // Linear resampling to exactly targetLength points — handles speed variation
  function resample(arr, targetLength) {
    const n = targetLength || RESAMPLE_LENGTH;
    if (arr.length === 0) return new Array(n).fill(0);
    if (arr.length === 1) return new Array(n).fill(arr[0]);
    const result = new Array(n);
    const ratio = (arr.length - 1) / (n - 1);
    for (let i = 0; i < n; i++) {
      const pos = i * ratio;
      const lo = Math.floor(pos);
      const hi = Math.min(lo + 1, arr.length - 1);
      result[i] = arr[lo] + (pos - lo) * (arr[hi] - arr[lo]);
    }
    return result;
  }

  // Z-score normalization — removes amplitude differences between templates
  function normalize(arr) {
    if (arr.length === 0) return arr;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    const std = Math.sqrt(variance) || 1; // fallback to 1 to avoid division by zero for constant signals
    return arr.map(v => (v - mean) / std);
  }

  // Full preprocessing pipeline for a raw sample array.
  // Returns an array of RESAMPLE_LENGTH vectors, each [ax, ay, az, gx, gy, gz].
  function process(samples) {
    if (!samples || samples.length < 2) return [];
    const keys = ['ax', 'ay', 'az', 'gx', 'gy', 'gz'];
    const channels = keys.map(k => {
      const raw = _extractChannel(samples, k);
      return normalize(resample(smooth(raw)));
    });
    // Transpose to get array of per-timepoint feature vectors
    return channels[0].map((_, i) => channels.map(ch => ch[i]));
  }

  // Sum of per-channel variances across ax/ay/az — measures dynamic movement energy.
  // Using channel variance rather than magnitude variance keeps the metric
  // gravity-independent: a stationary phone returns ~0 regardless of orientation.
  function energy(samples) {
    if (!samples || samples.length === 0) return 0;
    return ['ax', 'ay', 'az'].reduce((sum, k) => {
      const vals = samples.map(s => s[k] || 0);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      return sum + variance;
    }, 0);
  }

  return { process, energy, smooth, resample, normalize, RESAMPLE_LENGTH };
})();

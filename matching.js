// matching.js — Template Matching via Dynamic Time Warping
//
// DTW tolerates differences in movement speed between the query and stored
// templates, making it a good fit for hand-gesture recognition without ML.
//
// Default threshold: 1.0 (normalized DTW distance per alignment step).
//   Lower  → fewer matches, fewer false positives.
//   Higher → more matches, more false positives.

const Matching = (() => {
  // Euclidean distance between two equal-length feature vectors
  function _dist(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
    return Math.sqrt(sum);
  }

  // DTW with optional Sakoe-Chiba band. Returns total alignment cost divided
  // by (n + m) so the score is independent of sequence length.
  function dtw(seq1, seq2, bandRadius = null) {
    const n = seq1.length;
    const m = seq2.length;
    if (n === 0 || m === 0) return Infinity;

    // Use flat Float32Array for speed
    const dp = new Float32Array(n * m);
    dp.fill(Infinity);
    dp[0] = _dist(seq1[0], seq2[0]);

    const radius = Number.isFinite(bandRadius) ? Math.max(0, Math.floor(bandRadius)) : null;

    const edgeInitLimit = radius === null ? Math.max(n, m) : radius;
    for (let i = 1; i < n && i <= edgeInitLimit; i++) {
      dp[i * m] = dp[(i - 1) * m] + _dist(seq1[i], seq2[0]);
    }
    for (let j = 1; j < m && j <= edgeInitLimit; j++) {
      dp[j] = dp[j - 1] + _dist(seq1[0], seq2[j]);
    }

    for (let i = 1; i < n; i++) {
      const jStart = radius === null ? 1 : Math.max(1, i - radius);
      const jEnd = radius === null ? m - 1 : Math.min(m - 1, i + radius);
      for (let j = jStart; j <= jEnd; j++) {
        const best = Math.min(
          dp[(i - 1) * m + j],
          dp[i * m + (j - 1)],
          dp[(i - 1) * m + (j - 1)]
        );
        dp[i * m + j] = _dist(seq1[i], seq2[j]) + best;
      }
    }

    return dp[n * m - 1] / (n + m);
  }

  // Compare querySeq against all stored gesture templates.
  // Returns the best result: { label, distance, confidence } or
  // { label: 'unknown', distance, confidence: 0 } if nothing is close enough.
  function findBestMatch(querySeq, gestures, threshold, bandRadius = null) {
    if (!gestures || !gestures.length || !querySeq || !querySeq.length) {
      return null;
    }

    let bestDist = Infinity;
    let bestLabel = null;

    for (const g of gestures) {
      if (!g.template || !g.template.length) continue;
      const d = dtw(querySeq, g.template, bandRadius);
      if (d < bestDist) {
        bestDist = d;
        bestLabel = g.label;
      }
    }

    if (bestDist > threshold) {
      return { label: 'unknown', distance: bestDist, confidence: 0 };
    }

    // Map distance linearly to 0–100 % confidence
    const confidence = Math.max(0, Math.round((1 - bestDist / threshold) * 100));
    return { label: bestLabel, distance: bestDist, confidence };
  }

  return { dtw, findBestMatch };
})();

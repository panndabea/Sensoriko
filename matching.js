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

  // Standard DTW.  Returns the total alignment cost divided by (n + m)
  // so the score is independent of sequence length.
  function dtw(seq1, seq2) {
    const n = seq1.length;
    const m = seq2.length;
    if (n === 0 || m === 0) return Infinity;

    // Use flat Float32Array for speed
    const dp = new Float32Array(n * m);
    dp[0] = _dist(seq1[0], seq2[0]);

    for (let i = 1; i < n; i++) dp[i * m] = dp[(i - 1) * m] + _dist(seq1[i], seq2[0]);
    for (let j = 1; j < m; j++) dp[j] = dp[j - 1] + _dist(seq1[0], seq2[j]);

    for (let i = 1; i < n; i++) {
      for (let j = 1; j < m; j++) {
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
  function findBestMatch(querySeq, gestures, threshold) {
    if (!gestures || !gestures.length || !querySeq || !querySeq.length) {
      return null;
    }

    let bestDist = Infinity;
    let bestLabel = null;

    for (const g of gestures) {
      if (!g.template || !g.template.length) continue;
      const d = dtw(querySeq, g.template);
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

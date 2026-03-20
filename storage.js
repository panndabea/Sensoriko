// storage.js — Gesture Storage (localStorage)
// Designed to be robust against corrupted, empty or missing data.

const Storage = (() => {
  const KEY = 'sensoriko_gestures';

  function loadGestures() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Keep only structurally valid entries
      return parsed.filter(
        g => g && typeof g.label === 'string' && g.label.length > 0 && Array.isArray(g.template)
      );
    } catch {
      return [];
    }
  }

  function _persist(gestures) {
    try {
      localStorage.setItem(KEY, JSON.stringify(gestures));
    } catch (e) {
      console.warn('Sensoriko: failed to save gestures to localStorage', e);
    }
  }

  // Append a new gesture and return the updated list
  function addGesture(label, template) {
    const gestures = loadGestures();
    gestures.push({ label, template, createdAt: Date.now() });
    _persist(gestures);
    return gestures;
  }

  // Remove the gesture at the given index and return the updated list
  function deleteGesture(index) {
    const gestures = loadGestures();
    gestures.splice(index, 1);
    _persist(gestures);
    return gestures;
  }

  // Serialise all gestures to a pretty-printed JSON string
  function exportJSON() {
    return JSON.stringify(loadGestures(), null, 2);
  }

  // Replace the stored gesture list with the content of a JSON string.
  // Throws if the JSON is malformed so the caller can show an error.
  function importJSON(jsonStr) {
    const parsed = JSON.parse(jsonStr); // intentionally let this throw
    if (!Array.isArray(parsed)) throw new Error('Expected a JSON array.');
    const valid = parsed.filter(
      g => g && typeof g.label === 'string' && g.label.length > 0 && Array.isArray(g.template)
    );
    _persist(valid);
    return valid;
  }

  return { loadGestures, addGesture, deleteGesture, exportJSON, importJSON };
})();

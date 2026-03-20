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
      // Keep only structurally valid entries and normalize legacy records
      return parsed
        .filter(g => g && typeof g.label === 'string' && g.label.length > 0)
        .map(g => {
          const examples = Array.isArray(g.examples) && g.examples.length
            ? g.examples.filter(ex => Array.isArray(ex))
            : Array.isArray(g.template) ? [g.template] : [];
          const template = _centroid(examples);
          return template.length ? {
            label: g.label,
            template,
            examples,
            createdAt: g.createdAt || Date.now(),
          } : null;
        })
        .filter(Boolean);
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

  function _centroid(examples) {
    if (!examples || !examples.length) return [];
    const first = examples.find(ex => Array.isArray(ex) && ex.length && Array.isArray(ex[0]) && ex[0].length);
    if (!first) return [];
    const length = first.length;
    if (!length) return [];
    const dims = first[0]?.length || 0;
    if (!dims) return [];
    const validExamples = examples.filter(
      ex =>
        Array.isArray(ex) &&
        ex.length === length &&
        ex.every(point => Array.isArray(point) && point.length === dims)
    );
    if (!validExamples.length) return [];

    const out = new Array(length);
    for (let i = 0; i < length; i++) {
      const point = new Array(dims).fill(0);
      for (const ex of validExamples) {
        for (let d = 0; d < dims; d++) point[d] += ex[i][d];
      }
      for (let d = 0; d < dims; d++) point[d] /= validExamples.length;
      out[i] = point;
    }
    return out;
  }

  // Append a new gesture and return the updated list
  function addGesture(label, template) {
    const gestures = loadGestures();
    const existing = gestures.find(g => g.label === label);
    if (!existing) {
      gestures.push({ label, template, examples: [template], createdAt: Date.now() });
    } else {
      existing.examples.push(template);
      const centroid = _centroid(existing.examples);
      if (centroid.length) existing.template = centroid;
      existing.createdAt = Date.now();
    }
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
    const valid = parsed
      .filter(g => g && typeof g.label === 'string' && g.label.length > 0)
      .map(g => {
        const examples = Array.isArray(g.examples) && g.examples.length
          ? g.examples.filter(ex => Array.isArray(ex))
          : Array.isArray(g.template) ? [g.template] : [];
        const template = _centroid(examples);
        return template.length ? {
          label: g.label,
          template,
          examples,
          createdAt: g.createdAt || Date.now(),
        } : null;
      })
      .filter(Boolean);
    _persist(valid);
    return valid;
  }

  return { loadGestures, addGesture, deleteGesture, exportJSON, importJSON };
})();

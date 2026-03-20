// app.js — Main Application Orchestrator
//
// Configuration defaults (all values are tunable here):
//
//   WINDOW_SAMPLES : 100   — sliding window size (≈2 s at 50 Hz)
//   STEP_SIZE      : 10    — run matching every N new samples (≈0.2 s)
//   DTW_THRESHOLD  : 1.0   — max normalised DTW distance to accept a match
//   COOLDOWN_MS    : 1500  — minimum ms between two emitted match events
//   MIN_ENERGY     : 2.0   — minimum movement variance to attempt matching
//   MAX_RECORD_MS  : 5000  — auto-stop recording after this many ms

const CONFIG = {
  WINDOW_SAMPLES: 100,
  STEP_SIZE: 10,
  DTW_THRESHOLD: 1.0,
  DTW_BAND_RADIUS: 5,
  COOLDOWN_MS: 1500,
  MIN_ENERGY: 2.0,
  MAX_RECORD_MS: 5000,
};
const WAVE_SAMPLES = Math.max(2, CONFIG.WINDOW_SAMPLES);

// ── State ────────────────────────────────────────────────────────────────────

let gestures = [];
let sensorActive = false;
let isRecording = false;
let recordBuffer = [];
let liveBuffer = [];
let stepCounter = 0;
let lastMatchTime = -Infinity;
let recordTimer = null;

// ── DOM helpers ──────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const elBtnEnable      = $('btn-enable-sensors');
const elBtnStart       = $('btn-start-recording');
const elBtnStop        = $('btn-stop-recording');
const elBtnExport      = $('btn-export');
const elBtnImport      = $('btn-import');
const elImportFile     = $('import-file');
const elGestureLabel   = $('gesture-label');
const elSensorStatus   = $('sensor-status');
const elSensorValues   = $('sensor-values');
const elRecordStatus   = $('recording-status');
const elMatchLabel     = $('match-label');
const elMatchConf      = $('match-confidence');
const elMatchEnergy    = $('match-energy');
const elEnergyWaveform = $('energy-waveform');
const elGestureList    = $('gesture-list');
const waveCtx = elEnergyWaveform?.getContext ? elEnergyWaveform.getContext('2d') : null;
const energyHistory = [];

// ── Sensor ───────────────────────────────────────────────────────────────────

elBtnEnable.addEventListener('click', async () => {
  if (!Sensor.isSupported()) {
    alert(
      'DeviceMotionEvent is not supported in this browser.\n' +
      'Open this page on a smartphone (iOS Safari / Android Chrome).'
    );
    return;
  }

  elBtnEnable.disabled = true;
  elBtnEnable.textContent = 'Requesting…';

  try {
    await Sensor.requestPermission();
    Sensor.start(onSample);
    sensorActive = true;

    elBtnEnable.textContent = 'Sensors Enabled ✓';
    elSensorStatus.textContent = 'Sensors Active';
    elSensorStatus.className = 'status-badge status-active';
    elSensorValues.classList.remove('hidden');
    elBtnStart.disabled = false;
  } catch (err) {
    elBtnEnable.disabled = false;
    elBtnEnable.textContent = 'Enable Motion Sensors';
    alert('Could not access motion sensors:\n' + err.message);
  }
});

// ── Sample callback ──────────────────────────────────────────────────────────

function onSample(s) {
  // Live sensor display
  $('accel-x').textContent = s.ax.toFixed(2);
  $('accel-y').textContent = s.ay.toFixed(2);
  $('accel-z').textContent = s.az.toFixed(2);
  $('gyro-x').textContent  = s.gx.toFixed(1);
  $('gyro-y').textContent  = s.gy.toFixed(1);
  $('gyro-z').textContent  = s.gz.toFixed(1);

  const mag = Math.sqrt(s.ax ** 2 + s.ay ** 2 + s.az ** 2);
  $('magnitude').textContent = mag.toFixed(2);

  // Maintain live ring buffer
  liveBuffer.push(s);
  if (liveBuffer.length > CONFIG.WINDOW_SAMPLES) liveBuffer.shift();

  // Accumulate recording buffer
  if (isRecording) recordBuffer.push(s);

  const instantEnergy = s.ax ** 2 + s.ay ** 2 + s.az ** 2;
  energyHistory.push(instantEnergy);
  if (energyHistory.length > WAVE_SAMPLES) energyHistory.shift();
  drawEnergyWaveform();

  // Sliding-window matching
  stepCounter++;
  if (stepCounter >= CONFIG.STEP_SIZE) {
    stepCounter = 0;
    runLiveMatch();
  }
}

function drawEnergyWaveform() {
  if (!waveCtx || !elEnergyWaveform) return;
  const w = elEnergyWaveform.width;
  const h = elEnergyWaveform.height;
  waveCtx.clearRect(0, 0, w, h);

  waveCtx.strokeStyle = '#334155';
  waveCtx.lineWidth = 1;
  waveCtx.beginPath();
  waveCtx.moveTo(0, h - 1);
  waveCtx.lineTo(w, h - 1);
  waveCtx.stroke();

  if (energyHistory.length < 2) return;
  const maxVal = Math.max(CONFIG.MIN_ENERGY * 2, ...energyHistory);
  waveCtx.strokeStyle = '#3b82f6';
  waveCtx.lineWidth = 2;
  waveCtx.beginPath();
  for (let i = 0; i < energyHistory.length; i++) {
    const x = (i / (WAVE_SAMPLES - 1)) * w;
    const y = h - (energyHistory[i] / maxVal) * h;
    if (i === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  }
  waveCtx.stroke();

  const thresholdY = h - (CONFIG.MIN_ENERGY / maxVal) * h;
  waveCtx.strokeStyle = '#94a3b8';
  waveCtx.setLineDash([4, 3]);
  waveCtx.beginPath();
  waveCtx.moveTo(0, thresholdY);
  waveCtx.lineTo(w, thresholdY);
  waveCtx.stroke();
  waveCtx.setLineDash([]);
}

// ── Live matching ────────────────────────────────────────────────────────────

function runLiveMatch() {
  const e = Preprocessing.energy(liveBuffer);
  elMatchEnergy.textContent = 'Energy: ' + e.toFixed(2);

  if (!gestures.length) return;

  // Skip if buffer is not full enough for a meaningful window
  if (liveBuffer.length < CONFIG.WINDOW_SAMPLES / 2) return;

  if (e < CONFIG.MIN_ENERGY) {
    setMatchDisplay('—', '', 'idle');
    return;
  }

  const now = performance.now();
  if (now - lastMatchTime < CONFIG.COOLDOWN_MS) return;

  const processed = Preprocessing.process(liveBuffer);
  if (!processed.length) return;

  const result = Matching.findBestMatch(
    processed,
    gestures,
    CONFIG.DTW_THRESHOLD,
    CONFIG.DTW_BAND_RADIUS
  );
  if (!result) return;

  if (result.label !== 'unknown') {
    lastMatchTime = now;
    setMatchDisplay(result.label, result.confidence + '% confidence', 'found');
  } else {
    setMatchDisplay('unknown', 'No match', 'unknown');
  }
}

function setMatchDisplay(label, sub, state) {
  elMatchLabel.textContent = label;
  elMatchConf.textContent  = sub;
  elMatchLabel.className = 'match-label' + (state !== 'idle' ? ' match-' + state : '');
}

// ── Recording ────────────────────────────────────────────────────────────────

elBtnStart.addEventListener('click', () => {
  const label = elGestureLabel.value.trim();
  if (!label) { alert('Please enter a gesture name first.'); return; }
  if (!sensorActive) { alert('Please enable motion sensors first.'); return; }

  isRecording   = true;
  recordBuffer  = [];
  elBtnStart.disabled      = true;
  elBtnStop.disabled       = false;
  elGestureLabel.disabled  = true;
  elRecordStatus.textContent = 'Recording…';
  elRecordStatus.className   = 'status-badge status-recording';

  // Safety auto-stop
  recordTimer = setTimeout(stopRecording, CONFIG.MAX_RECORD_MS);
});

elBtnStop.addEventListener('click', stopRecording);

function stopRecording() {
  if (!isRecording) return;
  clearTimeout(recordTimer);

  isRecording              = false;
  elBtnStart.disabled      = false;
  elBtnStop.disabled       = true;
  elGestureLabel.disabled  = false;

  if (recordBuffer.length < 10) {
    elRecordStatus.textContent = 'Too short — try again';
    elRecordStatus.className   = 'status-badge status-inactive';
    recordBuffer = [];
    return;
  }

  const label    = elGestureLabel.value.trim();
  const template = Preprocessing.process(recordBuffer);

  if (!template.length) {
    elRecordStatus.textContent = 'Processing failed — try again';
    elRecordStatus.className   = 'status-badge status-inactive';
    recordBuffer = [];
    return;
  }

  gestures = Storage.addGesture(label, template);
  renderGestureList();

  elRecordStatus.textContent = `Saved "${label}" (${recordBuffer.length} samples)`;
  elRecordStatus.className   = 'status-badge status-active';
  elGestureLabel.value       = '';
  recordBuffer               = [];
}

// ── Gesture list ─────────────────────────────────────────────────────────────

function renderGestureList() {
  elGestureList.innerHTML = '';

  if (!gestures.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'No gestures saved yet.';
    elGestureList.appendChild(li);
    return;
  }

  gestures.forEach((g, i) => {
    const li   = document.createElement('li');
    li.className = 'gesture-item';

    const time = g.createdAt ? new Date(g.createdAt).toLocaleTimeString() : '';
    const pts  = g.template.length;
    const examples = Array.isArray(g.examples) ? g.examples.length : undefined;

    const name = document.createElement('span');
    name.className   = 'gesture-name';
    name.textContent = g.label;

    const meta = document.createElement('span');
    meta.className   = 'gesture-meta';
    meta.textContent = `${pts} pts · ${examples ?? '?'} ex · ${time}`;

    const del = document.createElement('button');
    del.className   = 'btn-delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Delete ' + g.label);
    del.addEventListener('click', () => {
      gestures = Storage.deleteGesture(i);
      renderGestureList();
    });

    li.append(name, meta, del);
    elGestureList.appendChild(li);
  });
}

// ── Export / Import ──────────────────────────────────────────────────────────

elBtnExport.addEventListener('click', () => {
  if (!gestures.length) { alert('No gestures to export.'); return; }
  const blob = new Blob([Storage.exportJSON()], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'sensoriko-gestures.json';
  a.click();
  URL.revokeObjectURL(url);
});

elBtnImport.addEventListener('click', () => elImportFile.click());

elImportFile.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      gestures = Storage.importJSON(ev.target.result);
      renderGestureList();
      alert(`Imported ${gestures.length} gesture(s).`);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    elImportFile.value = '';
  };
  reader.readAsText(file);
});

// ── Init ─────────────────────────────────────────────────────────────────────

gestures = Storage.loadGestures();
renderGestureList();

// Show a notice on non-mobile browsers where sensors are unavailable
if (!Sensor.isSupported()) {
  elSensorStatus.textContent = 'No motion sensors detected';
  elSensorStatus.className   = 'status-badge status-inactive';
  elBtnEnable.disabled       = true;
}

// sensor.js — Sensor Input Module
// Wraps DeviceMotionEvent with iOS 13+ permission flow and 50 Hz throttle.

const Sensor = (() => {
  // Target sample rate (ms between emitted samples)
  const INTERVAL_MS = 20; // 50 Hz

  let _onSample = null;
  let _active = false;
  let _lastSampleTime = 0;
  let _lastRotation = { gx: 0, gy: 0, gz: 0 };

  function _handleMotion(e) {
    // Prefer acceleration without gravity; fall back to with-gravity on devices that omit it
    const a =
      e.acceleration && e.acceleration.x != null
        ? e.acceleration
        : e.accelerationIncludingGravity || {};

    const rr = e.rotationRate || {};

    const now = performance.now();
    if (now - _lastSampleTime < INTERVAL_MS) return;
    _lastSampleTime = now;

    _lastRotation = {
      gx: rr.alpha || 0,
      gy: rr.beta || 0,
      gz: rr.gamma || 0,
    };

    if (_onSample) {
      _onSample({
        ax: a.x || 0,
        ay: a.y || 0,
        az: a.z || 0,
        gx: _lastRotation.gx,
        gy: _lastRotation.gy,
        gz: _lastRotation.gz,
        t: now,
      });
    }
  }

  // Resolves when permission is granted; throws on denial or missing API
  async function requestPermission() {
    if (typeof DeviceMotionEvent === 'undefined') {
      throw new Error('DeviceMotionEvent not supported in this browser.');
    }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      // iOS 13+ requires explicit user permission from a gesture handler
      const result = await DeviceMotionEvent.requestPermission();
      if (result !== 'granted') {
        throw new Error('Motion sensor permission was denied.');
      }
    }
    // Android / desktop Chrome: permission granted implicitly
  }

  function start(onSample) {
    if (_active) return;
    _onSample = onSample;
    _active = true;
    window.addEventListener('devicemotion', _handleMotion, { passive: true });
  }

  function stop() {
    if (!_active) return;
    _active = false;
    _onSample = null;
    window.removeEventListener('devicemotion', _handleMotion);
  }

  function isSupported() {
    return typeof DeviceMotionEvent !== 'undefined';
  }

  function isActive() {
    return _active;
  }

  return { requestPermission, start, stop, isSupported, isActive };
})();

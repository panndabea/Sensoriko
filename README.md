# Sensoriko

> Browser-based smartphone motion controller — record and recognize hand gestures in real time using only the phone's accelerometer and gyroscope.

No build tools · No backend · No dependencies · GitHub Pages ready

---

## Product description

Sensoriko turns your smartphone into a motion controller entirely inside the browser.
You record short physical gestures (e.g. "slash_left", "thrust", "shake"), each saved as a processed template in `localStorage`.
While you hold the phone, a sliding-window algorithm continuously compares live sensor data against every stored template using Dynamic Time Warping (DTW).
When a gesture is recognized with sufficient confidence it is shown together with a confidence score; ambiguous movements are labeled "unknown".
Everything runs locally — no server, no native app, no account required.

---

## Architecture

```
Sensor Input  →  Recording buffer / Live ring buffer
                        │
                 Preprocessing
                  (smooth → resample → normalise)
                        │
                 Template Matching
                  (DTW, sliding window)
                        │
                   Storage / UI
                (localStorage, DOM)
```

| File | Responsibility |
|---|---|
| `sensor.js` | DeviceMotionEvent wrapper, iOS permission flow, 50 Hz throttle |
| `preprocessing.js` | Moving-average smooth · linear resample to 50 pts · z-score normalize · movement energy |
| `matching.js` | DTW distance metric · best-match search with threshold |
| `storage.js` | localStorage CRUD · JSON export/import · corruption-safe |
| `app.js` | Wires everything together · sliding-window live recognition · recording flow · UI |
| `index.html` | Mobile-first markup |
| `style.css` | Dark mobile-first CSS |

### Key default values (all in `app.js → CONFIG`)

| Parameter | Default | Meaning |
|---|---|---|
| `WINDOW_SAMPLES` | 100 | Sliding window ≈ 2 s at 50 Hz |
| `STEP_SIZE` | 10 | Run matching every 10 new samples |
| `DTW_THRESHOLD` | 1.0 | Max normalised DTW distance to accept a match |
| `DTW_BAND_RADIUS` | 5 | Sakoe-Chiba DTW band radius (max warping offset) |
| `COOLDOWN_MS` | 1500 | Minimum ms between two match events |
| `MIN_ENERGY` | 2.0 | Minimum movement variance to attempt matching |
| `MAX_RECORD_MS` | 5000 | Auto-stop recording after 5 s |

---

## Project structure

```
Sensoriko/
├── index.html        ← app shell & UI markup
├── style.css         ← dark mobile-first CSS
├── sensor.js         ← sensor module (iOS permission flow)
├── preprocessing.js  ← signal processing pipeline
├── matching.js       ← DTW template matching
├── storage.js        ← localStorage wrapper
└── app.js            ← main orchestrator
```

---

## Local testing

1. Clone or download this repository.
2. Serve the folder with any static file server, for example:

   ```bash
   # Python 3
   python3 -m http.server 8080
   # then open http://localhost:8080 in your browser
   ```

   Or use VS Code **Live Server**, `npx serve .`, etc.

3. **On a real smartphone** (iOS Safari or Android Chrome):
   - Open the local URL (same WiFi network, or use a tool like `ngrok`).
   - Tap **Enable Motion Sensors** and grant permission.
   - Enter a gesture name, then **hold ⏺ Start while moving** and release to finish sample 1.
   - Repeat the hold/release cycle until 3 samples are recorded; the gesture is saved automatically.
   - Repeat for each gesture you want to recognize.
   - Keep the phone active — the **Live Match** panel updates in real time.

> Desktop browsers do not expose DeviceMotionEvent, so sensor data will be unavailable. The rest of the UI (gesture list, export/import) works everywhere.

---

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Set **Source** to `Deploy from a branch`, branch `main` (or `master`), folder `/` (root).
4. Save. GitHub will publish the site at `https://<username>.github.io/<repo>/`.

---

## Notes

- DTW matching now supports a Sakoe-Chiba constraint via `CONFIG.DTW_BAND_RADIUS`.
- Recording the same gesture label multiple times now accumulates examples and stores their centroid template.
- The Live Match panel includes a real-time energy waveform rendered on `<canvas>`.

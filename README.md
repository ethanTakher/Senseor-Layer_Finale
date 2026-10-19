# Canopy Run — Sensor Layer Prototype

**Piece:** A hands-free drone navigation game. The drone follows a route through a dense aerial map of trees and buildings. Stillness steadies its path; moving closer adds throttle; hitting highlighted hazards costs integrity.

## What it does for the person
Canopy Run lets a visitor pilot a survey drone through a crowded aerial map using their stillness and distance from the camera instead of a keyboard controller.

## What it does to the person
It recruits the visitor's body as part of the control system: head movement makes the drone drift, while leaning closer accelerates the flight and makes obstacle timing harder.

## Signals and ownership

- **`still` — my signal:** `sense.js` measures frame-to-frame movement of the nose landmark. Less movement maps toward `1`; more movement maps toward `0`. This value is smoothed before use, and the `turbulent` / `steady` state rules have holds so a single noisy frame does not flip the state.
- **`near` — partner signal:** `sense.js` estimates nearness from cheek-to-cheek width in the face mesh and normalizes it to `0–1`. This is a visual proxy, not a calibrated measurement in centimetres. It controls throttle in the game.
- **`present` — shared baseline signal:** `1` when a face is detected and `0` otherwise. It lets the piece pause when there is no pilot in frame.

The State Table in `table.js` is evaluated top to bottom. `window.sense` stays small and contains only `state`, `signals`, and `since`. The piece reads that object in its own `requestAnimationFrame` loop and does not read the camera.

## Run locally

1. Keep `index.html`, `table.js`, `fake-sense.js`, `piece.js`, and `sense.js` in the same folder.
2. Open a terminal in that folder and run `python3 -m http.server 8000` (or use VS Code Live Server).
3. Visit `http://localhost:8000` in Chrome.
4. Click **Start the camera** and grant camera permission. The camera preview is hidden by default. Press **D** to show the current `window.sense` object, **B** to show MediaPipe's named face scores, and **V** to toggle the small camera preview while debugging.

Do not open `index.html` directly from Finder: camera access requires localhost or HTTPS. The first load downloads the pinned MediaPipe library/model. The application does not upload or store frames or landmark lists. The signal keeps only the last nose coordinate needed to calculate frame-to-frame movement. Do not add image/landmark persistence or network uploads.

## Test without a camera

Before the live camera starts, `fake-sense.js` writes the same `window.sense` shape.

- Move the pointer **left to right** to set fake `stillness` from low to high.
- Move the pointer **bottom to top** to set fake `nearness` from low to high.
- Moving the pointer marks a mock visitor as present.
- Press **1–5** to force a State Table row for visual testing.

This mode is only a development aid; it does not measure real stillness. Reload the page to return to the fake sensor after the camera has started.

## Tune the thresholds with other people

Test with at least three people who were not involved in building the piece. Check whether the drone stays legible and the state does not flicker. The `still` formula and thresholds are initial values, not universal measurements; adjust them based on testing, and record every threshold change in the break log below. Do not save camera frames or face landmarks as test data.

## Deploy on GitHub Pages

1. Create a repository from the class starter template and add your partner as a collaborator.
2. Put the five camera-track files above in the repository root. Commit the work in small, meaningful changes.
3. In GitHub, open **Settings → Pages**. Deploy from branch `main`, folder `/ (root)`.
4. Open the public Pages URL in a private/incognito window and verify the app loads without logging in. Click **Start the camera** and test with the webcam.
5. Keep `index.html` as the public entry point. A GitHub repository/dashboard URL is not the live URL.

## Break log

Replace these prompts with actual entries as the build changes. Record the commit hash from `git log`; do not invent dates or hashes.

- **Date:** [fill in] · **Commit:** [hash] · **What broke:** [observed behavior] · **What changed:** [fix / threshold adjustment]
- **Date:** [fill in] · **Commit:** [hash] · **What broke:** [observed behavior] · **What changed:** [fix / threshold adjustment]
- **Date:** [fill in] · **Commit:** [hash] · **What broke:** [observed behavior] · **What changed:** [fix / threshold adjustment]

## Required receipts checklist

- [ ] At least five commits on my `still` signal, spread across at least two dates, with messages describing what changed.
- [ ] Each merge goes through a pull request approved by my partner.
- [ ] At least three real break-log entries with dates, commit hashes, failures, and changes.
- [ ] A recording in my own voice, under two minutes, taken at the live URL. Show my signal from reading to state to game response and end on `git log`.
- [ ] Screenshots show the piece or the `D` readout / mesh on black; do not include the camera image in the repository.
- [ ] Final submission contains one PDF with the live URL, repo URL, and my signal name (`still`), plus the recording as a separate file.

## Files

- `sense.js` — MediaPipe camera, signal calculations, smoothing, State Table evaluation, and `window.sense` writer.
- `table.js` — state names, rules, and hold times.
- `piece.js` — drone-map game rendered on canvas; reads `window.sense` only.
- `fake-sense.js` — keyboard/pointer sensor substitute for development.
- `index.html` — loads the files in the required order.

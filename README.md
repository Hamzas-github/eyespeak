# EyeSpeak

**[▶ Live demo](https://hamzas-github.github.io/eyespeak/).** Open it in Chrome, allow the camera, and talk with your eyes.

A webcam eye-tracking communication board (AAC). You look at a card and blink on purpose, and it speaks the phrase out loud. Real-time gaze tracking and blink detection run entirely in the browser, on-device. No install, no account, nothing leaves the page.

`Real-time computer vision` · `WebGazer` · `MediaPipe Face Landmarker` · `WebAssembly` · `Web Speech API` · `getUserMedia` · `Accessibility / AAC` · `Vanilla JS`

## What it does

- **Four big targets at a time.** The board groups into Yes, No, Food, and Pain. Food and Pain open a small sub-menu (water, hunger, drink / pain, toilet, medication) with a Back card. Bigger cards mean rough gaze still lands on the right one.
- **Gaze cursor snaps** to the nearest card, so jitter from the webcam tracker doesn't matter much.
- **Blink to select.** A deliberate, both-eyes-closed blink past your calibrated threshold picks the highlighted card. A ring fills while your eyes are shut so you can see it registering.
- **Ignores noise.** Quick natural blinks, one eye, long closures, and gaze drifting between cards all do nothing.
- **Speaks and logs** every selection for a caregiver in the room.
- **Works without the camera.** Mouse, touch, and keyboard all work too (Space selects the gazed card, Enter the focused one).

## How it works

One webcam stream feeds two models that both run on-device:

- **WebGazer** estimates where you're looking and drives the cursor. A short look-at-the-dots routine trains its regression when the camera starts, and every selection re-trains it, so accuracy improves with use. A median filter smooths out the raw signal.
- **MediaPipe Face Landmarker** reads per-eye eyelid closure from facial blendshapes. A quick open/closed calibration sets the threshold that tells a deliberate blink apart from an ordinary one.

If the camera or WebGazer fails, it falls back to mouse-position gaze with keyboard and touch control.

## Run it locally

Self-contained: one HTML file plus the vendored libraries in `vendor/`. They load as ES modules and WebAssembly, so serve it over HTTP. Opening the file directly won't work.

```bash
python -m http.server 8123
# open http://localhost:8123/eye-tracker-aac.html
```

`localhost` and any HTTPS host count as secure contexts, so the camera works.

## Where it's going

The webcam is what caps accuracy here. Next is a dedicated eye-tracking device for precise, stable gaze, plus an integration with hospital systems so a selection can push an instant notification to the on-duty caregiver instead of only speaking in the room.

## Built with

Vanilla JavaScript, no build step · [WebGazer.js](https://webgazer.cs.brown.edu/) · [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) · Web Speech API · Playwright for browser tests.

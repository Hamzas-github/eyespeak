# EyeSpeak

A webcam-based communication board you operate with your eyes. Look at a card, close both eyes on purpose for about half a second, and it speaks the phrase out loud. Everything runs in the browser. No install, no account, and no data leaves the page.

Built as a portfolio prototype to explore hands-free AAC (augmentative and alternative communication) using only a laptop camera.

## What it does

- **Gaze cursor** snaps to whichever of the nine cards you look at, so jitter from the webcam tracker doesn't matter much.
- **Blink to select.** A deliberate, both-eyes-closed blink past your calibrated threshold picks the highlighted card. A ring fills while your eyes are shut so you can see it registering.
- **Ignores the wrong things.** Quick natural blinks, one eye, long closures (resting), and blinks while your gaze is between cards all do nothing.
- **Speaks and logs** every selection for a caregiver sitting in the same room. Nothing is sent anywhere.
- **Works without the camera too.** Mouse, touch, and keyboard all work (Space selects the gazed card, Enter the focused one).

## How it works

Two camera libraries share one webcam stream:

- **WebGazer** estimates where you're looking and drives the cursor. A 9-point look-at-the-dot step trains it when the camera starts.
- **MediaPipe Face Landmarker** reads per-eye eyelid closure from face blendshapes. A short open-eyes / closed-eyes calibration sets the threshold that separates a deliberate blink from an ordinary one.

Both run entirely on-device. If WebGazer fails, it falls back to mouse position for the cursor (blink selection needs the camera, so it switches off).

## Running it

It's one file plus the vendored libraries in `vendor/`. They load as ES modules and WASM, so it has to be served over HTTP. Opening the file directly won't work.

```bash
python -m http.server 8123
# then open http://localhost:8123/eye-tracker-aac.html
```

`localhost` counts as a secure context, so the camera works. On any other host you'll need HTTPS, or the browser blocks the webcam.

Click **Start camera**, allow the camera prompt, run through calibration, and you're going. Hit **Recalibrate** any time it drifts.

## Limitations

WebGazer is a webcam eye-tracker, not infrared hardware. Even after calibration it's accurate to roughly a card-sized region and drifts when you move your head or the lighting changes. That's why the board is nine big targets and why selection only needs your gaze settled over a card, not pixel-perfect aim.

## Not a medical device

EyeSpeak is an experimental communication aid, not an emergency alert system or a medical device. Selections are spoken in the room and logged for the current session only. They are never delivered to medical staff or stored anywhere.

## Built with

[WebGazer.js](https://webgazer.cs.brown.edu/) · [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) · Web Speech API · vanilla JS, no build step.

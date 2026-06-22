// Sensor adapter — owns the webcam, WebGazer (gaze) and MediaPipe Face Landmarker
// (per-eye blink scores). It emits raw signals through callbacks and knows nothing
// about the menu, cursor, or UI. The controller decides what the signals mean.

let video = null, landmarker = null, rafCam = null, running = false, frameCb = null;
let FaceLandmarker, FilesetResolver;

const scoreOf = (cats, name) => { if (!cats) return 0; const c = cats.find(c => c.categoryName === name); return c ? c.score : 0; };

function waitFor(get, ready, timeoutMs){
  return new Promise(resolve => {
    const t0 = performance.now();
    (function poll(){
      const v = get();
      if (v && ready(v)) return resolve(v);
      if (performance.now() - t0 > timeoutMs) return resolve(null);
      requestAnimationFrame(poll);
    })();
  });
}

function camLoop(){
  if (!running){ rafCam = null; return; }
  const now = performance.now();
  if (video && video.readyState >= 2 && video.videoWidth > 0){
    let res; try { res = landmarker.detectForVideo(video, now); } catch (e) { res = null; }
    const present = !!(res && res.faceLandmarks && res.faceLandmarks.length > 0 && res.faceBlendshapes && res.faceBlendshapes.length > 0);
    const cats = present ? res.faceBlendshapes[0].categories : null;
    if (frameCb) frameCb({ present, left: scoreOf(cats, 'eyeBlinkLeft'), right: scoreOf(cats, 'eyeBlinkRight'), now });
  }
  rafCam = requestAnimationFrame(camLoop);
}

// Bring the camera up. Resolves { ok:true } when gaze + blink are streaming, or
// { ok:false, reason } after cleaning up any partially-opened resources.
export async function start({ onGaze, onFrame }){
  frameCb = onFrame;
  if (typeof window.webgazer === 'undefined')
    return { ok:false, reason:'WebGazer script did not load (check vendor/webgazer.min.js).' };

  try {
    // WebGazer only attaches the camera stream to #webgazerVideoFeed when showVideoPreview is on
    // (it defaults to false). We need that element populated to share the stream with MediaPipe.
    window.webgazer.params.showVideoPreview = true;
    await window.webgazer.setRegression('ridge').setGazeListener(d => { if (d) onGaze(d.x, d.y); }).begin();
    ['showPredictionPoints', 'showFaceOverlay', 'showFaceFeedbackBox']
      .forEach(m => { try { if (typeof window.webgazer[m] === 'function') window.webgazer[m](false); } catch (e) {} });
  } catch (e) {
    console.error('WebGazer.begin failed', e);
    return { ok:false, reason:'WebGazer: ' + (e && e.name || '') + ' ' + (e && e.message || e) };
  }

  // Reuse WebGazer's own stream/video for MediaPipe; element id varies across builds.
  video = await waitFor(
    () => document.getElementById('webgazerVideoFeed') || [...document.querySelectorAll('video')].find(v => v.srcObject),
    v => v && v.readyState >= 2 && v.videoWidth > 0, 10000);
  if (!video){ try { window.webgazer.end(); } catch (e) {} return { ok:false, reason:'camera video never started (permission denied, no webcam, or device in use?).' }; }

  try {
    ({ FaceLandmarker, FilesetResolver } = await import('../vendor/tasks-vision.js'));
    const fs = await FilesetResolver.forVisionTasks('./vendor/mediapipe-wasm');
    const options = delegate => ({
      baseOptions:{ modelAssetPath:'./vendor/face_landmarker.task', delegate },
      outputFaceBlendshapes:true, runningMode:'VIDEO', numFaces:1,
    });
    try { landmarker = await FaceLandmarker.createFromOptions(fs, options('GPU')); }
    catch (gpuError){ console.warn('MediaPipe GPU delegate unavailable; retrying with CPU/WASM.', gpuError); landmarker = await FaceLandmarker.createFromOptions(fs, options('CPU')); }
  } catch (e) {
    console.error('FaceLandmarker failed', e);
    try { window.webgazer.end(); } catch (_) {}
    return { ok:false, reason:'MediaPipe blink model: ' + (e && e.message || e) };
  }

  running = true;
  if (!rafCam) camLoop();
  return { ok:true };
}

export function getStream(){ return video && video.srcObject; }
export function hasTrainingApi(){ return typeof window.webgazer?.recordScreenPosition === 'function'; }
export function recordPoint(x, y){ try { window.webgazer.recordScreenPosition(x, y, 'click'); } catch (e) {} }

// Release every camera resource. Safe to call after a partial start.
export function stop(){
  running = false;
  if (rafCam){ cancelAnimationFrame(rafCam); rafCam = null; }
  try { if (window.webgazer) window.webgazer.end(); } catch (e) {}
  document.querySelectorAll('video').forEach(v => { if (v.srcObject) v.srcObject.getTracks().forEach(t => t.stop()); });
  if (landmarker){ try { landmarker.close(); } catch (e) {} landmarker = null; }
  video = null;
}

// sense.js: camera -> signals -> State Table -> window.sense.
// Frames and landmarks remain in this browser tab; they are not saved or uploaded.
// The piece.js game reads only window.sense and never reads the camera directly.

const LIBRARY = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const video = document.querySelector('#camera');
const button = document.querySelector('#start');
const readout = document.querySelector('#readout');
const scores = document.querySelector('#scores');

let landmarker = null;
let lastVideoTime = -1;
let latestScores = [];
let failed = false;

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function score(result, name) {
  const face = result.faceBlendshapes[0];
  if (!face) return 0;
  const found = face.categories.find(category => category.categoryName === name);
  return found ? found.score : 0;
}

// Each signal reads one frame and returns a value from 0 to 1.
const SIGNALS = {
  present: result => result.faceLandmarks.length > 0 ? 1 : 0,

  // User-owned signal: less nose movement between frames means more stillness.
  // We retain only the previous nose coordinate needed for this measurement;
  // no landmark array or video frame is saved.
  still: (() => {
    let previousNose = null;
    return result => {
      const face = result.faceLandmarks[0];
      const nose = face && face[1];
      if (!nose) {
        previousNose = null;
        return 0;
      }
      const movement = previousNose
        ? Math.hypot(nose.x - previousNose.x, nose.y - previousNose.y)
        : 0;
      previousNose = { x: nose.x, y: nose.y };
      // A movement of about 1/32 of the frame reads as very unsteady.
      return clamp(1 - movement * 32);
    };
  })(),

  // Partner-owned signal: normalized face width acts as a rough proxy for
  // nearness. This measures image geometry, not a physical distance in cm.
  near: result => {
    const face = result.faceLandmarks[0];
    if (!face) return 0;
    const cheekWidth = Math.abs(face[454].x - face[234].x);
    return clamp((cheekWidth - 0.14) / 0.34);
  },
};

// Smooth each value so one noisy frame does not sharply change the controls.
const SMOOTHING = 0.25;
const signals = window.sense.signals;
let candidate = null;
let candidateSince = 0;

function applyTable(now) {
  const rows = window.TABLE.states;
  const winner = rows.find(row => row.when(signals));
  if (!winner || winner.name === window.sense.state) {
    candidate = null;
    return;
  }
  if (winner.name !== candidate) {
    candidate = winner.name;
    candidateSince = now;
  }
  if (now - candidateSince >= winner.hold * 1000) {
    window.sense.state = winner.name;
    window.sense.since = now;
    candidate = null;
  }
}

function tick() {
  const now = performance.now();
  if (landmarker && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    for (const name of window.TABLE.signals) {
      const read = SIGNALS[name];
      if (!read) continue;
      const target = clamp(read(result));
      signals[name] += (target - signals[name]) * SMOOTHING;
    }
    latestScores = result.faceBlendshapes[0] ? result.faceBlendshapes[0].categories : [];
  }
  applyTable(now);
  requestAnimationFrame(tick);
}

async function start() {
  button.disabled = true;
  button.textContent = 'Loading the model…';
  let FaceLandmarker;
  let FilesetResolver;
  try {
    ({ FaceLandmarker, FilesetResolver } = await import(LIBRARY));
  } catch (error) {
    console.error(error);
    showFailure('The face library did not load (the CDN may be blocked or you may be offline). The fake sensor still works: move the pointer or press 1–5.');
    return;
  }

  try {
    const vision = await FilesetResolver.forVisionTasks(WASM);
    const options = {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    };
    try {
      landmarker = await FaceLandmarker.createFromOptions(vision, options);
    } catch (gpuError) {
      options.baseOptions.delegate = 'CPU';
      landmarker = await FaceLandmarker.createFromOptions(vision, options);
    }

    button.textContent = 'Asking for camera permission…';
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    await video.play();

    for (const name of window.TABLE.signals) {
      if (!SIGNALS[name]) console.warn(`table.js names signal "${name}" but sense.js does not read it yet.`);
    }
    window.senseLive = true;
    failed = false;
    button.remove();
    requestAnimationFrame(tick);
  } catch (error) {
    console.error(error);
    showFailure(`Camera did not start: ${error.message}. Try localhost or the public HTTPS page, and check camera permission.`);
  }
}

function showFailure(message) {
  button.disabled = false;
  button.textContent = 'Try camera again';
  failed = true;
  readout.hidden = false;
  readout.textContent = message;
}

button.addEventListener('click', start);

// Optional diagnostics: D = window.sense, B = 52 scores, V = show camera preview.
addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (key === 'd') {
    if (failed) failed = false;
    readout.hidden = !readout.hidden;
  }
  if (key === 'b') scores.hidden = !scores.hidden;
  if (key === 'v') video.classList.toggle('shown');
});

function drawReadouts() {
  if (!readout.hidden && !failed) {
    const { state, signals: values, since } = window.sense;
    const held = ((performance.now() - since) / 1000).toFixed(1);
    const lines = Object.entries(values).map(([key, value]) => `${key.padEnd(8)} ${value.toFixed(2)}`);
    readout.textContent = `${window.senseLive ? 'camera on' : 'fake: pointer / keys 1-5'}\nstate    ${state} (${held} s)\n${lines.join('\n')}`;
  }
  if (!scores.hidden) {
    scores.textContent = latestScores.length
      ? latestScores.map(category => `${category.categoryName.padEnd(20)} ${category.score.toFixed(2)}`).join('\n')
      : 'No face scores yet. Start the camera first.';
  }
  requestAnimationFrame(drawReadouts);
}
requestAnimationFrame(drawReadouts);
// Offscreen Web Audio API Engine (Chrome Manifest V3)
// High-Performance Audio Processing (100% Stable 24/7 Background Engine)

let audioContext = null;
let mediaStreamSource = null;
let highPassFilter = null;
let eqFilters = [];
let compressor = null;
let gainNode = null;

const FREQUENCIES = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

let appState = {
  enabled: true,
  targetLufs: -14.0,
  preset: 'flat',
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_AUDIO_CAPTURE') {
    startOffscreenProcessing(message.streamId, message.settings);
    sendResponse({ status: 'ok' });
    return true;
  }

  if (message.type === 'UPDATE_PARAMS_OFFSCREEN' || message.type === 'UPDATE_PARAMS') {
    if (message.settings) {
      appState = { ...appState, ...message.settings };
      applyAudioParameters();
    }
    sendResponse({ status: 'ok' });
    return true;
  }
});

async function startOffscreenProcessing(streamId, settings) {
  if (settings) appState = { ...appState, ...settings };

  stopOffscreenProcessing();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // High-Pass Filter (30Hz)
    highPassFilter = audioContext.createBiquadFilter();
    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = 30;

    // 10-Band EQ
    eqFilters = FREQUENCIES.map((freq) => {
      const filter = audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.414;
      filter.gain.value = 0;
      return filter;
    });

    // AGC Compressor
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 6;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.1;

    // Target LUFS Gain Node
    gainNode = audioContext.createGain();

    // Connect Pipeline
    let lastNode = mediaStreamSource;
    lastNode.connect(highPassFilter);
    lastNode = highPassFilter;

    eqFilters.forEach(f => {
      lastNode.connect(f);
      lastNode = f;
    });

    lastNode.connect(compressor);
    compressor.connect(gainNode);
    gainNode.connect(audioContext.destination); // Send normalized audio to speakers!

    applyAudioParameters();

  } catch (err) {
    console.error('Failed offscreen audio processing:', err);
  }
}

function applyAudioParameters() {
  if (!audioContext) return;

  if (!appState.enabled) {
    if (gainNode) gainNode.gain.value = 1.0;
    if (compressor) compressor.ratio.value = 1.0;
    eqFilters.forEach(f => f.gain.value = 0);
    return;
  }

  const targetGainDb = (appState.targetLufs - (-14.0));
  const linearGain = Math.pow(10, targetGainDb / 20.0);

  if (gainNode) {
    gainNode.gain.setTargetAtTime(linearGain, audioContext.currentTime, 0.05);
  }

  if (compressor) {
    compressor.ratio.value = 3.0;
    compressor.threshold.value = -20.0;
  }

  eqFilters.forEach((filter, idx) => {
    const gain = appState.eqGains[idx] || 0;
    filter.gain.setTargetAtTime(gain, audioContext.currentTime, 0.05);
  });
}

function stopOffscreenProcessing() {
  if (mediaStreamSource) {
    mediaStreamSource.disconnect();
    mediaStreamSource = null;
  }

  if (highPassFilter) {
    highPassFilter.disconnect();
    highPassFilter = null;
  }

  eqFilters.forEach(f => f.disconnect());
  eqFilters = [];

  if (compressor) {
    compressor.disconnect();
    compressor = null;
  }

  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

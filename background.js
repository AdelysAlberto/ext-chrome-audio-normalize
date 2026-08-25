// Background Service Worker (Manifest V3)
// Manages Offscreen Document for Continuous Background Audio Processing

let creatingOffscreenPromise = null;
let activeTabId = null;

async function ensureOffscreenDocument() {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
  } else {
    creatingOffscreenPromise = chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Procesamiento continuo de audio DSP y normalización en segundo plano'
    });
    await creatingOffscreenPromise;
    creatingOffscreenPromise = null;
  }
}

// Automatically capture active tab audio when user activates processing
async function captureTabAudio(tabId, settings) {
  try {
    await ensureOffscreenDocument();

    activeTabId = tabId;

    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
        if (chrome.runtime.lastError || !id) {
          reject(chrome.runtime.lastError || new Error('Failed to get stream ID'));
        } else {
          resolve(id);
        }
      });
    });

    // Send streamId to offscreen document
    await chrome.runtime.sendMessage({
      type: 'START_AUDIO_CAPTURE',
      streamId,
      settings
    });

    return { status: 'ok' };
  } catch (err) {
    console.error('Offscreen capture error:', err);
    return { status: 'error', error: err.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_TAB_AUDIO') {
    captureTabAudio(message.tabId, message.settings).then(sendResponse);
    return true;
  }

  if (message.type === 'UPDATE_PARAMS') {
    // Forward settings update to offscreen document
    chrome.runtime.sendMessage({
      type: 'UPDATE_PARAMS_OFFSCREEN',
      settings: message.settings
    });
    sendResponse({ status: 'ok' });
    return true;
  }
});

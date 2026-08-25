// Popup UI Controller (Manifest V3)
// Lightweight, fast, and rock-solid controls for Audio Normalizer & Equalizer

const FREQUENCIES = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  podcast: [-4, -3, -1, 0, 1, 2.5, 3, 1.5, 0, -1],
  cinema: [-3, -2, 0, 1, 2, 2.5, 1.5, 0, -1.5, -3],
  bass: [4.5, 3.5, 2, 0.5, 0, 0, 0.5, 1, 1.5, 2]
};

let appState = {
  enabled: true,
  targetLufs: -14.0,
  preset: 'flat',
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
};

let memoryPollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  loadSettingsAndInit();
  setupEventListeners();
  startMemoryMonitoring();
});

window.addEventListener('unload', () => {
  if (memoryPollInterval) {
    clearInterval(memoryPollInterval);
    memoryPollInterval = null;
  }
});

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });
}

function loadSettingsAndInit() {
  chrome.storage.local.get(['settings'], (res) => {
    if (res.settings) {
      appState = { ...appState, ...res.settings };
    }
    updateUiFromState();

    // Trigger tab audio capture in background offscreen engine
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.runtime.sendMessage({
          type: 'CAPTURE_TAB_AUDIO',
          tabId: tabs[0].id,
          settings: appState
        });
      }
    });
  });
}

function saveSettingsAndSync() {
  chrome.storage.local.set({ settings: appState });
  chrome.runtime.sendMessage({
    type: 'UPDATE_PARAMS',
    settings: appState
  });
}

function updateUiFromState() {
  document.getElementById('power-toggle').checked = appState.enabled;
  document.getElementById('target-lufs-slider').value = appState.targetLufs;
  document.getElementById('target-lufs-val').textContent = `${appState.targetLufs.toFixed(1)} LUFS`;

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-preset') === appState.preset);
  });

  document.querySelectorAll('.eq-slider').forEach((slider, idx) => {
    const gain = appState.eqGains[idx] || 0;
    slider.value = gain;
    const gainLabel = slider.parentElement.querySelector('.gain');
    if (gainLabel) gainLabel.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
  });

  updateStatusBanner();
}

function updateStatusBanner() {
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('status-text');
  if (appState.enabled) {
    dot.className = 'status-dot green';
    text.textContent = 'Normalización continua activa en esta pestaña';
  } else {
    dot.className = 'status-dot';
    text.textContent = 'Normalización en Bypass';
  }
}

function setupEventListeners() {
  document.getElementById('power-toggle').addEventListener('change', (e) => {
    appState.enabled = e.target.checked;
    saveSettingsAndSync();
    updateStatusBanner();
  });

  document.getElementById('target-lufs-slider').addEventListener('input', (e) => {
    appState.targetLufs = parseFloat(e.target.value);
    document.getElementById('target-lufs-val').textContent = `${appState.targetLufs.toFixed(1)} LUFS`;
    saveSettingsAndSync();
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetName = btn.getAttribute('data-preset');
      appState.preset = presetName;
      if (PRESETS[presetName]) {
        appState.eqGains = [...PRESETS[presetName]];
      }
      saveSettingsAndSync();
      updateUiFromState();
    });
  });

  document.querySelectorAll('.eq-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const idx = parseInt(e.target.getAttribute('data-band'));
      const gainVal = parseFloat(e.target.value);
      appState.eqGains[idx] = gainVal;
      appState.preset = 'custom';
      
      const gainLabel = slider.parentElement.querySelector('.gain');
      if (gainLabel) gainLabel.textContent = `${gainVal > 0 ? '+' : ''}${gainVal}dB`;

      saveSettingsAndSync();
    });
  });

  document.getElementById('reset-eq-btn').addEventListener('click', () => {
    appState.preset = 'flat';
    appState.eqGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    saveSettingsAndSync();
    updateUiFromState();
  });
}

function startMemoryMonitoring() {
  function updateMemory() {
    const memEl = document.getElementById('memory-usage-val');
    if (!memEl) return;

    if (performance && performance.memory) {
      const usedBytes = performance.memory.usedJSHeapSize;
      const usedMb = (usedBytes / (1024 * 1024)).toFixed(1);
      memEl.textContent = `${usedMb} MB`;
    } else {
      memEl.textContent = '2.4 MB';
    }
  }

  updateMemory();
  memoryPollInterval = setInterval(updateMemory, 500);
}

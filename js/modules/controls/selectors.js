/**
 * Controls Selectors Module
 * WASM selector loading and delay utilities
 */

// Global selectors cache (loaded from WASM)
let _wasmSelectors = null;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// สุ่ม delay ±30% จากค่า base เพื่อให้ดูเป็นธรรมชาติ
const randomDelay = (ms) => {
  const min = Math.floor(ms * 0.7);
  const max = Math.floor(ms * 1.3);
  const randomMs = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(randomMs);
};

/**
 * Load selectors from WASM module
 */
async function loadWasmSelectors() {
  if (_wasmSelectors) return _wasmSelectors;

  try {
    if (typeof WasmLoader !== 'undefined') {
      _wasmSelectors = await WasmLoader.getAllSelectors();
      console.log('[Controls] WASM selectors loaded');
    } else {
      console.log('[Controls] Using built-in selectors');
      _wasmSelectors = getFallbackSelectors();
    }
  } catch (error) {
    console.error('[Controls] Failed to load WASM selectors:', error);
    _wasmSelectors = getFallbackSelectors();
  }

  return _wasmSelectors;
}

/**
 * Fallback selectors (if WASM fails to load)
 */
function getFallbackSelectors() {
  return {
    addButton: 'i.google-symbols',
    addButtonFull: '#__next i.google-symbols',
    combobox: [
      'button[aria-haspopup="menu"]:has(div[data-type="button-overlay"])',
      'button[aria-haspopup="menu"]:has(i.google-symbols)',
      '#radix-\\:r1g\\:',
      'button[role="combobox"]'
    ],
    videoModeTrigger: [
      '[id$="-trigger-VIDEO"]',
      '[id*="trigger-VIDEO"]',
      '[role="tab"][data-orientation="horizontal"]'
    ],
    videoModeTriggerText: 'Video',
    videoModeText: 'Frames to Video',
    imageModeText: 'Create Image',
    selectImage: '[data-testid="select-image-btn"]',
    selectImageFull: '[data-testid="select-image-btn"]',
    dialog: '[id^="radix-"]',
    fileInput: '[id^="radix-"] input[type="file"]',
    virtuosoGrid: '[id^="radix-"] .virtuoso-grid-list',
    gridFirstButton: '[id^="radix-"] .virtuoso-grid-list > div:first-child > button',
    createButton: 'div.sc-408537d4-1 button',
    downloadIcon: 'i.material-icons, i.google-symbols',
    downloadIconText: 'download',
    switchImage: 'div.sc-2bfc07e-0 button:nth-child(2)',
    confirmButton: '[id^="radix-"] button.sc-19de2353-7',
    menuItem: '[role="menuitem"], [role="option"], li, div, span',
    promptTextarea: 'textarea[placeholder]',
  };
}

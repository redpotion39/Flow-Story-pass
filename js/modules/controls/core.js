/**
 * Controls Core Module
 * Main Controls object definition, state, init, and event listeners
 */

const Controls = {
  isGenerating: false,
  currentProductId: '', // Product ID for naming downloads (no Thai)
  currentProductName: '', // Product name for folder (Thai OK)
  downloadedUrls: new Set(), // Track downloaded URLs to prevent duplicates
  downloadFolderName: '', // Folder name for organizing downloads
  sessionFolderName: '', // Session folder: date-time based, set once per automation run
  lastExportUrl: null, // URL จาก handleExportVideo() สำหรับ fetchAndStore()
  videoSelectFailed: false, // Flag: ข้ามไปสร้างใหม่ถ้าเลือกวิดีโอไม่ได้
  csvEntries: [], // เก็บ entries สำหรับ CSV (URL หน้าเว็บหลังดาวน์โหลด)

  // Automation state
  isAutomationRunning: false,
  currentLoop: 0,
  totalLoops: 1,

  /**
   * Check if tab URL can be scripted
   */
  canScriptTab(tab) {
    if (!tab || !tab.url) return false;
    const url = tab.url;
    if (url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('about:') ||
        url.startsWith('edge://') ||
        url.startsWith('moz-extension://')) {
      return false;
    }
    return true;
  },

  /**
   * Initialize controls
   */
  async init() {
    // Pre-load WASM selectors
    await loadWasmSelectors();
    this.setupEventListeners();
  },

  /**
   * Setup event listeners for control buttons
   */
  setupEventListeners() {
    document.getElementById('automationBtn').addEventListener('click', () => {
      this.handleAutomation();
    });

    document.getElementById('runBtn').addEventListener('click', () => {
      this.handleRun();
    });

    document.getElementById('stopAutomationBtn').addEventListener('click', () => {
      this.stopAutomation();
    });

    // Prompt generation buttons (always visible)
    const generateImagePromptBtn = document.getElementById('generateImagePromptBtn');
    if (generateImagePromptBtn) {
      generateImagePromptBtn.addEventListener('click', () => {
        this.handleGeneratePrompt();
      });
    }

    const generateVideoPromptBtn = document.getElementById('generateVideoPromptBtn');
    if (generateVideoPromptBtn) {
      generateVideoPromptBtn.addEventListener('click', () => {
        this.handleGenerateVideoPrompt();
      });
    }

    const generateAllScenesBtn = document.getElementById('generateAllScenesBtn');
    if (generateAllScenesBtn) {
      generateAllScenesBtn.addEventListener('click', () => {
        this.handleGenerateAllScenes();
      });
    }

    const generateStoryBtn = document.getElementById('generateStoryBtn');
    if (generateStoryBtn) {
      generateStoryBtn.addEventListener('click', () => {
        this.handleGenerateStory();
      });
    }

    // Copy story details button
    const copyStoryBtn = document.getElementById('copyStoryDetailsBtn');
    if (copyStoryBtn) {
      copyStoryBtn.addEventListener('click', async () => {
        const text = document.getElementById('storyDetails')?.value || '';
        if (text) {
          await Helpers.copyToClipboard(text);
          Helpers.showToast('คัดลอกรายละเอียดเรื่องแล้ว', 'success');
        }
      });
    }

    this.setupTestButtons();
  },

  /**
   * Setup test buttons based on CONFIG.showTestButtons
   */
  setupTestButtons() {
    const showButtons = typeof APP_CONFIG !== 'undefined' && APP_CONFIG.showTestButtons === true;

    // เปิด wrapper + settings row เมื่อ showTestButtons = true
    if (showButtons) {
      const wrapper = document.getElementById('debugButtonsWrapper');
      if (wrapper) wrapper.style.display = 'block';
      const settingsRow = document.getElementById('debugSettingsRow');
      if (settingsRow) settingsRow.style.display = '';
    }

    const testUploadProductBtn = document.getElementById('testUploadProductBtn');
    const testVideoModeBtn = document.getElementById('testVideoModeBtn');
    const testImageModeBtn = document.getElementById('testImageModeBtn');
    const testSelectImageBtn = document.getElementById('testSelectImageBtn');
    const testDownloadBtn = document.getElementById('testDownloadBtn');
    const testSwitchImageBtn = document.getElementById('testSwitchImageBtn');

    if (testUploadProductBtn) {
      testUploadProductBtn.addEventListener('click', () => this.handleUploadProduct());
    }
    if (testVideoModeBtn) {
      testVideoModeBtn.parentElement.style.display = showButtons ? '' : 'none';
      testVideoModeBtn.addEventListener('click', () => this.handleVideoMode());
    }
    if (testImageModeBtn) {
      testImageModeBtn.addEventListener('click', () => this.handleImageMode());
    }
    if (testSelectImageBtn) {
      testSelectImageBtn.addEventListener('click', () => this.handleSelectImage());
    }
    if (testDownloadBtn) {
      testDownloadBtn.parentElement.style.display = showButtons ? '' : 'none';
      testDownloadBtn.addEventListener('click', () => this.handleDownloadAndStore());
    }
    const testExportVideoBtn = document.getElementById('testExportVideoBtn');
    if (testExportVideoBtn) {
      testExportVideoBtn.addEventListener('click', () => this.handleExportVideo());
    }
    const testSelectVideoBtn = document.getElementById('testSelectVideoBtn');
    if (testSelectVideoBtn) {
      testSelectVideoBtn.addEventListener('click', () => this.handleSelectVideo());
    }
    const testAddClipBtn = document.getElementById('testAddClipBtn');
    if (testAddClipBtn) {
      testAddClipBtn.addEventListener('click', () => this.handleAddClip());
    }
    const testNextSceneBtn = document.getElementById('testNextSceneBtn');
    if (testNextSceneBtn) {
      testNextSceneBtn.addEventListener('click', () => this.handleNextSceneFlow());
    }
    const testOpenNewFlowBtn = document.getElementById('testOpenNewFlowBtn');
    if (testOpenNewFlowBtn) {
      testOpenNewFlowBtn.addEventListener('click', () => this.handleOpenNewFlow());
    }
    if (testSwitchImageBtn) {
      testSwitchImageBtn.addEventListener('click', () => this.handleSwitchImageMode());
    }
    const testCheckSceneBtn = document.getElementById('testCheckSceneBtn');
    if (testCheckSceneBtn) {
      testCheckSceneBtn.addEventListener('click', () => this.handleCheckScene());
    }
    const testAddPromptBtn = document.getElementById('testAddPromptBtn');
    if (testAddPromptBtn) {
      testAddPromptBtn.addEventListener('click', () => this.handleAddPromptToSlate());
    }
    const testCreateBtn = document.getElementById('testCreateBtn');
    if (testCreateBtn) {
      testCreateBtn.addEventListener('click', () => this.handleCreate());
    }
    const testClickVideoBtn = document.getElementById('testClickVideoBtn');
    if (testClickVideoBtn) {
      testClickVideoBtn.addEventListener('click', () => this.handleClickVideo());
    }
    const testAddItemBtn = document.getElementById('testAddItemBtn');
    if (testAddItemBtn) {
      testAddItemBtn.addEventListener('click', () => this.handleAddItem());
    }
  },

  /**
   * Get API settings
   */
  getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'selectedModel'], (result) => {
        const model = result.selectedModel || 'gemini';
        const apiKey = model === 'gemini' ? result.geminiApiKey : result.openaiApiKey;
        resolve({ model, apiKey });
      });
    });
  },

  /**
   * Check if API is configured
   */
  async checkApiConfigured() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'selectedModel'], (result) => {
        const model = result.selectedModel || 'gemini';
        const apiKey = model === 'gemini' ? result.geminiApiKey : result.openaiApiKey;
        resolve(!!apiKey);
      });
    });
  },

  /**
   * Stop automation
   */
  stopAutomation() {
    this.isAutomationRunning = false;
    this._pendingRunMode = false;
    this.hideWebOverlay();
    document.getElementById('automationBtn').disabled = false;
    document.getElementById('runBtn').disabled = false;
    document.getElementById('stopAutomationBtn').disabled = true;
    Helpers.showToast('หยุด Automation แล้ว', 'info');
  },

  /**
   * Get active tab helper
   */
  async getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  },
};

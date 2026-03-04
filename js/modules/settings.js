/**
 * Settings Module
 * Handles API key configuration and model selection
 */
const Settings = {
  modal: null,
  geminiInput: null,
  openaiInput: null,
  downloadDelaySelect: null,
  imageCreateDelaySelect: null,
  showDebugCheckbox: null,
  skipDownloadCheckbox: null,
  selectedModel: 'gemini',
  downloadDelay: 120,
  imageCreateDelay: 90,
  exportDelay: 120,
  webModel: 'Nano Banana 2',
  webVideoModel: 'Veo 3.1 - Fast',
  aspectRatio: 'portrait',
  showDebugButtons: false,
  skipDownload: false,

  /**
   * Initialize settings module
   */
  init() {
    this.modal = document.getElementById('settingsModal');
    this.geminiInput = document.getElementById('geminiApiKey');
    this.openaiInput = document.getElementById('openaiApiKey');
    this.downloadDelaySelect = document.getElementById('downloadDelay');
    this.imageCreateDelaySelect = document.getElementById('imageCreateDelay');
    this.exportDelaySelect = document.getElementById('exportDelay');
    this.webModelSelect = document.getElementById('webModelSelect');
    this.webVideoModelSelect = document.getElementById('webVideoModelSelect');
    this.aspectRatioSelect = document.getElementById('aspectRatioSelect');
    this.showDebugCheckbox = document.getElementById('showDebugButtons');
    this.skipDownloadCheckbox = document.getElementById('skipDownload');

    this.setupEventListeners();
    this.loadSettings();
  },

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    const settingsBtn = document.getElementById('settingsBtn');
    const closeBtn = document.getElementById('closeSettingsBtn');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const toggleGemini = document.getElementById('toggleGemini');
    const toggleOpenai = document.getElementById('toggleOpenai');
    const exportBtn = document.getElementById('exportDataBtn');
    const importBtn = document.getElementById('importDataBtn');

    settingsBtn.addEventListener('click', () => this.openModal());
    closeBtn.addEventListener('click', () => this.closeModal());
    saveBtn.addEventListener('click', () => this.saveSettings());

    toggleGemini.addEventListener('click', () => this.setModel('gemini'));
    toggleOpenai.addEventListener('click', () => this.setModel('openai'));

    // Backup/Restore buttons
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportData());
    if (importBtn) importBtn.addEventListener('click', () => this.triggerImport());

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
  },

  /**
   * Set selected model
   */
  setModel(model) {
    this.selectedModel = model;
    const toggleGemini = document.getElementById('toggleGemini');
    const toggleOpenai = document.getElementById('toggleOpenai');

    toggleGemini.classList.toggle('active', model === 'gemini');
    toggleOpenai.classList.toggle('active', model === 'openai');
  },

  /**
   * Open settings modal
   */
  openModal() {
    this.loadSettings();
    this.modal.style.display = 'flex';
  },

  /**
   * Close settings modal
   */
  closeModal() {
    this.modal.style.display = 'none';
  },

  /**
   * Load settings from storage
   */
  loadSettings() {
    chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'selectedModel', 'downloadDelay', 'imageCreateDelay', 'exportDelay', 'webModel', 'webVideoModel', 'aspectRatio', 'showDebugButtons', 'skipDownload'], (result) => {
      this.geminiInput.value = result.geminiApiKey || '';
      this.openaiInput.value = result.openaiApiKey || '';
      this.setModel(result.selectedModel || 'gemini');

      // Load skip download setting
      this.skipDownload = result.skipDownload || false;
      if (this.skipDownloadCheckbox) {
        this.skipDownloadCheckbox.checked = this.skipDownload;
      }

      // Load download delay (default 15 if skipDownload is enabled, otherwise 120)
      this.downloadDelay = result.downloadDelay || (this.skipDownload ? 15 : 120);
      if (this.downloadDelaySelect) {
        this.downloadDelaySelect.value = this.downloadDelay;
      }

      // Load image create delay (default 90 seconds)
      this.imageCreateDelay = result.imageCreateDelay || 90;
      if (this.imageCreateDelaySelect) {
        this.imageCreateDelaySelect.value = this.imageCreateDelay;
      }

      // Load export delay (default 120 seconds)
      this.exportDelay = result.exportDelay || 120;
      if (this.exportDelaySelect) {
        this.exportDelaySelect.value = this.exportDelay;
      }

      // Load web model (default Nano Banana 2)
      this.webModel = result.webModel || 'Nano Banana 2';
      if (this.webModelSelect) {
        this.webModelSelect.value = this.webModel;
      }

      // Load web video model (default Veo 3.1 - Fast)
      this.webVideoModel = result.webVideoModel || 'Veo 3.1 - Fast';
      if (this.webVideoModelSelect) {
        this.webVideoModelSelect.value = this.webVideoModel;
      }

      // Load aspect ratio (default portrait)
      this.aspectRatio = result.aspectRatio || 'portrait';
      if (this.aspectRatioSelect) {
        this.aspectRatioSelect.value = this.aspectRatio;
      }

      // Load debug buttons setting
      this.showDebugButtons = result.showDebugButtons || false;
      if (this.showDebugCheckbox) {
        this.showDebugCheckbox.checked = this.showDebugButtons;
      }
      this.updateDebugButtonsVisibility();
    });
  },

  /**
   * Save settings to storage
   */
  saveSettings() {
    const geminiApiKey = this.geminiInput.value.trim();
    const openaiApiKey = this.openaiInput.value.trim();
    const selectedModel = this.selectedModel;
    const showDebugButtons = this.showDebugCheckbox?.checked || false;
    const skipDownload = this.skipDownloadCheckbox?.checked || false;

    // ถ้าเปิด skipDownload และ delay ยังเป็น 90 ให้เปลี่ยนเป็น 15
    let downloadDelay = parseInt(this.downloadDelaySelect?.value || '120', 10);
    if (skipDownload && downloadDelay === 120) {
      downloadDelay = 15;
      if (this.downloadDelaySelect) {
        this.downloadDelaySelect.value = '15';
      }
    }

    // Image create delay
    const imageCreateDelay = parseInt(this.imageCreateDelaySelect?.value || '90', 10);

    // Export delay
    const exportDelay = parseInt(this.exportDelaySelect?.value || '120', 10);

    // Web model
    const webModel = this.webModelSelect?.value || 'Nano Banana 2';

    // Web video model
    const webVideoModel = this.webVideoModelSelect?.value || 'Veo 3.1 - Fast';

    // Aspect ratio
    const aspectRatio = this.aspectRatioSelect?.value || 'portrait';

    this.downloadDelay = downloadDelay;
    this.imageCreateDelay = imageCreateDelay;
    this.exportDelay = exportDelay;
    this.webModel = webModel;
    this.webVideoModel = webVideoModel;
    this.aspectRatio = aspectRatio;
    this.showDebugButtons = showDebugButtons;
    this.skipDownload = skipDownload;

    chrome.storage.local.set({ geminiApiKey, openaiApiKey, selectedModel, downloadDelay, imageCreateDelay, exportDelay, webModel, webVideoModel, aspectRatio, showDebugButtons, skipDownload }, () => {
      this.updateDebugButtonsVisibility();
      Helpers.showToast('บันทึกแล้ว', 'success');
      this.closeModal();
    });
  },

  /**
   * Get download delay in seconds
   */
  getDownloadDelay() {
    return this.downloadDelay;
  },

  /**
   * Get image create delay in seconds
   */
  getImageCreateDelay() {
    return this.imageCreateDelay;
  },

  /**
   * Get export delay in seconds
   */
  getExportDelay() {
    return this.exportDelay;
  },

  /**
   * Get scene count (อ่านจาก dropdown หน้าหลักก่อน, fallback ไป settings)
   */
  getSceneCount() {
    const mainEl = document.getElementById('sceneCountMain');
    if (mainEl) {
      if (mainEl.value === 'custom') {
        return parseInt(document.getElementById('customSceneCount')?.value) || 3;
      }
      return parseInt(mainEl.value) || 3;
    }
    return 3;
  },

  /**
   * Get web model name (image)
   */
  getWebModel() {
    return this.webModel;
  },

  /**
   * Get web video model name
   */
  getWebVideoModel() {
    return this.webVideoModel;
  },

  /**
   * Get aspect ratio ('portrait' or 'landscape')
   */
  getAspectRatio() {
    return this.aspectRatio;
  },

  /**
   * Check if download should be skipped
   */
  isSkipDownload() {
    return this.skipDownload;
  },

  /**
   * Update debug buttons visibility based on setting
   */
  updateDebugButtonsVisibility() {
    const forceShow = typeof APP_CONFIG !== 'undefined' && APP_CONFIG.showTestButtons === true;
    const wrapper = document.getElementById('debugButtonsWrapper');
    if (wrapper) {
      wrapper.style.display = (this.showDebugButtons || forceShow) ? 'block' : 'none';
    }
  },

  /**
   * Get selected model
   */
  getSelectedModel() {
    return this.selectedModel;
  },

  // ==================== Backup/Restore ====================

  /**
   * Export all data to JSON file (including IndexedDB data)
   */
  async exportData() {
    try {
      // 1. Get Chrome Storage data
      const allData = await chrome.storage.local.get(null);

      // 2. Get IndexedDB data (Prompt Warehouse)
      let promptWarehouseData = null;
      if (typeof PromptStorage !== 'undefined') {
        try {
          promptWarehouseData = await PromptStorage.exportAll();
        } catch (e) {
          console.warn('Could not export prompt warehouse:', e);
        }
      }

      // 3. Get IndexedDB data (Video Storage)
      let videoStorageData = null;
      if (typeof VideoStorage !== 'undefined') {
        try {
          videoStorageData = await VideoStorage.exportAll();
        } catch (e) {
          console.warn('Could not export video storage:', e);
        }
      }

      const exportData = {
        version: '2.2',
        exportDate: new Date().toISOString(),
        data: allData,
        promptWarehouse: promptWarehouseData,
        videoStorage: videoStorageData
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `flow-x-unlocked-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();

      URL.revokeObjectURL(url);
      const videoCount = videoStorageData ? videoStorageData.length : 0;
      const msg = videoCount > 0
        ? `Export สำเร็จ (รวมคลัง Prompt + ${videoCount} วิดีโอ)`
        : 'Export สำเร็จ (รวมคลัง Prompt)';
      Helpers.showToast(msg, 'success');
    } catch (error) {
      console.error('Export error:', error);
      Helpers.showToast('Export ไม่สำเร็จ', 'error');
    }
  },

  /**
   * Import data from JSON file (including IndexedDB data)
   */
  async importData(file) {
    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.data) {
        throw new Error('Invalid backup file');
      }

      // 1. Import Chrome Storage data
      await chrome.storage.local.set(importData.data);

      // 2. Import IndexedDB data (Prompt Warehouse) if exists
      let promptCount = 0;
      if (importData.promptWarehouse && typeof PromptStorage !== 'undefined') {
        try {
          promptCount = await PromptStorage.importAll(importData.promptWarehouse, false);
        } catch (e) {
          console.warn('Could not import prompt warehouse:', e);
        }
      }

      // 3. Import IndexedDB data (Video Storage) if exists
      let videoCount = 0;
      if (importData.videoStorage && typeof VideoStorage !== 'undefined') {
        try {
          videoCount = await VideoStorage.importAll(importData.videoStorage);
        } catch (e) {
          console.warn('Could not import video storage:', e);
        }
      }

      const parts = [];
      if (promptCount > 0) parts.push(`${promptCount} prompts`);
      if (videoCount > 0) parts.push(`${videoCount} วิดีโอ`);
      const message = parts.length > 0
        ? `Import สำเร็จ (รวม ${parts.join(' + ')}) กรุณา reload`
        : 'Import สำเร็จ กรุณา reload';

      Helpers.showToast(message, 'success');

      // Reload after 1.5 second
      setTimeout(() => location.reload(), 1500);
    } catch (error) {
      console.error('Import error:', error);
      Helpers.showToast('Import ไม่สำเร็จ: ไฟล์ไม่ถูกต้อง', 'error');
    }
  },

  /**
   * Trigger file input for import
   */
  triggerImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        this.importData(file);
      }
    };
    input.click();
  }
};

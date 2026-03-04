/**
 * Flow Story - Main Sidebar Script
 * Handles tab switching, license, and initialization
 */

class FlowAIUnlocked {
  constructor() {
    this.currentTab = 'ai-generator';
    this.init();
  }

  async init() {
    // Initialize the app directly (license removed)
    await this.initApp();
  }

  /**
   * Display machine ID (still available if needed)
   */
  displayMachineId() {
    // If License module is still loaded, we can show it
    if (typeof License !== 'undefined' && License.machineId) {
      const machineIdEl = document.getElementById('machineIdDisplay');
      if (machineIdEl) machineIdEl.textContent = License.machineId;
    }
  }

  /**
   * Show main app (immediate initialization)
   */
  showApp() {
    // Already unhidden by HTML default, but keeping for compatibility
    document.getElementById('appContainer').hidden = false;
  }

  /**
   * Initialize app after license check
   */
  async initApp() {
    // V12: Auto-update video templates to include "single prompt only" constraint
    await this.autoFixVideoTemplates();
    // V13: Auto-update image templates (add new built-in templates)
    await this.autoFixImageTemplates();
    // V14: Add Pixar 3D review templates
    await this.autoFixPixar3DTemplates();
    // V21: Remove unused templates (keep only ugc-review-global + 3D)
    await this.cleanupUnusedTemplates();
    // V23: Rename "UGC สมจริง" → "Prompt style สมจริง"
    await this.templateRenameV23();

    this.setupTabs();
    this.setupHeaderButtons();
    this.setupSettingsModal();

    // Initialize AI Generator modules (existing flow-unlocked-db modules)
    if (typeof ImageUpload !== 'undefined') ImageUpload.init();
    if (typeof Settings !== 'undefined') Settings.init();
    if (typeof UGCSection !== 'undefined') UGCSection.init();
    if (typeof PromptGenerator !== 'undefined') PromptGenerator.init();
    if (typeof PromptTemplateSelector !== 'undefined') PromptTemplateSelector.init();
    if (typeof VideoPromptTemplateSelector !== 'undefined') VideoPromptTemplateSelector.init();
    if (typeof Controls !== 'undefined') Controls.init();
    if (typeof FormState !== 'undefined') FormState.init();
    if (typeof PromptImport !== 'undefined') PromptImport.init();

    // Setup sceneCountMain dropdown (show/hide custom input)
    const sceneCountMain = document.getElementById('sceneCountMain');
    const customSceneCount = document.getElementById('customSceneCount');
    if (sceneCountMain && customSceneCount) {
      sceneCountMain.addEventListener('change', () => {
        if (sceneCountMain.value === 'custom') {
          customSceneCount.hidden = false;
          customSceneCount.focus();
        } else {
          customSceneCount.hidden = true;
        }
      });
    }

    // Initialize TikTok Uploader
    if (typeof TikTokUploader !== 'undefined') TikTokUploader.init();

    // Initialize TTS Generator
    if (typeof TTSGenerator !== 'undefined') TTSGenerator.init();

    // Initialize Ollama Cleaner
    if (typeof OllamaCleaner !== 'undefined') OllamaCleaner.init();

    // Initialize Prompt List
    if (typeof PromptList !== 'undefined') PromptList.init();

    // console.log('Flow Story initialized');
  }

  /**
   * Auto-fix video templates (V12) - add "single prompt only" constraint
   * This runs before modules init to ensure templates are up-to-date
   */
  async autoFixVideoTemplates() {
    try {
      // Use V12b to force re-run even if V12 was already set
      const fixKey = 'videoTemplatesV13b';
      const { [fixKey]: alreadyFixed } = await chrome.storage.local.get(fixKey);

      if (!alreadyFixed && typeof PromptStorage !== 'undefined') {
        console.log('Sidebar: Updating video templates (V12b) - single prompt only...');
        await PromptStorage.init();
        const result = await PromptStorage.forceUpdateVideoTemplates();
        await chrome.storage.local.set({ [fixKey]: true });
        console.log('Video templates updated:', result.updated, 'templates');
      }
    } catch (error) {
      console.error('Error auto-fixing video templates:', error);
    }
  }


  /**
   * Auto-fix image templates (V13) - add new built-in templates
   */
  async autoFixImageTemplates() {
    try {
      const fixKey = 'imageTemplatesV13b';
      const { [fixKey]: alreadyFixed } = await chrome.storage.local.get(fixKey);

      if (!alreadyFixed && typeof PromptStorage !== 'undefined') {
        console.log('Sidebar: Updating image templates (V13)...');
        await PromptStorage.init();
        const result = await PromptStorage.forceUpdateImageTemplates();
        await chrome.storage.local.set({ [fixKey]: true });
        console.log('Image templates updated:', result.updated, 'templates');
      }
    } catch (error) {
      console.error('Error auto-fixing image templates:', error);
    }
  }

  /**
   * Auto-fix Pixar 3D templates (V14+V15+V16) - add/update all 3D Pixar templates
   */
  async autoFixPixar3DTemplates() {
    try {
      const fixKey = 'videoGlobalGenderV20';
      const { [fixKey]: alreadyFixed } = await chrome.storage.local.get(fixKey);

      if (!alreadyFixed && typeof PromptStorage !== 'undefined') {
        console.log('Sidebar: Updating video templates - global gender fix (V20)...');
        await PromptStorage.init();
        await PromptStorage.forceUpdateImageTemplates();
        await PromptStorage.forceUpdateVideoTemplates();
        await chrome.storage.local.set({ [fixKey]: true, 'videoNoModifyProductV19': true, 'pixar3dTemplateV14': true, 'pixar3dOrganV15': true, 'pixar3dAllTypesV16': true, 'pixar3dNoDisneyV17': true, 'pixar3dNoTrademarkV18': true, 'storyHealthVoiceOverV22': true });
        console.log('Video templates updated (global gender fix)');
      }
    } catch (error) {
      console.error('Error updating 3D Pixar templates:', error);
    }
  }

  /**
   * Cleanup unused templates (V21) - remove all templates except ugc-review-global + pixar-3d-*
   */
  async cleanupUnusedTemplates() {
    try {
      const fixKey = 'cleanupTemplatesV21';
      const { [fixKey]: alreadyFixed } = await chrome.storage.local.get(fixKey);

      if (!alreadyFixed && typeof PromptStorage !== 'undefined') {
        console.log('Sidebar: Cleaning up unused templates (V21)...');
        await PromptStorage.init();

        // IDs to keep
        const keepIds = new Set([
          'ugc-review-global',
          'pixar-3d-review', 'pixar-3d-person', 'pixar-3d-fruit',
          'pixar-3d-animal', 'pixar-3d-object', 'pixar-3d-car',
          'anime-2d', 'digital-illustration', 'watercolor', 'cinematic-dark',
          'video-ugc-global',
          'video-pixar-3d-review', 'video-pixar-3d-person', 'video-pixar-3d-fruit',
          'video-pixar-3d-animal', 'video-pixar-3d-object', 'video-pixar-3d-car',
          'video-anime-2d', 'video-digital-illustration', 'video-watercolor', 'video-cinematic-dark'
        ]);

        // Get all templates and delete built-in ones not in keepIds
        const allTemplates = await PromptStorage.getAll();
        let deleted = 0;
        for (const t of allTemplates) {
          if (t.isBuiltIn && !keepIds.has(t.id)) {
            await PromptStorage.delete(t.id);
            deleted++;
            console.log(`Deleted unused template: ${t.id}`);
          }
        }

        // Force update remaining templates
        await PromptStorage.forceUpdateImageTemplates();
        await PromptStorage.forceUpdateVideoTemplates();

        await chrome.storage.local.set({ [fixKey]: true, 'storyHealthVoiceOverV22': true });
        console.log(`Template cleanup done: deleted ${deleted}, updated remaining`);
      }
    } catch (error) {
      console.error('Error cleaning up templates:', error);
    }
  }

  /**
   * Rename templates V23: "UGC สมจริง" → "Prompt style สมจริง"
   */
  async templateRenameV23() {
    try {
      const fixKey = 'newStyleTemplatesV24';
      const { [fixKey]: alreadyFixed } = await chrome.storage.local.get(fixKey);

      if (!alreadyFixed && typeof PromptStorage !== 'undefined') {
        console.log('Sidebar: Adding new style templates + rename (V24)...');
        await PromptStorage.init();
        await PromptStorage.forceUpdateImageTemplates();
        await PromptStorage.forceUpdateVideoTemplates();
        await chrome.storage.local.set({ [fixKey]: true, 'templateRenameV23': true });
        console.log('New style templates V24 done');
      }
    } catch (error) {
      console.error('Error adding new style templates V24:', error);
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Setup tab switching
   */
  setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        this.switchTab(tabName);
      });
    });
  }

  /**
   * Switch to a tab
   */
  switchTab(tabName) {
    this.currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

  }

  /**
   * Setup header buttons
   */
  setupHeaderButtons() {
    // Refresh button
    const refreshBtn = document.getElementById('refreshDataBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('spinning');
        await this.refreshData();
        refreshBtn.classList.remove('spinning');
        showToast('รีเฟรชข้อมูลเรียบร้อย', 'success');
      });
    }

    // Open Prompt Warehouse button
    const openPromptWarehouseBtn = document.getElementById('openPromptWarehouseBtn');
    if (openPromptWarehouseBtn) {
      openPromptWarehouseBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('html/prompt-warehouse.html') });
      });
    }

    // Variable Guide button
    const variableGuideBtn = document.getElementById('variableGuideBtn');
    if (variableGuideBtn) {
      variableGuideBtn.addEventListener('click', () => {
        const modal = document.getElementById('variableGuideModal');
        if (modal) modal.style.display = 'flex';
      });
    }

    // Variable Guide Modal close buttons
    const closeVariableGuideModal = document.getElementById('closeVariableGuideModal');
    const closeVariableGuideBtn = document.getElementById('closeVariableGuideBtn');

    if (closeVariableGuideModal) {
      closeVariableGuideModal.addEventListener('click', () => {
        document.getElementById('variableGuideModal').style.display = 'none';
      });
    }

    if (closeVariableGuideBtn) {
      closeVariableGuideBtn.addEventListener('click', () => {
        document.getElementById('variableGuideModal').style.display = 'none';
      });
    }

    // Close modal on overlay click
    const variableGuideModal = document.getElementById('variableGuideModal');
    if (variableGuideModal) {
      variableGuideModal.addEventListener('click', (e) => {
        if (e.target === variableGuideModal) {
          variableGuideModal.style.display = 'none';
        }
      });
    }
  }

  /**
   * Refresh data from storage
   */
  async refreshData() {
    // Reload prompt templates
    if (typeof PromptTemplateSelector !== 'undefined') {
      await PromptTemplateSelector.reload();
    }
    if (typeof VideoPromptTemplateSelector !== 'undefined') {
      await VideoPromptTemplateSelector.reload();
    }
    if (typeof OllamaCleaner !== 'undefined') {
      await OllamaCleaner.updateConfig();
    }
  }

  /**
   * Setup settings modal
   */
  setupSettingsModal() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeBtn = document.getElementById('closeSettingsBtn');
    const saveBtn = document.getElementById('saveSettingsBtn');

    // Open modal
    settingsBtn.addEventListener('click', () => {
      this.loadSettingsToModal();
      settingsModal.style.display = 'flex';
    });

    // Close modal
    const closeModal = () => {
      settingsModal.style.display = 'none';
    };

    closeBtn.addEventListener('click', closeModal);

    // Close on overlay click
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeModal();
    });

    // Save settings
    saveBtn.addEventListener('click', () => {
      this.saveSettings();
      closeModal();
    });

    // Model toggle buttons
    const toggleGemini = document.getElementById('toggleGemini');
    const toggleOpenai = document.getElementById('toggleOpenai');

    toggleGemini.addEventListener('click', () => {
      toggleGemini.classList.add('active');
      toggleOpenai.classList.remove('active');
    });

    toggleOpenai.addEventListener('click', () => {
      toggleOpenai.classList.add('active');
      toggleGemini.classList.remove('active');
    });
  }

  /**
   * Load settings to modal
   */
  async loadSettingsToModal() {
    const result = await chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'ollamaApiKey', 'ollamaModel', 'selectedModel']);

    document.getElementById('geminiApiKey').value = result.geminiApiKey || '';
    document.getElementById('openaiApiKey').value = result.openaiApiKey || '';
    document.getElementById('ollamaApiKey').value = result.ollamaApiKey || '';
    document.getElementById('ollamaModel').value = result.ollamaModel || 'qwen3-coder-next:cloud';

    const model = result.selectedModel || 'gemini';
    document.getElementById('toggleGemini').classList.toggle('active', model === 'gemini');
    document.getElementById('toggleOpenai').classList.toggle('active', model === 'openai');
  }

  /**
   * Save settings
   */
  async saveSettings() {
    const geminiKey = document.getElementById('geminiApiKey').value.trim();
    const openaiKey = document.getElementById('openaiApiKey').value.trim();
    const ollamaKey = document.getElementById('ollamaApiKey').value.trim();
    const ollamaModel = document.getElementById('ollamaModel').value.trim() || 'qwen3-coder-next:cloud';
    const model = document.getElementById('toggleGemini').classList.contains('active') ? 'gemini' : 'openai';

    await chrome.storage.local.set({
      geminiApiKey: geminiKey,
      openaiApiKey: openaiKey,
      ollamaApiKey: ollamaKey,
      ollamaModel: ollamaModel,
      selectedModel: model
    });

    // Update Ollama config if active
    if (typeof OllamaCleaner !== 'undefined') {
      await OllamaCleaner.updateConfig();
    }

    showToast('บันทึกการตั้งค่าเรียบร้อย', 'success');
  }

}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.flowAIUnlocked = new FlowAIUnlocked();
});

/**
 * Storage utility for Chrome Extension
 */
const Storage = {
  /**
   * Get data from Chrome storage
   * @param {string|string[]} keys - Key(s) to retrieve
   * @returns {Promise<object>}
   */
  async get(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    });
  },

  /**
   * Set data to Chrome storage
   * @param {object} data - Data to store
   * @returns {Promise<void>}
   */
  async set(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  },

  /**
   * Remove data from Chrome storage
   * @param {string|string[]} keys - Key(s) to remove
   * @returns {Promise<void>}
   */
  async remove(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => {
        resolve();
      });
    });
  },

  /**
   * Clear all data from Chrome storage
   * @returns {Promise<void>}
   */
  async clear() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        resolve();
      });
    });
  },

  /**
   * Get API keys
   * @returns {Promise<{geminiApiKey: string, openaiApiKey: string}>}
   */
  async getApiKeys() {
    const result = await this.get(['geminiApiKey', 'openaiApiKey']);
    return {
      geminiApiKey: result.geminiApiKey || '',
      openaiApiKey: result.openaiApiKey || ''
    };
  },

  /**
   * Save API keys
   * @param {string} geminiApiKey
   * @param {string} openaiApiKey
   * @returns {Promise<void>}
   */
  async saveApiKeys(geminiApiKey, openaiApiKey) {
    await this.set({ geminiApiKey, openaiApiKey });
  }
};

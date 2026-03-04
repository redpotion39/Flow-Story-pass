/**
 * Prompt List Tab
 * Displays cleaned prompts from old to new for easy copying
 */

const PromptList = {
  // State
  data: [],

  /**
   * Initialize the module
   */
  async init() {
    this.cacheElements();
    this.setupEventListeners();
    await this.loadAndRender();
  },

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      list: document.getElementById('promptCopyList'),
      refreshBtn: document.getElementById('promptListRefreshBtn')
    };
  },

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (this.elements.refreshBtn) {
      this.elements.refreshBtn.addEventListener('click', async () => {
        this.elements.refreshBtn.classList.add('spin');
        await this.loadAndRender();
        setTimeout(() => this.elements.refreshBtn.classList.remove('spin'), 500);
        showToast('รีเฟรชรายการแล้ว', 'success');
      });
    }

    // Listen for tab changes to auto-refresh
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'prompt-list') {
          this.loadAndRender();
        }
      });
    });
  },

  /**
   * Load data from storage and render
   */
  async loadAndRender() {
    const result = await chrome.storage.local.get('ollamaCleanedData');
    let rawData = result.ollamaCleanedData || [];
    
    // Sort oldest to newest (ascending timestamp)
    // In CleanData tab, we unshift/prepend, so the array itself is newest to oldest.
    // We reverse it to get oldest first.
    this.data = [...rawData].reverse();
    
    this.render();
  },

  /**
   * Render the list
   */
  render() {
    if (!this.elements.list) return;

    if (this.data.length === 0) {
      this.elements.list.innerHTML = '<div class="empty-message">กรุณาคลีนข้อมูลก่อนในหน้า CleanData</div>';
      return;
    }

    this.elements.list.innerHTML = this.data.map((item, index) => `
      <div class="prompt-card">
        <div class="prompt-card-header">
          <span class="prompt-card-index">ฉากที่ ${index + 1}</span>
        </div>
        <div class="prompt-card-body">
          <div class="copy-group">
            <label>Image Prompt</label>
            <div class="copy-input-wrapper">
              <textarea readonly>${item.image_prompt}</textarea>
              <button class="btn-copy-icon" data-text="${this.escapeHtml(item.image_prompt)}" title="คัดลอก Image Prompt">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="copy-group">
            <label>Video Prompt</label>
            <div class="copy-input-wrapper">
              <textarea readonly>${item.video_prompt}</textarea>
              <button class="btn-copy-icon" data-text="${this.escapeHtml(item.video_prompt)}" title="คัดลอก Video Prompt">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Add copy listeners
    this.elements.list.querySelectorAll('.btn-copy-icon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const text = e.currentTarget.dataset.text;
        this.handleCopy(text, e.currentTarget);
      });
    });
  },

  /**
   * Handle copying to clipboard
   */
  async handleCopy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      
      // Feedback
      const originalSvg = btn.innerHTML;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      
      showToast('คัดลอกแล้ว', 'success');
      
      setTimeout(() => {
        btn.innerHTML = originalSvg;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('ไม่สามารถคัดลอกได้', 'error');
    }
  },

  /**
   * Simple HTML escape
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
  }
};

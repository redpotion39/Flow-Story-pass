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
      refreshBtn: document.getElementById('promptListRefreshBtn'),
      clearAllBtn: document.getElementById('promptListClearAllBtn'),
      exportBtn: document.getElementById('promptListExportBtn'),
      importBtn: document.getElementById('promptListImportBtn')
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

    if (this.elements.exportBtn) {
      this.elements.exportBtn.addEventListener('click', () => this.exportToCSV());
    }

    if (this.elements.importBtn) {
      this.elements.importBtn.addEventListener('click', () => this.handleImport());
    }

    if (this.elements.clearAllBtn) {
      this.elements.clearAllBtn.addEventListener('click', async () => {
        if (this.data.length === 0) return;
        
        if (confirm('ต้องการล้างข้อมูลทั้งหมดหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
          await this.clearAllData();
        }
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

    this.elements.list.innerHTML = this.data.map((item, index) => {
      // Map display index back to original index in storage (reverse of current list)
      const originalIndex = this.data.length - 1 - index;
      
      return `
        <div class="prompt-card">
          <div class="prompt-card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <span class="prompt-card-index">ฉากที่ ${index + 1}</span>
            <button class="delete-prompt-btn" data-original-index="${originalIndex}" title="ลบรายการนี้">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
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
      `;
    }).join('');

    // Add copy listeners
    this.elements.list.querySelectorAll('.btn-copy-icon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const text = e.currentTarget.dataset.text;
        this.handleCopy(text, e.currentTarget);
      });
    });

    // Add delete listeners
    this.elements.list.querySelectorAll('.delete-prompt-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const originalIndex = parseInt(e.target.dataset.originalIndex);
        if (confirm('ต้องการลบฉากนี้หรือไม่?')) {
          await this.deleteItem(originalIndex);
        }
      });
    });
  },

  /**
   * Delete item from storage
   */
  async deleteItem(originalIndex) {
    const result = await chrome.storage.local.get('ollamaCleanedData');
    let rawData = result.ollamaCleanedData || [];
    
    // Remove item at original index
    rawData.splice(originalIndex, 1);
    
    // Save back to storage
    await chrome.storage.local.set({ ollamaCleanedData: rawData });
    
    // Refresh display
    await this.loadAndRender();
    
    // Also update CleanData count if visible
    if (typeof OllamaCleaner !== 'undefined') {
      await OllamaCleaner.loadData();
      OllamaCleaner.renderData();
    }
    
    showToast('ลบรายการแล้ว', 'success');
  },

  /**
   * Clear all data
   */
  async clearAllData() {
    await chrome.storage.local.set({ ollamaCleanedData: [] });
    
    // Refresh display
    await this.loadAndRender();
    
    // Also update CleanData count if visible
    if (typeof OllamaCleaner !== 'undefined') {
      await OllamaCleaner.loadData();
      OllamaCleaner.renderData();
    }
    
    showToast('ล้างข้อมูลทั้งหมดแล้ว', 'success');
  },

  /**
   * Export data to CSV (Old -> New)
   */
  exportToCSV() {
    if (this.data.length === 0) {
      showToast('ไม่มีข้อมูลที่จะส่งออก', 'error');
      return;
    }

    const headers = ['image_prompt', 'video_prompt'];
    const rows = this.data.map(item => [
      `"${item.image_prompt.replace(/"/g, '""')}"`,
      `"${item.video_prompt.replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', `prompt_list_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('ส่งออก CSV เรียบร้อย', 'success');
  },

  /**
   * Handle CSV Import
   */
  handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        this.processImportFile(file);
      }
    };
    input.click();
  },

  /**
   * Process the imported CSV file
   */
  async processImportFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const rows = this.parseCSV(text);
        
        if (rows.length === 0) {
          throw new Error('ไม่พบข้อมูลในไฟล์ CSV หรือรูปแบบไม่ถูกต้อง');
        }

        const result = await chrome.storage.local.get('ollamaCleanedData');
        let currentData = result.ollamaCleanedData || [];
        
        // CSV headers are usually image_prompt,video_prompt
        // If first row is header, skip it
        let startIdx = 0;
        const firstRow = rows[0];
        if (firstRow && (firstRow[0] === 'image_prompt' || firstRow[1] === 'video_prompt')) {
          startIdx = 1;
        }

        const newItems = [];
        for (let i = startIdx; i < rows.length; i++) {
          const row = rows[i];
          if (row.length >= 2) {
            newItems.push({
              image_prompt: row[0].trim(),
              video_prompt: row[1].trim(),
              timestamp: Date.now() + i
            });
          }
        }

        if (newItems.length === 0) {
          throw new Error('ไม่พบข้อมูลที่ถูกต้องในไฟล์');
        }

        // Prepending newest to maintain "CleanData" consistency
        await chrome.storage.local.set({ ollamaCleanedData: [...newItems.reverse(), ...currentData] });
        
        await this.loadAndRender();
        
        if (typeof OllamaCleaner !== 'undefined') {
          await OllamaCleaner.loadData();
          OllamaCleaner.renderData();
        }

        showToast(`นำเข้าข้อมูลเรียบร้อย ${newItems.length} รายการ`, 'success');
      } catch (err) {
        console.error('Import error:', err);
        showToast(err.message, 'error');
      }
    };
    reader.readAsText(file);
  },

  /**
   * Basic CSV Parser (handles quotes and commas)
   */
  parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    // Remove BOM if present
    text = text.replace(/^\ufeff/, '');

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        currentRow.push(currentField);
        currentField = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        // Row separator
        if (char === '\r' && nextChar === '\n') i++;
        if (currentField !== '' || currentRow.length > 0) {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
        }
      } else {
        currentField += char;
      }
    }

    if (currentField !== '' || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows;
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

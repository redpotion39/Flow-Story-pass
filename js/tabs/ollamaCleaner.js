/**
 * Ollama Cleaner Tab
 * Processes Gemini prompts using Ollama Cloud API
 */

const OllamaCleaner = {
  // API Configuration
  config: {
    apiKey: '',
    model: 'qwen3-coder-next:cloud',
    backupModel: 'minimax-m2.5:cloud',
    host: 'https://ollama.com'
  },

  // Default System Prompt
  defaultSystemPrompt: `You are a data extraction assistant. Your task is to extract "Image Prompts" and "Video Prompts" from the user's text based on specific keywords.

STRICT RULES & CONSTRAINTS:
1. Keyword Filtering (VEO): If the text contains the keywords "veo3" or "veo", you must use the video/camera/script descriptions associated ONLY with those terms. All other video descriptions that do not have these keywords must be DELETED and ignored.
2. Original Fidelity ONLY: Extract ONLY what is explicitly provided. DO NOT add, embellish, or invent any visual, camera, or narrative details.
3. Handling Missing Data: 
   * If a scene lacks an image description, "image_prompt" must be "".
   * If a scene lacks "veo3"/"veo" video info, "video_prompt" must be "".
4. Output Format: Return ONLY a JSON array of objects. No preamble or explanation.
5. Schema: Each object MUST have ONLY two keys: "image_prompt" and "video_prompt".
6. Translation & Structure: 
   * image_prompt: Translate visual descriptions to English. No Thai script.
   * video_prompt: Combine [Video Content] [Camera Movement] [Full Thai Script Block including tone header].
   Keep the Thai dialogue and tone header exactly as written.`,

  // State
  data: [],

  /**
   * Initialize the module
   */
  async init() {
    this.cacheElements();
    this.setupEventListeners();
    await this.updateConfig();
    await this.loadData();
    this.renderData();
  },

  /**
   * Update configuration from storage
   */
  async updateConfig() {
    const result = await chrome.storage.local.get(['ollamaApiKey', 'ollamaModel', 'ollamaSystemPrompt']);

    // Update active config
    this.config.apiKey = result.ollamaApiKey || '';
    this.config.model = result.ollamaModel || 'qwen3-coder-next:cloud';

    // Update UI display
    const modelDisplay = document.getElementById('ollamaCurrentModelDisplay');
    if (modelDisplay) {
      modelDisplay.textContent = `Model: ${this.config.model}`;
    }

    // Set system prompt in textarea if it exists
    if (this.elements.systemPromptInput) {
      this.elements.systemPromptInput.value = result.ollamaSystemPrompt || this.defaultSystemPrompt;
    }
  },

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      systemPromptInput: document.getElementById('ollamaSystemPrompt'),
      resetPromptBtn: document.getElementById('ollamaResetPromptBtn'),
      savePromptBtn: document.getElementById('ollamaSavePromptBtn'),
      rawInput: document.getElementById('ollamaRawInput'),
      cleanBtn: document.getElementById('ollamaCleanBtn'),
      exportBtn: document.getElementById('ollamaExportBtn'),
      clearBtn: document.getElementById('ollamaClearBtn'),
      resultsList: document.getElementById('ollamaResultsList'),
      status: document.getElementById('ollamaStatus'),
      countBadge: document.getElementById('ollamaCountBadge')
    };
  },

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (this.elements.cleanBtn) {
      this.elements.cleanBtn.addEventListener('click', () => this.handleClean());
    }
    if (this.elements.exportBtn) {
      this.elements.exportBtn.addEventListener('click', () => this.exportToCSV());
    }
    if (this.elements.clearBtn) {
      this.elements.clearBtn.addEventListener('click', () => this.clearAllData());
    }
    if (this.elements.resetPromptBtn) {
      this.elements.resetPromptBtn.addEventListener('click', () => {
        if (confirm('ต้องการคืนค่าเริ่มต้นสำหรับคำสั่งคลีนข้อมูลหรือไม่?')) {
          this.elements.systemPromptInput.value = this.defaultSystemPrompt;
          this.saveSystemPrompt();
        }
      });
    }
    if (this.elements.savePromptBtn) {
      this.elements.savePromptBtn.addEventListener('click', () => this.saveSystemPrompt());
    }
    if (this.elements.systemPromptInput) {
      this.elements.systemPromptInput.addEventListener('change', () => this.saveSystemPrompt());
    }
  },

  /**
   * Save system prompt to storage
   */
  async saveSystemPrompt() {
    if (this.elements.systemPromptInput) {
      await chrome.storage.local.set({ ollamaSystemPrompt: this.elements.systemPromptInput.value });
      showToast('บันทึกคำสั่งคลีนข้อมูลแล้ว', 'success');
    }
  },

  /**
   * Load data from storage
   */
  async loadData() {
    const result = await chrome.storage.local.get('ollamaCleanedData');
    this.data = result.ollamaCleanedData || [];
    this.updateCountBadge();
  },

  /**
   * Save data to storage
   */
  async saveData() {
    await chrome.storage.local.set({ ollamaCleanedData: this.data });
    this.updateCountBadge();
    
    // Notify other components (like Prompt List and Context Menu)
    chrome.runtime.sendMessage({ action: 'dataUpdated' });
  },

  /**
   * Update the count badge
   */
  updateCountBadge() {
    if (this.elements.countBadge) {
      this.elements.countBadge.textContent = this.data.length;
      this.elements.countBadge.hidden = this.data.length === 0;
    }
  },

  /**
   * Handle cleaning the raw input
   */
  async handleClean() {
    // Check if API key is set
    if (!this.config.apiKey) {
      showToast('กรุณาตั้งค่า Ollama API Key ในหน้าตั้งค่าก่อนใช้งาน', 'error');
      // Open settings modal
      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsBtn) settingsBtn.click();
      return;
    }

    const rawText = this.elements.rawInput.value.trim();
    if (!rawText) {
      showToast('กรุณากรอกข้อมูลจาก Gemini', 'error');
      return;
    }

    // Save custom prompt if changed
    await this.saveSystemPrompt();

    this.setLoading(true);
    this.setStatus('กำลังประมวลผลด้วย Ollama...', 'info');

    try {
      const cleanedItems = await this.processWithAI(rawText);
      
      if (cleanedItems && cleanedItems.length > 0) {
        this.data = [...cleanedItems, ...this.data];
        await this.saveData();
        this.renderData();
        this.elements.rawInput.value = '';
        showToast(`ทำความสะอาดข้อมูลเรียบร้อย ${cleanedItems.length} รายการ`, 'success');
        this.setStatus('', '');
      } else {
        throw new Error('ไม่พบข้อมูลที่ต้องการในข้อความที่ส่งมา');
      }
    } catch (error) {
      console.error('Ollama Clean Error:', error);
      showToast(error.message || 'เกิดข้อผิดพลาดในการประมวลผล', 'error');
      this.setStatus('เกิดข้อผิดพลาด: ' + error.message, 'error');
    } finally {
      this.setLoading(false);
    }
  },

  /**
   * Process raw text using Ollama API
   */
  async processWithAI(text) {
    const systemPrompt = this.elements.systemPromptInput ? this.elements.systemPromptInput.value : this.defaultSystemPrompt;

    try {
      const response = await this.callOllama(this.config.model, systemPrompt, text);
      return this.parseAIResponse(response);
    } catch (error) {
      console.warn('Primary model failed, trying backup...', error);
      const backupResponse = await this.callOllama(this.config.backupModel, systemPrompt, text);
      return this.parseAIResponse(backupResponse);
    }
  },

  /**
   * Call Ollama Cloud API
   */
  async callOllama(model, systemPrompt, userPrompt) {
    const response = await fetch(`${this.config.host}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API Error: ${response.status}`);
    }

    const result = await response.json();
    return result.message.content;
  },

  /**
   * Parse the JSON response from AI
   */
  parseAIResponse(text) {
    try {
      // Find JSON block if AI added extra text
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      const parsed = JSON.parse(jsonStr);
      
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({
          image_prompt: item.image_prompt || '',
          video_prompt: item.video_prompt || '',
          timestamp: Date.now()
        }));
      }
      return [];
    } catch (e) {
      console.error('Failed to parse AI response:', text);
      throw new Error('AI ส่งข้อมูลกลับมาในรูปแบบที่ไม่ถูกต้อง (กรุณาลองปรับ System Prompt)');
    }
  },

  /**
   * Render data to the list
   */
  renderData() {
    if (!this.elements.resultsList) return;

    if (this.data.length === 0) {
      this.elements.resultsList.innerHTML = '<div class="empty-message">ไม่มีข้อมูลที่ประมวลผลแล้ว</div>';
      return;
    }

    this.elements.resultsList.innerHTML = this.data.map((item, index) => `
      <div class="result-item">
        <div class="result-header">
          <span>รายการที่ ${this.data.length - index}</span>
          <button class="delete-item-btn" data-index="${index}" title="ลบรายการนี้">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
        <div class="result-content">
          <div class="result-field">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>Image Prompt:</strong>
              <button class="btn-copy-small" data-text="${this.escapeHtml(item.image_prompt)}" title="Copy Image Prompt">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <p>${item.image_prompt}</p>
          </div>
          <div class="result-field">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>Video Prompt:</strong>
              <button class="btn-copy-small" data-text="${this.escapeHtml(item.video_prompt)}" title="Copy Video Prompt">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <p>${item.video_prompt}</p>
          </div>
        </div>
      </div>
    `).join('');

    // Add delete listeners
    this.elements.resultsList.querySelectorAll('.delete-item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.deleteItem(index);
      });
    });

    // Add copy listeners
    this.elements.resultsList.querySelectorAll('.btn-copy-small').forEach(btn => {
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
      showToast('คัดลอกแล้ว', 'success');
      
      const originalSvg = btn.innerHTML;
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      setTimeout(() => btn.innerHTML = originalSvg, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('ไม่สามารถคัดลอกได้', 'error');
    }
  },

  /**
   * Simple HTML escape
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
  },

  /**
   * Delete a single item
   */
  async deleteItem(index) {
    if (confirm('ต้องการลบรายการนี้หรือไม่?')) {
      this.data.splice(index, 1);
      await this.saveData();
      this.renderData();
    }
  },

  /**
   * Clear all data
   */
  async clearAllData() {
    if (this.data.length === 0) {
      // If data is empty but there's raw input, just clear raw input
      if (this.elements.rawInput.value) {
        this.elements.rawInput.value = '';
        return;
      }
      return;
    }
    
    if (confirm('ต้องการล้างข้อมูลที่ประมวลผลแล้วทั้งหมดหรือไม่?')) {
      this.data = [];
      await this.saveData();
      this.renderData();
      showToast('ล้างข้อมูลเรียบร้อย', 'success');
    }
  },

  /**
   * Export data to CSV
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
    link.setAttribute('download', `ollama_prompts_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('ส่งออก CSV เรียบร้อย', 'success');
  },

  /**
   * Set loading state
   */
  setLoading(isLoading) {
    if (this.elements.cleanBtn) {
      this.elements.cleanBtn.disabled = isLoading;
      this.elements.cleanBtn.classList.toggle('loading', isLoading);
    }
  },

  /**
   * Set status message
   */
  setStatus(message, type) {
    if (!this.elements.status) return;
    this.elements.status.textContent = message;
    this.elements.status.className = `status-msg ${type}`;
    this.elements.status.hidden = !message;
  }
};

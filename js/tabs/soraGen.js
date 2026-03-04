/**
 * Sora PromptGen Tab
 * Generates expanded prompts for Sora2 based on structured input
 */

const SoraGen = {
  // API Configuration
  config: {
    apiKey: '',
    model: 'qwen3-coder-next:cloud',
    host: 'https://ollama.com'
  },

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
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      structuredInput: document.getElementById('soraStructuredInput'),
      customInstruction: document.getElementById('soraCustomInstruction'),
      genCount: document.getElementById('soraGenCount'),
      generateBtn: document.getElementById('soraGenerateBtn'),
      exportBtn: document.getElementById('soraExportBtn'),
      importBtn: document.getElementById('soraImportBtn'),
      clearAllBtn: document.getElementById('soraClearAllBtn'),
      resultsList: document.getElementById('soraResultsList'),
      status: document.getElementById('soraStatus'),
      modelDisplay: document.getElementById('soraCurrentModelDisplay')
    };
  },

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (this.elements.generateBtn) {
      this.elements.generateBtn.addEventListener('click', () => this.handleGenerate());
    }
    if (this.elements.exportBtn) {
      this.elements.exportBtn.addEventListener('click', () => this.exportToCSV());
    }
    if (this.elements.importBtn) {
      this.elements.importBtn.addEventListener('click', () => this.handleImport());
    }
    if (this.elements.clearAllBtn) {
      this.elements.clearAllBtn.addEventListener('click', () => this.clearAllData());
    }
  },

  /**
   * Update configuration from storage
   */
  async updateConfig() {
    const result = await chrome.storage.local.get(['ollamaApiKey', 'ollamaModel']);
    this.config.apiKey = result.ollamaApiKey || '';
    this.config.model = result.ollamaModel || 'qwen3-coder-next:cloud';
    
    if (this.elements.modelDisplay) {
      this.elements.modelDisplay.textContent = `Model: ${this.config.model}`;
    }
  },

  /**
   * Load data from storage
   */
  async loadData() {
    const result = await chrome.storage.local.get('soraGeneratedData');
    this.data = result.soraGeneratedData || [];
  },

  /**
   * Save data to storage
   */
  async saveData() {
    await chrome.storage.local.set({ soraGeneratedData: this.data });
  },

  /**
   * Handle generation process
   */
  async handleGenerate() {
    if (!this.config.apiKey) {
      showToast('กรุณาตั้งค่า Ollama API Key ก่อนใช้งาน', 'error');
      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsBtn) settingsBtn.click();
      return;
    }

    const structure = this.elements.structuredInput.value.trim();
    const instruction = this.elements.customInstruction.value.trim();
    const count = parseInt(this.elements.genCount.value) || 5;

    if (!structure) {
      showToast('กรุณากรอกโครงสร้าง Prompt', 'error');
      return;
    }

    this.setLoading(true);
    this.setStatus(`กำลังสร้าง ${count} Prompt ด้วย Ollama...`, 'info');

    try {
      const generatedPrompts = await this.generateWithAI(structure, instruction, count);
      
      if (generatedPrompts && generatedPrompts.length > 0) {
        // Add timestamp and wrap in objects
        const newItems = generatedPrompts.map(p => ({
          prompt: p,
          timestamp: Date.now()
        }));

        // Prepend new results (newest at top)
        this.data = [...newItems, ...this.data];
        await this.saveData();
        this.renderData();
        
        showToast(`สร้างสำเร็จ ${generatedPrompts.length} รายการ`, 'success');
        this.setStatus('', '');
      } else {
        throw new Error('AI ไม่ได้ส่งข้อมูลกลับมา');
      }
    } catch (error) {
      console.error('Sora Gen Error:', error);
      showToast(error.message || 'เกิดข้อผิดพลาดในการสร้าง', 'error');
      this.setStatus('เกิดข้อผิดพลาด: ' + error.message, 'error');
    } finally {
      this.setLoading(false);
    }
  },

  /**
   * Call AI to expand prompts
   */
  async generateWithAI(structure, instruction, count) {
    const systemPrompt = `You are an expert Sora2 Prompt Engineer.
The user provides a structured description in this format: "Camera Angle - Who - Clothing - Action - Where - How - Atmosphere".
Your task is to expand this into ${count} unique, high-quality, and highly detailed prompts for Sora2.

Rules:
1. Return ONLY a JSON array of strings.
2. Each string is one full detailed prompt in English.
3. Incorporate the user's custom instructions if provided.
4. Vary the details in each version to provide variety while keeping the core elements.
5. Focus on cinematic quality, lighting, and realistic motion descriptions.

Format:
["Detailed prompt 1...", "Detailed prompt 2...", ...]`;

    const userMessage = `Structure: ${structure}\nCustom Instructions: ${instruction}\nGenerate ${count} variations.`;

    try {
      const response = await OllamaApi.generateVideoPrompt(this.config.apiKey, systemPrompt, userMessage, this.config.model);
      
      // Parse JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      const parsed = JSON.parse(jsonStr);
      
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('AI Parse error:', e);
      throw new Error('AI ส่งข้อมูลกลับมาในรูปแบบที่ไม่ถูกต้อง');
    }
  },

  /**
   * Render results to list
   */
  renderData() {
    if (!this.elements.resultsList) return;

    if (this.data.length === 0) {
      this.elements.resultsList.innerHTML = '<div class="empty-message">ยังไม่มี Prompt ที่สร้าง</div>';
      return;
    }

    // Display newest at top, but users might want chronological for copying
    // Let's stick to the prompt list style (One card per row)
    this.elements.resultsList.innerHTML = this.data.map((item, index) => `
      <div class="prompt-card">
        <div class="prompt-card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span class="prompt-card-index">Prompt #${this.data.length - index}</span>
          <button class="delete-sora-btn" data-index="${index}" title="ลบรายการนี้">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
        <div class="prompt-card-body">
          <div class="copy-input-wrapper">
            <textarea readonly style="min-height: 80px;">${item.prompt}</textarea>
            <button class="btn-copy-icon" data-text="${this.escapeHtml(item.prompt)}" title="คัดลอก">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Copy listeners
    this.elements.resultsList.querySelectorAll('.btn-copy-icon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const text = e.currentTarget.dataset.text;
        this.handleCopy(text, e.currentTarget);
      });
    });

    // Delete listeners
    this.elements.resultsList.querySelectorAll('.delete-sora-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.deleteItem(index);
      });
    });
  },

  /**
   * Delete single item
   */
  async deleteItem(index) {
    if (confirm('ต้องการลบ Prompt นี้หรือไม่?')) {
      this.data.splice(index, 1);
      await this.saveData();
      this.renderData();
    }
  },

  /**
   * Clear all
   */
  async clearAllData() {
    if (this.data.length === 0) return;
    if (confirm('ต้องการล้างข้อมูลทั้งหมดหรือไม่?')) {
      this.data = [];
      await this.saveData();
      this.renderData();
      showToast('ล้างข้อมูลเรียบร้อย', 'success');
    }
  },

  /**
   * Export to CSV
   */
  exportToCSV() {
    if (this.data.length === 0) {
      showToast('ไม่มีข้อมูลที่จะส่งออก', 'error');
      return;
    }

    const headers = ['prompt'];
    // Export in original order (Oldest first)
    const exportData = [...this.data].reverse();
    const rows = exportData.map(item => [`"${item.prompt.replace(/"/g, '""')}"`]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `sora_prompts_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('ส่งออก CSV เรียบร้อย', 'success');
  },

  /**
   * Import from CSV
   */
  handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) this.processImport(file);
    };
    input.click();
  },

  async processImport(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        // Simple line split for basic CSV
        const lines = text.replace(/^\ufeff/, '').split(/\r?\n/);
        const newItems = [];
        
        let startIdx = 0;
        if (lines[0].toLowerCase().includes('prompt')) startIdx = 1;

        for (let i = startIdx; i < lines.length; i++) {
          let line = lines[i].trim();
          if (!line) continue;
          
          // Remove wrapping quotes
          if (line.startsWith('"') && line.endsWith('"')) {
            line = line.substring(1, line.length - 1).replace(/""/g, '"');
          }

          newItems.push({
            prompt: line,
            timestamp: Date.now() + i
          });
        }

        if (newItems.length > 0) {
          this.data = [...newItems.reverse(), ...this.data];
          await this.saveData();
          this.renderData();
          showToast(`นำเข้าสำเร็จ ${newItems.length} รายการ`, 'success');
        }
      } catch (err) {
        showToast('รูปแบบไฟล์ไม่ถูกต้อง', 'error');
      }
    };
    reader.readAsText(file);
  },

  /**
   * UI Helpers
   */
  async handleCopy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const originalSvg = btn.innerHTML;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      showToast('คัดลอกแล้ว', 'success');
      setTimeout(() => btn.innerHTML = originalSvg, 2000);
    } catch (err) {
      showToast('คัดลอกล้มเหลว', 'error');
    }
  },

  setLoading(isLoading) {
    if (this.elements.generateBtn) {
      this.elements.generateBtn.disabled = isLoading;
      this.elements.generateBtn.classList.toggle('loading', isLoading);
    }
  },

  setStatus(message, type) {
    if (!this.elements.status) return;
    this.elements.status.textContent = message;
    this.elements.status.className = `status-msg ${type}`;
    this.elements.status.hidden = !message;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
  }
};

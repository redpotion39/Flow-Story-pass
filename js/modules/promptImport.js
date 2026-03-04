/**
 * Prompt Import Module
 * Handles importing prompts from CSV files
 * CSV format: image_prompt, video_prompt
 */
const PromptImport = {
  isEnabled: false,
  isRunning: false,
  prompts: [], // Array of { imagePrompt, videoPrompt }
  currentIndex: 0,
  previewExpanded: true,

  /**
   * Initialize Prompt Import
   */
  init() {
    this.bindElements();
    this.bindEvents();
    // sync กับ HTML default (checked)
    if (this.toggle && this.toggle.checked) {
      this.setEnabled(true);
    }
  },

  /**
   * Bind DOM elements
   */
  bindElements() {
    // Toggle and content (Story tab)
    this.toggle = document.getElementById('storyPromptImportToggle');
    this.content = document.getElementById('storyPromptImportContent');

    // File input
    this.fileInput = document.getElementById('storyPromptCsvInput');
    this.importBtn = document.getElementById('storyPromptImportBtn');

    // Info display
    this.infoContainer = document.getElementById('storyPromptImportInfo');
    this.countDisplay = document.getElementById('storyPromptImportCount');
    this.clearBtn = document.getElementById('storyPromptImportClear');

    // Preview
    this.previewContainer = document.getElementById('storyPromptImportPreview');
    this.previewList = document.getElementById('storyPromptPreviewList');
    this.previewToggle = document.getElementById('storyPromptPreviewToggle');

    // Progress
    this.progressContainer = document.getElementById('storyPromptImportProgress');
    this.progressFill = document.getElementById('storyPromptProgressFill');
    this.progressText = document.getElementById('storyPromptProgressText');
  },

  /**
   * Bind events
   */
  bindEvents() {
    // Toggle prompt import mode
    if (this.toggle) {
      this.toggle.addEventListener('change', () => {
        this.setEnabled(this.toggle.checked);
      });
    }

    // Import button click
    if (this.importBtn) {
      this.importBtn.addEventListener('click', () => {
        this.fileInput?.click();
      });
    }

    // File input change
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          this.handleFileImport(file);
        }
        // Reset input so same file can be selected again
        this.fileInput.value = '';
      });
    }

    // Clear button
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        this.clearPrompts();
      });
    }

    // Preview toggle
    if (this.previewToggle) {
      this.previewToggle.addEventListener('click', () => {
        this.togglePreview();
      });
    }
  },

  /**
   * Set enabled state
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (this.content) {
      this.content.hidden = !enabled;
    }

    // Toggle visibility of storyTopicSection (hide when CSV import is enabled)
    const storyTopicSection = document.getElementById('storyTopicSection');
    if (storyTopicSection) {
      storyTopicSection.hidden = enabled;
    }

  },

  /**
   * Handle CSV file import
   */
  async handleFileImport(file) {
    try {
      const text = await file.text();
      const parsed = this.parseCSV(text);

      if (parsed.length === 0) {
        Helpers.showToast('ไม่พบข้อมูล Prompt ในไฟล์', 'error');
        return;
      }

      this.prompts = parsed;
      this.currentIndex = 0;
      this.updateUI();

      const stats = this.getStats();
      Helpers.showToast(
        `นำเข้าสำเร็จ ${parsed.length} ชุด (ภาพ ${stats.imageCount} / วิดีโอ ${stats.videoCount})`,
        'success'
      );

    } catch (error) {
      console.error('Error importing CSV:', error);
      Helpers.showToast('เกิดข้อผิดพลาดในการอ่านไฟล์', 'error');
    }
  },

  /**
   * Parse CSV content
   * Supports both comma and semicolon delimiters
   * Expected columns: image_prompt, video_prompt
   */
  parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return []; // Need header + at least 1 data row

    // Detect delimiter (comma or semicolon)
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    // Parse header to find column indices
    const headers = this.parseCSVLine(firstLine, delimiter).map(h => h.toLowerCase().trim());

    const imagePromptIndex = headers.findIndex(h =>
      h === 'image_prompt' || h === 'imageprompt' || h === 'image prompt' || h === 'img_prompt'
    );
    const videoPromptIndex = headers.findIndex(h =>
      h === 'video_prompt' || h === 'videoprompt' || h === 'video prompt' || h === 'vid_prompt'
    );

    // If no proper headers found, assume first column is image, second is video
    const imgIdx = imagePromptIndex >= 0 ? imagePromptIndex : 0;
    const vidIdx = videoPromptIndex >= 0 ? videoPromptIndex : 1;

    const prompts = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i], delimiter);

      const imagePrompt = values[imgIdx]?.trim() || '';
      const videoPrompt = values[vidIdx]?.trim() || '';

      // Skip empty rows
      if (!imagePrompt && !videoPrompt) continue;

      prompts.push({
        imagePrompt,
        videoPrompt,
        index: prompts.length
      });
    }

    return prompts;
  },

  /**
   * Parse a single CSV line handling quoted values
   */
  parseCSVLine(line, delimiter = ',') {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);
    return values;
  },

  /**
   * Update UI after import
   */
  updateUI() {
    const hasPrompts = this.prompts.length > 0;

    // Show/hide info
    if (this.infoContainer) {
      this.infoContainer.hidden = !hasPrompts;
    }

    // Update count with stats
    if (this.countDisplay) {
      const stats = this.getStats();
      this.countDisplay.innerHTML = hasPrompts
        ? `นำเข้าแล้ว <b>${this.prompts.length}</b> ชุด — ภาพ <b>${stats.imageCount}</b> / วิดีโอ <b>${stats.videoCount}</b>`
        : '';
    }

    // Show/hide preview
    if (this.previewContainer) {
      this.previewContainer.hidden = !hasPrompts;
    }

    // Render preview
    this.renderPreview();
  },

  /**
   * Render preview list
   */
  renderPreview() {
    if (!this.previewList) return;

    if (this.prompts.length === 0) {
      this.previewList.innerHTML = '<div class="prompt-preview-empty">ยังไม่มีข้อมูล</div>';
      return;
    }

    // Show first 5 prompts
    const previewItems = this.prompts.slice(0, 5);

    this.previewList.innerHTML = previewItems.map((p, i) => `
      <div class="prompt-preview-item">
        <div class="prompt-preview-num">${i + 1}</div>
        <div class="prompt-preview-content">
          <div class="prompt-preview-row">
            <span class="prompt-label">Image:</span>
            <span class="prompt-text">${this.truncateText(p.imagePrompt, 50)}</span>
          </div>
          <div class="prompt-preview-row">
            <span class="prompt-label">Video:</span>
            <span class="prompt-text">${this.truncateText(p.videoPrompt, 50)}</span>
          </div>
        </div>
      </div>
    `).join('');

    if (this.prompts.length > 5) {
      this.previewList.innerHTML += `
        <div class="prompt-preview-more">
          และอีก ${this.prompts.length - 5} ชุด...
        </div>
      `;
    }
  },

  /**
   * Truncate text for preview
   */
  truncateText(text, maxLength) {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },

  /**
   * Toggle preview expansion
   */
  togglePreview() {
    this.previewExpanded = !this.previewExpanded;

    if (this.previewList) {
      this.previewList.hidden = !this.previewExpanded;
    }

    if (this.previewToggle) {
      this.previewToggle.style.transform = this.previewExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
  },

  /**
   * Clear all imported prompts
   */
  clearPrompts() {
    this.prompts = [];
    this.currentIndex = 0;
    this.updateUI();
    Helpers.showToast('ล้างข้อมูลแล้ว', 'info');
  },

  /**
   * Start prompt import automation
   */
  async start() {
    if (this.isRunning) return false;

    if (this.prompts.length === 0) {
      Helpers.showToast('กรุณานำเข้าไฟล์ CSV ก่อน', 'error');
      return false;
    }

    this.isRunning = true;
    this.currentIndex = 0;

    if (this.progressContainer) {
      this.progressContainer.hidden = false;
    }

    this.updateProgress();
    return true;
  },

  /**
   * Get current prompt set
   */
  getCurrentPrompt() {
    if (!this.isRunning) return null;
    if (this.currentIndex >= this.prompts.length) return null;

    return this.prompts[this.currentIndex];
  },

  /**
   * Move to next prompt
   * Returns true if there's more, false if done
   */
  nextPrompt() {
    this.currentIndex++;
    this.updateProgress();

    if (this.currentIndex >= this.prompts.length) {
      this.stop();
      return false;
    }

    return true;
  },

  /**
   * Update progress display
   */
  updateProgress() {
    const current = this.currentIndex + 1;
    const total = this.prompts.length;
    const percent = total > 0 ? (current / total) * 100 : 0;

    if (this.progressFill) {
      this.progressFill.style.width = `${percent}%`;
    }

    if (this.progressText) {
      this.progressText.textContent = `กำลังทำ ${current}/${total}`;
    }
  },

  /**
   * Stop automation
   */
  stop() {
    this.isRunning = false;
    this.currentIndex = 0;

    if (this.progressContainer) {
      this.progressContainer.hidden = true;
    }
  },

  /**
   * Get total count
   */
  getTotalCount() {
    return this.prompts.length;
  },

  /**
   * Get current index (0-based)
   */
  getCurrentIndex() {
    return this.currentIndex;
  },

  /**
   * Get import statistics
   */
  getStats() {
    const imageCount = this.prompts.filter(p => p.imagePrompt).length;
    const videoCount = this.prompts.filter(p => p.videoPrompt).length;
    return { total: this.prompts.length, imageCount, videoCount };
  }
};

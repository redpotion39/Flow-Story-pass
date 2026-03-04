/**
 * TikTok Uploader Module
 * Handles TikTok tab functionality
 */
const TikTokUploader = {
  files: [],
  currentCaption: '',
  scheduleHistory: [],
  isAutomationRunning: false,
  shouldStopAutomation: false,
  currentMode: 'content',

  // AI Caption setting
  useAiCaption: true,
  useAiCaptionCheckbox: null,

  /**
   * Initialize TikTok Uploader
   */
  init() {
    this.bindElements();
    this.bindEvents();
    this.loadSettings();
    this.setDefaultScheduleTime();
  },

  /**
   * Bind DOM elements
   */
  bindElements() {
    // Content mode input
    this.contentTitleInput = document.getElementById('tiktokContentTitle');

    // Upload
    this.uploadArea = document.getElementById('tiktokUploadArea');
    this.fileInput = document.getElementById('tiktokFileInput');
    this.clearFilesBtn = document.getElementById('tiktokClearFilesBtn');

    // Caption
    this.captionEditor = document.getElementById('tiktokCaptionEditor');

    // Schedule
    this.scheduleTimeInput = document.getElementById('tiktokScheduleTime');
    this.postIntervalSelect = document.getElementById('tiktokPostInterval');

    // Automation
    this.automationBtn = document.getElementById('tiktokAutomationBtn');
    this.stopBtn = document.getElementById('tiktokStopBtn');
    this.automationStatus = document.getElementById('tiktokAutomationStatus');

    // AI Caption checkbox
    this.useAiCaptionCheckbox = document.getElementById('tiktokUseAiCaption');
  },

  /**
   * Bind events
   */
  bindEvents() {
    // Upload area
    this.uploadArea.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

    // Drag and drop
    this.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.uploadArea.classList.add('dragover');
    });

    this.uploadArea.addEventListener('dragleave', () => {
      this.uploadArea.classList.remove('dragover');
    });

    this.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.uploadArea.classList.remove('dragover');
      this.handleFiles(e.dataTransfer.files);
    });

    // Clear files
    this.clearFilesBtn.addEventListener('click', () => this.clearAllFiles());

    this.scheduleTimeInput.addEventListener('change', () => {
      localStorage.setItem('tiktok_schedule_time', this.scheduleTimeInput.value);
    });

    this.postIntervalSelect.addEventListener('change', () => {
      localStorage.setItem('tiktok_post_interval', this.postIntervalSelect.value);
    });

    // Automation buttons
    this.automationBtn.addEventListener('click', () => this.runAutomation());
    this.stopBtn.addEventListener('click', () => this.stopAutomation());

    // Content title input
    if (this.contentTitleInput) {
      this.contentTitleInput.addEventListener('input', () => {
        localStorage.setItem('tiktok_content_title', this.contentTitleInput.value);
      });
    }

    // AI Caption checkbox
    if (this.useAiCaptionCheckbox) {
      this.useAiCaptionCheckbox.addEventListener('change', () => {
        this.useAiCaption = this.useAiCaptionCheckbox.checked;
        localStorage.setItem('tiktok_use_ai_caption', this.useAiCaption);
      });
    }
  },

  /**
   * Switch mode - content mode only
   */
  switchMode(mode) {
    this.currentMode = 'content';
  },

  /**
   * Set default schedule time
   */
  setDefaultScheduleTime() {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(0);
    now.setSeconds(0);
    const formatted = now.toISOString().slice(0, 16);
    this.scheduleTimeInput.value = formatted;
  },

  /**
   * Load settings
   */
  loadSettings() {
    const savedContentTitle = localStorage.getItem('tiktok_content_title');
    if (savedContentTitle && this.contentTitleInput) this.contentTitleInput.value = savedContentTitle;

    const savedScheduleTime = localStorage.getItem('tiktok_schedule_time');
    if (savedScheduleTime) this.scheduleTimeInput.value = savedScheduleTime;

    const savedPostInterval = localStorage.getItem('tiktok_post_interval');
    if (savedPostInterval) this.postIntervalSelect.value = savedPostInterval;

    // Always content mode
    this.currentMode = 'content';

    // Load AI Caption setting (default: true)
    const savedUseAiCaption = localStorage.getItem('tiktok_use_ai_caption');
    this.useAiCaption = savedUseAiCaption !== 'false';
    if (this.useAiCaptionCheckbox) {
      this.useAiCaptionCheckbox.checked = this.useAiCaption;
    }
  },

  /**
   * Handle files
   */
  handleFiles(filesList) {
    const newFiles = Array.from(filesList);

    newFiles.forEach(file => {
      if (!this.files.find(f => f.name === file.name)) {
        this.files.push(file);
      }
    });

    this.updateFileDisplay();
  },

  /**
   * Update file display
   */
  updateFileDisplay() {
    const span = this.uploadArea.querySelector('span');
    if (this.files.length > 0) {
      span.textContent = `${this.files.length} ไฟล์`;
      this.uploadArea.classList.add('has-files');
      this.clearFilesBtn.style.display = 'flex';
    } else {
      span.textContent = 'เลือกไฟล์';
      this.uploadArea.classList.remove('has-files');
      this.clearFilesBtn.style.display = 'none';
    }
  },

  /**
   * Clear all files
   */
  clearAllFiles() {
    this.files = [];
    this.updateFileDisplay();
    showToast('ล้างไฟล์ทั้งหมดแล้ว', 'warning');
  },

  /**
   * File to DataURL
   */
  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /**
   * Get Gemini API Key
   */
  async getGeminiApiKey() {
    const result = await chrome.storage.local.get(['geminiApiKey']);
    return result.geminiApiKey || '';
  },

  /**
   * Get OpenAI API Key
   */
  async getOpenAIApiKey() {
    const result = await chrome.storage.local.get(['openaiApiKey']);
    return result.openaiApiKey || '';
  },

  /**
   * Get Selected Model (gemini or openai)
   */
  async getSelectedModel() {
    const result = await chrome.storage.local.get(['selectedModel']);
    return result.selectedModel || 'gemini';
  },

  /**
   * Send message to content script
   */
  sendMessage(tabId, message) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('sendMessage error:', chrome.runtime.lastError.message);
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        console.warn('sendMessage exception:', e);
        resolve({ success: false, error: e.message });
      }
    });
  },

  /**
   * Sleep with stop check
   */
  sleep(ms) {
    return new Promise(resolve => {
      const checkInterval = 100;
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += checkInterval;
        if (this.shouldStopAutomation || elapsed >= ms) {
          clearInterval(timer);
          resolve();
        }
      }, checkInterval);
    });
  },

  /**
   * Random sleep
   */
  randomSleep(minSec, maxSec) {
    const ms = Math.floor(Math.random() * (maxSec - minSec + 1) + minSec) * 1000;
    return this.sleep(ms);
  },

  /**
   * Update automation status
   */
  updateAutomationStatus(current, total, step) {
    const stepLabels = {
      'upload': 'กำลังอัพโหลดไฟล์...',
      'caption': 'กำลังสร้างแคปชั่น...',
      'fill': 'กำลังกรอกแคปชั่น...',
      'cart': 'กำลังปักตะกร้า...',
      'schedule': 'กำลังตั้งเวลาโพส...',
      'csv': 'กำลังบันทึก CSV...',
      'done': 'เสร็จสิ้น'
    };

    const label = stepLabels[step] || step;
    this.automationStatus.innerHTML = `
      <div class="current-step">${label}</div>
      <div class="progress-info">คลิปที่ ${current}/${total}</div>
    `;
    this.automationStatus.classList.add('active');
  },

  /**
   * Call Gemini API for caption
   */
  async callGeminiAPI(productName, apiKey) {
    const prompt = `สร้างแคปชั่น TikTok สำหรับคลิปสั้นในหัวข้อ "${productName}"

กฎเข้มงวด:
1. ข้อความดึงดูด น่าสนใจ กระชับ ไม่เกิน 100 ตัวอักษร
2. เขียนในเชิงให้ความรู้ เล่าเรื่อง หรือสร้างแรงบันดาลใจ
3. แฮชแท็ก: ไม่เกิน 5 อัน
4. อิโมจิ: 2-3 ตัว

รูปแบบผลลัพธ์:
[ข้อความแคปชั่น] #แฮชแท็ก1 #แฮชแท็ก2 #แฮชแท็ก3 #แฮชแท็ก4 #แฮชแท็ก5

ตอบแค่แคปชั่นบรรทัดเดียว ไม่ต้องอธิบาย`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'API Error');
    }

    const data = await response.json();
    let caption = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!caption) throw new Error('ไม่ได้รับข้อความจาก API');

    // Clean up
    caption = caption.trim()
      .replace(/\\\n/g, ' ')
      .replace(/\\$/gm, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Limit hashtags
    const hashtags = caption.match(/#[^\s#]+/g) || [];
    if (hashtags.length > 5) {
      const removeHashtags = hashtags.slice(5);
      for (const tag of removeHashtags) {
        caption = caption.replace(tag, '');
      }
      caption = caption.replace(/\s+/g, ' ').trim();
    }

    return caption;
  },

  /**
   * Call OpenAI API for caption
   */
  async callOpenAIAPI(productName, apiKey) {
    const prompt = `สร้างแคปชั่น TikTok สำหรับคลิปสั้นในหัวข้อ "${productName}"

กฎเข้มงวด:
1. ข้อความดึงดูด น่าสนใจ กระชับ ไม่เกิน 100 ตัวอักษร
2. เขียนในเชิงให้ความรู้ เล่าเรื่อง หรือสร้างแรงบันดาลใจ
3. แฮชแท็ก: ไม่เกิน 5 อัน
4. อิโมจิ: 2-3 ตัว

รูปแบบผลลัพธ์:
[ข้อความแคปชั่น] #แฮชแท็ก1 #แฮชแท็ก2 #แฮชแท็ก3 #แฮชแท็ก4 #แฮชแท็ก5

ตอบแค่แคปชั่นบรรทัดเดียว ไม่ต้องอธิบาย`;

    // Using OpenAI Responses API format (for gpt-5-nano)
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        instructions: 'คุณเป็นผู้เชี่ยวชาญสร้างแคปชั่น TikTok ภาษาไทย สไตล์ UGC ตอบแค่แคปชั่นบรรทัดเดียวเท่านั้น ห้ามอธิบายเพิ่มเติม',
        input: prompt,
        max_completion_tokens: 16000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'OpenAI API Error');
    }

    const data = await response.json();

    // Extract text from OpenAI Responses API format
    let caption = data.output_text;
    if (!caption) {
      const textOutput = data.output?.find(item => item.type === 'message');
      const content = textOutput?.content?.find(c => c.type === 'output_text');
      caption = content?.text;
    }

    if (!caption) throw new Error('ไม่ได้รับข้อความจาก OpenAI API');

    // Clean up
    caption = caption.trim()
      .replace(/\\\n/g, ' ')
      .replace(/\\$/gm, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Limit hashtags
    const hashtags = caption.match(/#[^\s#]+/g) || [];
    if (hashtags.length > 5) {
      const removeHashtags = hashtags.slice(5);
      for (const tag of removeHashtags) {
        caption = caption.replace(tag, '');
      }
      caption = caption.replace(/\s+/g, ' ').trim();
    }

    return caption;
  },

  /**
   * Run automation
   */
  async runAutomation() {
    const scheduleTime = this.scheduleTimeInput.value;
    const selectedModel = await this.getSelectedModel();
    const apiKey = selectedModel === 'openai'
      ? await this.getOpenAIApiKey()
      : await this.getGeminiApiKey();

    let productName = this.contentTitleInput?.value.trim() || '';
    if (!productName) {
      showToast('กรุณากรอกหัวข้อคลิป', 'error');
      return;
    }
    if (this.files.length === 0) {
      showToast('กรุณาเลือกไฟล์วิดีโอ', 'error');
      return;
    }

    if (!scheduleTime) {
      showToast('กรุณาเลือกเวลาเริ่มโพส', 'error');
      return;
    }
    // Only check API key if using AI caption
    if (this.useAiCaption && !apiKey) {
      const keyName = selectedModel === 'openai' ? 'OpenAI' : 'Gemini';
      showToast(`กรุณาตั้งค่า ${keyName} API Key`, 'error');
      return;
    }

    const isContentMode = true;

    // Check schedule time
    const startDate = new Date(scheduleTime);
    const now = new Date();
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);

    if (startDate <= now) {
      showToast('เวลาเริ่มต้องมากกว่าปัจจุบัน', 'error');
      return;
    }
    if (startDate > maxDate) {
      showToast('TikTok อนุญาตตั้งเวลาได้ไม่เกิน 30 วัน', 'error');
      return;
    }

    // Get tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('tiktok.com')) {
      showToast('กรุณาเปิดหน้า TikTok ก่อน', 'error');
      return;
    }

    // Prepare files list
    let filesToUpload = this.files;

    const clipCount = filesToUpload.length;
    this.scheduleHistory = [];
    this.isAutomationRunning = true;
    this.shouldStopAutomation = false;

    this.automationBtn.style.display = 'none';
    this.stopBtn.style.display = 'flex';

    await this.sendMessage(tab.id, { action: 'resetScheduleIndex' });

    for (let i = 0; i < clipCount; i++) {
      if (this.shouldStopAutomation) break;

      this.updateAutomationStatus(i + 1, clipCount, 'start');

      const currentProductName = productName;

      try {
        // Upload
        if (this.shouldStopAutomation) break;
        this.updateAutomationStatus(i + 1, clipCount, 'upload');

        const currentFile = filesToUpload[i];
        const fileData = {
          name: currentFile.name,
          type: currentFile.type,
          size: currentFile.size,
          dataUrl: await this.fileToDataUrl(currentFile)
        };

        await this.sendMessage(tab.id, {
          action: 'uploadToTikTok',
          files: [fileData],
          productName: currentProductName
        });
        await this.randomSleep(2, 4);

        // Caption & Fill caption (only if useAiCaption is enabled)
        let caption = '';
        if (this.useAiCaption) {
          // Generate caption with AI
          if (this.shouldStopAutomation) break;
          this.updateAutomationStatus(i + 1, clipCount, 'caption');
          caption = selectedModel === 'openai'
            ? await this.callOpenAIAPI(currentProductName, apiKey)
            : await this.callGeminiAPI(currentProductName, apiKey);
          this.captionEditor.value = caption;
          await this.randomSleep(2, 4);

          // Fill caption
          if (this.shouldStopAutomation) break;
          this.updateAutomationStatus(i + 1, clipCount, 'fill');
          await this.sendMessage(tab.id, { action: 'fillCaption', caption: caption });
          await this.randomSleep(2, 4);
        }

        // Schedule
        if (this.shouldStopAutomation) break;
        this.updateAutomationStatus(i + 1, clipCount, 'schedule');
        const scheduleResult = await this.sendMessage(tab.id, {
          action: 'schedulePost',
          scheduleTime: scheduleTime,
          postInterval: parseInt(this.postIntervalSelect.value)
        });

        if (scheduleResult && scheduleResult.success) {
          this.scheduleHistory.push({
            productName: currentProductName,
            caption,
            scheduleTime: scheduleResult.scheduleTime || scheduleTime,
            videoFileName: currentFile?.name || '-'
          });

        }

        await this.randomSleep(5, 8);

      } catch (error) {
        console.error('Automation error:', error);
      }
    }

    // Done
    if (this.shouldStopAutomation) {
      this.automationStatus.innerHTML = '';
      this.automationStatus.classList.remove('active');
      showToast('ยกเลิก Automation', 'warning');
    } else {
      this.updateAutomationStatus(clipCount, clipCount, 'csv');
      this.exportScheduleCSV();
      this.updateAutomationStatus(clipCount, clipCount, 'done');
      showToast(`Automation เสร็จสิ้น ${clipCount} คลิป`, 'success');
    }

    this.isAutomationRunning = false;
    this.shouldStopAutomation = false;
    this.automationBtn.style.display = 'flex';
    this.stopBtn.style.display = 'none';

  },

  /**
   * Stop automation
   */
  stopAutomation() {
    if (this.isAutomationRunning) {
      this.shouldStopAutomation = true;
      showToast('กำลังหยุด...', 'warning');
    }
  },

  /**
   * Export schedule CSV
   */
  exportScheduleCSV() {
    if (this.scheduleHistory.length === 0) return;

    const headers = ['หัวข้อคลิป', 'แคปชั่น', 'วันเวลาตั้งเวลา', 'ชื่อไฟล์วิดีโอ'];
    const rows = this.scheduleHistory.map(item => [
      `"${(item.productName || '').replace(/"/g, '""')}"`,
      `"${(item.caption || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      `"${(item.scheduleTime || '').replace(/"/g, '""')}"`,
      `"${(item.videoFileName || '').replace(/"/g, '""')}"`
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const filename = `tiktok_schedule_${dateStr}.csv`;

    // Download
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Format duration
   */
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  /**
   * Format file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
};

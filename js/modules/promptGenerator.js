/**
 * Prompt Generator Module
 * Generates prompts based on form data
 * Supports single prompt mode and scene list mode
 */
const PromptGenerator = {
  outputSection: null,
  outputTextarea: null,

  // Scene list state
  scenes: [],            // [{sceneNumber, imagePrompt, videoPrompt, status}]
  currentSceneIndex: 0,  // ตัวนับสำหรับ RUN consumption
  isSceneListMode: false,
  storyPlot: '',         // โครงเรื่องที่ AI สร้าง

  /**
   * Initialize prompt generator
   */
  init() {
    this.outputSection = document.getElementById('promptOutputSection');
    this.outputTextarea = document.getElementById('promptOutput');

    this.setupCopyButton();
    this.setupCopyAllButton();
  },

  /**
   * Setup copy button
   */
  setupCopyButton() {
    const copyBtn = document.getElementById('copyPromptBtn');
    copyBtn.addEventListener('click', async () => {
      const text = this.outputTextarea.value;
      if (text) {
        const success = await Helpers.copyToClipboard(text);
        if (success) {
          Helpers.showToast('Prompt copied to clipboard', 'success');
        } else {
          Helpers.showToast('Failed to copy prompt', 'error');
        }
      }
    });
  },

  /**
   * Setup copy all scenes button
   */
  setupCopyAllButton() {
    const copyAllBtn = document.getElementById('copyAllScenesBtn');
    if (!copyAllBtn) return;
    copyAllBtn.addEventListener('click', async () => {
      if (this.scenes.length === 0) return;
      let text = '';
      this.scenes.forEach((scene, i) => {
        text += `=== ฉาก ${i + 1} ===\n`;
        if (scene.imagePrompt) {
          text += `[Prompt ภาพ]\n${scene.imagePrompt}\n\n`;
        }
        if (scene.videoPrompt) {
          text += `[Prompt วิดีโอ]\n${scene.videoPrompt}\n\n`;
        }
      });
      const success = await Helpers.copyToClipboard(text.trim());
      if (success) {
        Helpers.showToast('คัดลอก prompt ทุกฉากแล้ว', 'success');
      }
    });
  },

  /**
   * Get form data
   * @returns {object}
   */
  getFormData() {
    return {
      productName: document.getElementById('productName').value.trim(),
      mainHeading: document.getElementById('mainHeading').value.trim(),
      subHeading: document.getElementById('subHeading').value.trim(),
      price: document.getElementById('price').value.trim(),
      hasProductImage: ImageUpload.getProductImage() !== null,
      hasPersonImage: ImageUpload.hasPersonImage(),
      ugcSettings: UGCSection.getSettings()
    };
  },

  /**
   * Generate prompt based on form data
   * @returns {string}
   */
  generate() {
    const data = this.getFormData();
    let prompt = '';

    prompt += `Create a professional product advertisement image.\n\n`;

    if (data.productName) {
      prompt += `Product: ${data.productName}\n`;
    }

    if (data.mainHeading) {
      prompt += `Main Heading: ${data.mainHeading}\n`;
    }

    if (data.subHeading) {
      prompt += `Sub Heading: ${data.subHeading}\n`;
    }

    if (data.price) {
      prompt += `Price: ${data.price}\n`;
    }

    prompt += `\n`;

    if (data.hasProductImage) {
      prompt += `[Product image provided - use as reference]\n`;
    }

    if (data.hasPersonImage) {
      prompt += `[Person/Model image provided - use as reference]\n`;
    } else if (UGCSection.isActive()) {
      const { gender, ageRange } = data.ugcSettings;
      if (gender || ageRange) {
        prompt += `UGC Character: `;
        if (gender) prompt += `${gender}`;
        if (gender && ageRange) prompt += `, `;
        if (ageRange) prompt += `age ${ageRange}`;
        prompt += `\n`;
      }
    }

    prompt += `\nStyle: Clean, modern, professional product advertisement with white background, high quality lighting, and clear product focus.`;

    return prompt;
  },

  /**
   * Show generated prompt
   */
  showPrompt() {
    const prompt = this.generate();
    this.outputTextarea.value = prompt;
    this.outputSection.hidden = false;
    this.outputSection.scrollIntoView({ behavior: 'smooth' });
    Helpers.showToast('Prompt generated', 'success');
  },

  /**
   * Get current prompt
   * @returns {string}
   */
  getPrompt() {
    return this.outputTextarea.value;
  },

  /**
   * Set prompt from AI response (single prompt mode)
   * @param {string} prompt - Generated prompt
   */
  setPrompt(prompt) {
    // Switch back to single prompt mode
    this.showSinglePromptMode();
    this.outputTextarea.value = prompt;
    this.outputSection.hidden = false;
    this.outputSection.style.display = 'block';
    this.outputSection.scrollIntoView({ behavior: 'smooth' });
  },

  /**
   * Clear prompt output
   */
  clear() {
    this.outputTextarea.value = '';
    this.outputSection.hidden = true;
    this.scenes = [];
    this.isSceneListMode = false;
    this.currentSceneIndex = 0;
    this.storyPlot = '';
  },

  // ===================== Scene List Mode =====================

  /**
   * Initialize scene list with N empty slots
   * @param {number} count - Number of scenes
   */
  initSceneList(count) {
    this.scenes = [];
    for (let i = 0; i < count; i++) {
      this.scenes.push({
        sceneNumber: i + 1,
        imagePrompt: '',
        videoPrompt: '',
        status: 'pending'
      });
    }
    this.currentSceneIndex = 0;
    this.isSceneListMode = true;
    this.showSceneListMode();
    this.renderSceneList();
  },

  /**
   * Show scene list mode, hide single prompt mode
   */
  showSceneListMode() {
    const singleWrapper = document.getElementById('singlePromptWrapper');
    const sceneWrapper = document.getElementById('sceneListWrapper');
    const badge = document.getElementById('sceneCountBadge');

    if (singleWrapper) singleWrapper.hidden = true;
    if (sceneWrapper) sceneWrapper.hidden = false;
    if (badge) {
      badge.textContent = `${this.scenes.length} ฉาก`;
      badge.hidden = false;
    }

    this.outputSection.hidden = false;
    this.outputSection.style.display = 'block';
  },

  /**
   * Show single prompt mode, hide scene list mode
   */
  showSinglePromptMode() {
    const singleWrapper = document.getElementById('singlePromptWrapper');
    const sceneWrapper = document.getElementById('sceneListWrapper');
    const badge = document.getElementById('sceneCountBadge');

    if (singleWrapper) singleWrapper.hidden = false;
    if (sceneWrapper) sceneWrapper.hidden = true;
    if (badge) badge.hidden = true;

    this.isSceneListMode = false;
  },

  /**
   * Update scene status
   */
  updateSceneStatus(index, status) {
    if (index >= 0 && index < this.scenes.length) {
      this.scenes[index].status = status;
      this.renderSceneCard(index);
    }
  },

  /**
   * Set image prompt for a scene
   */
  setSceneImagePrompt(index, text) {
    if (index >= 0 && index < this.scenes.length) {
      this.scenes[index].imagePrompt = text;
      this.renderSceneCard(index);
    }
  },

  /**
   * Set video prompt for a scene
   */
  setSceneVideoPrompt(index, text) {
    if (index >= 0 && index < this.scenes.length) {
      this.scenes[index].videoPrompt = text;
      this.renderSceneCard(index);
    }
  },

  /**
   * Set story plot and render in UI
   */
  setStoryPlot(plot) {
    this.storyPlot = plot;
    this.renderPlotCard();
  },

  /**
   * Render plot card at top of scene list
   */
  renderPlotCard() {
    const container = document.getElementById('sceneList');
    if (!container) return;

    // ลบ plot card เก่า (ถ้ามี)
    const existing = container.querySelector('.plot-card');
    if (existing) existing.remove();

    if (!this.storyPlot) return;

    const card = document.createElement('div');
    card.className = 'plot-card';
    card.innerHTML = `
      <div class="plot-header">
        <span class="plot-label">โครงเรื่อง</span>
      </div>
      <div class="plot-text">${this._escapeHtml(this.storyPlot)}</div>`;

    // ใส่ไว้บนสุด
    container.insertBefore(card, container.firstChild);
  },

  /**
   * Render all scene cards
   */
  renderSceneList() {
    const container = document.getElementById('sceneList');
    if (!container) return;
    container.innerHTML = '';

    // render plot card ก่อน (ถ้ามี)
    this.renderPlotCard();

    this.scenes.forEach((_, i) => {
      const card = this._createSceneCardElement(i);
      container.appendChild(card);
    });
  },

  /**
   * Re-render a single scene card (progressive update)
   */
  renderSceneCard(index) {
    const container = document.getElementById('sceneList');
    if (!container) return;
    const existingCard = container.querySelector(`[data-scene-index="${index}"]`);
    const newCard = this._createSceneCardElement(index);
    if (existingCard) {
      existingCard.replaceWith(newCard);
    } else {
      container.appendChild(newCard);
    }
  },

  /**
   * Create DOM element for a scene card
   */
  _createSceneCardElement(index) {
    const scene = this.scenes[index];
    const statusLabels = {
      pending: 'รอสร้าง',
      generating: 'กำลังสร้าง...',
      ready: 'พร้อม',
      used: 'ใช้แล้ว'
    };

    const card = document.createElement('div');
    card.className = 'scene-card';
    card.dataset.sceneIndex = index;
    card.dataset.status = scene.status;

    const truncate = (str, len = 80) => str.length > len ? str.substring(0, len) + '…' : str;

    let html = `
      <div class="scene-header">
        <span class="scene-label">ฉาก ${scene.sceneNumber}</span>
        <span class="scene-status">${statusLabels[scene.status] || scene.status}</span>
      </div>`;

    // แสดง image prompt ทุกฉากที่มี (ตัดสั้น + ปุ่ม copy)
    if (scene.imagePrompt || index === 0) {
      html += `
      <div class="scene-prompt-group">
        <div class="scene-prompt-header">
          <label>Prompt ภาพ:</label>
          ${scene.imagePrompt ? `<button class="scene-copy-btn" data-copy-type="image" data-scene="${index}" title="Copy">📋</button>` : ''}
        </div>
        <div class="scene-prompt-text">${scene.imagePrompt ? this._escapeHtml(truncate(scene.imagePrompt)) : '<em style="color:#999">-</em>'}</div>
      </div>`;
    }

    html += `
      <div class="scene-prompt-group">
        <div class="scene-prompt-header">
          <label>Prompt วิดีโอ:</label>
          ${scene.videoPrompt ? `<button class="scene-copy-btn" data-copy-type="video" data-scene="${index}" title="Copy">📋</button>` : ''}
        </div>
        <div class="scene-prompt-text">${scene.videoPrompt ? this._escapeHtml(truncate(scene.videoPrompt)) : '<em style="color:#999">-</em>'}</div>
      </div>`;

    card.innerHTML = html;

    // ผูก event ปุ่ม copy
    card.querySelectorAll('.scene-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = btn.dataset.copyType;
        const idx = parseInt(btn.dataset.scene);
        const text = type === 'image' ? this.scenes[idx].imagePrompt : this.scenes[idx].videoPrompt;
        if (text) {
          Helpers.copyToClipboard(text).then(() => {
            Helpers.showToast(`คัดลอก prompt ${type === 'image' ? 'ภาพ' : 'วิดีโอ'} ฉาก ${idx + 1} แล้ว`, 'success');
          });
        }
      });
    });

    return card;
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // ===================== RUN Integration =====================

  hasSceneList() {
    return this.isSceneListMode && this.scenes.length > 0 && this.scenes.some(s => s.status === 'ready');
  },

  getImagePrompt(index = 0) {
    if (index >= 0 && index < this.scenes.length) {
      return this.scenes[index].imagePrompt || '';
    }
    return '';
  },

  getVideoPrompt(index) {
    if (index >= 0 && index < this.scenes.length) {
      return this.scenes[index].videoPrompt;
    }
    return '';
  },

  resetRunIndex() {
    this.currentSceneIndex = 0;
  },

  advanceScene() {
    this.currentSceneIndex++;
  }
};

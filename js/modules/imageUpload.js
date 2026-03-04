/**
 * Image Upload Module
 * Handles person/character image upload with drag & drop
 */
const ImageUpload = {
  personImage: null,

  /**
   * Initialize image upload handlers
   */
  init() {
    this.setupImageUpload('person');
    this.loadSavedImages();
  },

  /**
   * Load saved images from storage
   */
  loadSavedImages() {
    chrome.storage.local.get(['savedPersonImage'], (result) => {
      if (result.savedPersonImage) {
        this.restoreImage('person', result.savedPersonImage);
      }
    });
  },

  /**
   * Restore image from saved data
   */
  restoreImage(type, base64) {
    const preview = document.getElementById('personImagePreview');
    const box = document.getElementById('personImageBox');
    const removeBtn = box.querySelector('.remove-image-btn');
    const placeholder = box.querySelector('.upload-placeholder');

    this.personImage = base64;

    preview.src = base64;
    preview.hidden = false;
    removeBtn.hidden = false;
    placeholder.hidden = true;

    UGCSection.updateState();
  },

  /**
   * Setup image upload with drag & drop
   */
  setupImageUpload(type) {
    const box = document.getElementById('personImageBox');
    const input = document.getElementById('personImageInput');
    const preview = document.getElementById('personImagePreview');
    const removeBtn = box.querySelector('.remove-image-btn');
    const placeholder = box.querySelector('.upload-placeholder');

    // Click to upload
    box.addEventListener('click', (e) => {
      if (e.target !== removeBtn) {
        input.click();
      }
    });

    // File input change
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleImageUpload(file, preview, removeBtn, placeholder);
      }
    });

    // Remove button
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeImage(preview, removeBtn, placeholder, input);
    });

    // Drag & Drop
    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      box.classList.add('dragover');
    });

    box.addEventListener('dragleave', (e) => {
      e.preventDefault();
      box.classList.remove('dragover');
    });

    box.addEventListener('drop', (e) => {
      e.preventDefault();
      box.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) {
        this.handleImageUpload(file, preview, removeBtn, placeholder);
      }
    });
  },

  /**
   * Handle image upload
   */
  async handleImageUpload(file, preview, removeBtn, placeholder) {
    if (!file.type.startsWith('image/')) {
      Helpers.showToast('กรุณาเลือกไฟล์รูปภาพ', 'error');
      return;
    }

    try {
      const base64 = await Helpers.fileToBase64(file);

      this.personImage = base64;
      chrome.storage.local.set({ savedPersonImage: base64 });
      UGCSection.updateState();

      preview.src = base64;
      preview.hidden = false;
      removeBtn.hidden = false;
      placeholder.hidden = true;

      Helpers.showToast('อัพโหลดภาพคนแล้ว', 'success');
    } catch (error) {
      console.error('Error uploading image:', error);
      Helpers.showToast('อัพโหลดไม่สำเร็จ', 'error');
    }
  },

  /**
   * Remove image
   */
  removeImage(preview, removeBtn, placeholder, input) {
    this.personImage = null;
    chrome.storage.local.remove(['savedPersonImage']);
    UGCSection.updateState();

    preview.src = '';
    preview.hidden = true;
    removeBtn.hidden = true;
    placeholder.hidden = false;
    input.value = '';
  },

  /**
   * Get product image (always null — Flow Story has no product image)
   */
  async getProductImage() {
    return null;
  },

  /**
   * Get person image
   */
  async getPersonImage() {
    return this.personImage;
  },

  /**
   * Check if person image exists
   */
  async hasPersonImage() {
    return this.personImage !== null;
  },

  /**
   * Get character name (from the name input field)
   */
  async getProductName() {
    return document.getElementById('productName').value.trim();
  },

  /**
   * Get reviewer gender
   */
  async getReviewerGender() {
    const selected = document.querySelector('input[name="reviewerGender"]:checked');
    return selected ? selected.value : 'female';
  },

  /**
   * Synchronous versions
   */
  getProductImageSync() {
    return null;
  },

  getPersonImageSync() {
    return this.personImage;
  },

  hasPersonImageSync() {
    return this.personImage !== null;
  },

};

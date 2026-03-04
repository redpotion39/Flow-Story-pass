/**
 * TikTok Selectors
 * จัดการ selectors เฉพาะสำหรับ TikTok Studio page
 * รองรับ upload, editor, publish workflows
 */

Object.assign(Controls, {

  // TikTok Studio selectors หลัก
  TIKTOK_SELECTORS: {
    // Upload page
    uploadCard: '[data-e2e="upload-card"]',
    uploadInput: '[data-e2e="upload-card"] input[type="file"]',
    uploadDropzone: '[data-e2e="upload-dropzone"]',
    uploadProgress: '[data-e2e="upload-progress-bar"]',
    uploadStatus: '[data-e2e="upload-status-text"]',

    // Video editor
    editorContainer: '[data-e2e="video-editor-container"]',
    editorTimeline: '[data-e2e="editor-timeline"]',
    editorCanvas: '[data-e2e="editor-preview-canvas"]',
    editorToolbar: '[data-e2e="editor-toolbar"]',
    editorTrimHandle: '[data-e2e="trim-handle"]',
    editorPlayButton: '[data-e2e="editor-play-btn"]',
    editorSplitButton: '[data-e2e="editor-split-btn"]',

    // Caption / Description
    captionInput: '[data-e2e="caption-textarea"]',
    captionCounter: '[data-e2e="caption-char-count"]',
    hashtagSuggestion: '[data-e2e="hashtag-suggestion-list"]',
    hashtagItem: '[data-e2e="hashtag-suggestion-item"]',
    mentionSuggestion: '[data-e2e="mention-suggestion-list"]',

    // Cover image
    coverSelector: '[data-e2e="cover-selector"]',
    coverUploadBtn: '[data-e2e="cover-upload-btn"]',
    coverPreview: '[data-e2e="cover-preview-img"]',
    coverCropArea: '[data-e2e="cover-crop-area"]',

    // Settings
    privacySelect: '[data-e2e="privacy-select"]',
    commentToggle: '[data-e2e="comment-toggle"]',
    duetToggle: '[data-e2e="duet-toggle"]',
    stitchToggle: '[data-e2e="stitch-toggle"]',
    scheduleToggle: '[data-e2e="schedule-toggle"]',
    scheduleDatePicker: '[data-e2e="schedule-date-picker"]',

    // Publish
    publishBtn: '[data-e2e="publish-btn"]',
    draftBtn: '[data-e2e="save-draft-btn"]',
    discardBtn: '[data-e2e="discard-btn"]',
    publishConfirmModal: '[data-e2e="publish-confirm-modal"]',
    publishSuccessToast: '[data-e2e="publish-success-toast"]',

    // Product / Showcase
    productLink: '[data-e2e="product-link-btn"]',
    productSearch: '[data-e2e="product-search-input"]',
    productList: '[data-e2e="product-list-container"]',
    productItem: '[data-e2e="product-list-item"]',
    productSelected: '[data-e2e="selected-product-tag"]'
  },

  // URL patterns สำหรับ TikTok Studio pages
  TIKTOK_URL_PATTERNS: {
    studio: /^https:\/\/www\.tiktok\.com\/tiktokstudio/,
    upload: /^https:\/\/www\.tiktok\.com\/tiktokstudio\/upload/,
    content: /^https:\/\/www\.tiktok\.com\/tiktokstudio\/content/,
    analytics: /^https:\/\/www\.tiktok\.com\/tiktokstudio\/analytics/
  },

  /**
   * ดึง TikTok selector ตามชื่อ
   * @param {string} name - ชื่อ selector
   * @returns {string|null}
   */
  getTiktokSelector(name) {
    try {
      const selector = this.TIKTOK_SELECTORS[name];
      if (!selector) {
        console.log('[TikTokSelectors] ไม่พบ selector:', name);
        return null;
      }
      return selector;
    } catch (err) {
      console.error('[TikTokSelectors] getTiktokSelector error:', err);
      return null;
    }
  },

  /**
   * ค้นหา TikTok element ตาม type
   * รองรับ fallback ถ้า data-e2e ไม่เจอ
   * @param {string} type - ชื่อ key ใน TIKTOK_SELECTORS
   * @returns {Element|null}
   */
  findTiktokElement(type) {
    try {
      const selector = this.getTiktokSelector(type);
      if (!selector) return null;

      // ลอง data-e2e selector ก่อน
      let element = document.querySelector(selector);
      if (element) {
        console.log('[TikTokSelectors] พบ element:', type);
        return element;
      }

      // fallback: ลองหาจาก aria-label
      const ariaLabel = type.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
      element = document.querySelector(`[aria-label*="${ariaLabel}"]`);
      if (element) {
        console.log('[TikTokSelectors] พบ element จาก aria-label:', ariaLabel);
        return element;
      }

      // fallback: ลองหาจาก class name patterns
      const classPatterns = {
        uploadCard: '.upload-card, .upload-area',
        captionInput: '.caption-editor textarea, .DraftEditor-root',
        publishBtn: '.btn-publish, button[class*="publish"]',
        editorContainer: '.video-editor, .editor-wrapper'
      };

      if (classPatterns[type]) {
        element = document.querySelector(classPatterns[type]);
        if (element) {
          console.log('[TikTokSelectors] พบ element จาก class pattern:', type);
          return element;
        }
      }

      console.log('[TikTokSelectors] ไม่พบ element:', type);
      return null;
    } catch (err) {
      console.error('[TikTokSelectors] findTiktokElement error:', err);
      return null;
    }
  },

  /**
   * รอจนกว่า TikTok Studio UI จะโหลดเสร็จ
   * @param {number} timeout - เวลา timeout เป็น ms
   * @returns {Promise<boolean>}
   */
  async waitForTiktokUI(timeout = 20000) {
    try {
      console.log('[TikTokSelectors] รอ TikTok Studio UI โหลด...');
      const startTime = Date.now();

      // รอ key elements ที่แสดงว่า page โหลดเสร็จ
      const requiredElements = ['editorContainer', 'captionInput', 'publishBtn'];

      while (Date.now() - startTime < timeout) {
        let foundCount = 0;

        for (const name of requiredElements) {
          const selector = this.getTiktokSelector(name);
          if (selector && document.querySelector(selector)) {
            foundCount++;
          }
        }

        if (foundCount >= 2) {
          console.log(`[TikTokSelectors] UI โหลดเสร็จ (พบ ${foundCount}/${requiredElements.length} elements)`);
          return true;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('[TikTokSelectors] timeout รอ TikTok Studio UI');
      Helpers.showToast('TikTok Studio โหลดไม่เสร็จ', 'error');
      return false;
    } catch (err) {
      console.error('[TikTokSelectors] waitForTiktokUI error:', err);
      return false;
    }
  },

  /**
   * ตรวจสอบว่าอยู่ใน TikTok Studio page หรือไม่
   * @returns {boolean}
   */
  isTiktokStudioPage() {
    try {
      const url = window.location.href;
      const isStudio = this.TIKTOK_URL_PATTERNS.studio.test(url);
      console.log('[TikTokSelectors] isTiktokStudioPage:', isStudio, url);
      return isStudio;
    } catch (err) {
      console.error('[TikTokSelectors] isTiktokStudioPage error:', err);
      return false;
    }
  },

  /**
   * ค้นหา video editor container พร้อม internal elements
   * @returns {Object|null} object ที่มี element references
   */
  getTiktokVideoEditor() {
    try {
      const container = this.findTiktokElement('editorContainer');
      if (!container) {
        console.log('[TikTokSelectors] ไม่พบ video editor container');
        return null;
      }

      // ค้นหา internal elements
      const editor = {
        container: container,
        timeline: container.querySelector(this.TIKTOK_SELECTORS.editorTimeline),
        canvas: container.querySelector(this.TIKTOK_SELECTORS.editorCanvas),
        toolbar: container.querySelector(this.TIKTOK_SELECTORS.editorToolbar),
        playButton: container.querySelector(this.TIKTOK_SELECTORS.editorPlayButton),
        splitButton: container.querySelector(this.TIKTOK_SELECTORS.editorSplitButton)
      };

      const foundCount = Object.values(editor).filter(v => v !== null).length;
      console.log(`[TikTokSelectors] Video editor: ${foundCount}/${Object.keys(editor).length} elements พบ`);

      return editor;
    } catch (err) {
      console.error('[TikTokSelectors] getTiktokVideoEditor error:', err);
      Helpers.showToast('ไม่สามารถเข้าถึง video editor', 'error');
      return null;
    }
  },

  /**
   * ดึง current page type ของ TikTok Studio
   * @returns {string|null} - 'upload', 'content', 'analytics', หรือ null
   */
  getTiktokPageType() {
    try {
      const url = window.location.href;
      for (const [type, pattern] of Object.entries(this.TIKTOK_URL_PATTERNS)) {
        if (type !== 'studio' && pattern.test(url)) {
          console.log('[TikTokSelectors] page type:', type);
          return type;
        }
      }
      return this.TIKTOK_URL_PATTERNS.studio.test(url) ? 'studio' : null;
    } catch (err) {
      console.error('[TikTokSelectors] getTiktokPageType error:', err);
      return null;
    }
  }
});

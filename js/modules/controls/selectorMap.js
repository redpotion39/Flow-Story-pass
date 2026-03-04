/**
 * Selector Map
 * จัดการ mapping ของ selectors สำหรับ UI elements ต่างๆ
 * รองรับหลาย environment (production, staging, development)
 */

Object.assign(Controls, {

  // ค่าคงที่สำหรับ selector versions
  SELECTOR_VERSION: '6.0.2',
  SELECTOR_CACHE_TTL: 300000, // 5 นาที

  // แมป selectors หลักสำหรับ production
  SELECTOR_MAP: {
    modeButton: 'button[data-radix-trigger="mode-select"]',
    videoTab: '[data-radix-collection-item][data-value="video"]',
    imageTab: '[data-radix-collection-item][data-value="image"]',
    promptInput: 'textarea[data-radix-input="prompt-field"]',
    createButton: 'button[data-radix-trigger="create-action"]',
    outputGrid: 'div[role="tabpanel"][data-state="active"] .output-grid',
    downloadButton: 'button[data-radix-action="download"]',
    settingsMenu: '[data-radix-menu-content][data-side="bottom"]',
    aspectRatio: 'button[data-radix-trigger="aspect-select"]',
    qualitySlider: 'input[data-radix-slider="quality"]',
    styleDropdown: '[data-radix-select-trigger][data-placeholder="style"]',
    batchSize: 'input[data-radix-input="batch-count"]',
    progressBar: '[data-radix-progress][role="progressbar"]',
    previewCanvas: 'canvas[data-radix-preview="main"]',
    historyPanel: 'div[data-radix-scroll-area="history"]'
  },

  // แมป icons สำหรับค้นหา element
  ICON_MAP: {
    mode: 'aspect_ratio',
    video: 'smart_display',
    image: 'create',
    download: 'movie_creation',
    settings: 'tune',
    refresh: 'autorenew',
    expand: 'open_in_full',
    close: 'cancel'
  },

  // profiles สำหรับแต่ละ environment
  ENVIRONMENT_PROFILES: {
    production: {
      baseSelector: '[data-radix-root]',
      menuTrigger: 'button[data-radix-trigger="mode-select"]',
      iconContainer: '.material-symbols-outlined',
      popupContent: '[data-radix-popper-content-wrapper]',
      overlayBackdrop: '[data-radix-overlay][data-state="open"]'
    },
    staging: {
      baseSelector: '[data-radix-root-staging]',
      menuTrigger: 'button[data-radix-trigger="mode-select-v2"]',
      iconContainer: '.material-icons-round',
      popupContent: '[data-radix-popper-content-wrapper-v2]',
      overlayBackdrop: '[data-radix-overlay-v2][data-state="open"]'
    },
    development: {
      baseSelector: '#dev-root [data-radix-root]',
      menuTrigger: 'button[data-test-id="mode-trigger"]',
      iconContainer: '.icon-dev',
      popupContent: '[data-test-id="popper-content"]',
      overlayBackdrop: '[data-test-id="overlay"]'
    }
  },

  // cache สำหรับเก็บ resolved selectors
  _selectorCache: {},
  _cacheTimestamp: 0,

  /**
   * ดึง selector ตาม name และ environment
   * @param {string} name - ชื่อ selector
   * @param {string} env - environment (production/staging/development)
   * @returns {string|null} selector string
   */
  getSelector(name, env = 'production') {
    try {
      // เช็ค cache ก่อน
      const cacheKey = `${env}:${name}`;
      if (this._selectorCache[cacheKey] && Date.now() - this._cacheTimestamp < this.SELECTOR_CACHE_TTL) {
        console.log('[SelectorMap] ใช้ cache:', cacheKey);
        return this._selectorCache[cacheKey];
      }

      // ลองหาจาก environment profile ก่อน
      const profile = this.ENVIRONMENT_PROFILES[env];
      if (profile && profile[name]) {
        this._selectorCache[cacheKey] = profile[name];
        this._cacheTimestamp = Date.now();
        return profile[name];
      }

      // ถ้าไม่เจอใน profile ให้หาจาก SELECTOR_MAP
      if (this.SELECTOR_MAP[name]) {
        this._selectorCache[cacheKey] = this.SELECTOR_MAP[name];
        this._cacheTimestamp = Date.now();
        return this.SELECTOR_MAP[name];
      }

      console.log('[SelectorMap] ไม่พบ selector:', name);
      return null;
    } catch (err) {
      console.error('[SelectorMap] getSelector error:', err);
      return null;
    }
  },

  /**
   * ค้นหา element จาก selector key
   * @param {string} selectorKey - ชื่อ key ใน SELECTOR_MAP
   * @returns {Element|null}
   */
  resolveElement(selectorKey) {
    try {
      const selector = this.getSelector(selectorKey);
      if (!selector) {
        console.log('[SelectorMap] ไม่มี selector สำหรับ key:', selectorKey);
        return null;
      }

      const element = document.querySelector(selector);
      if (!element) {
        // ลองหาด้วย icon name แทน
        const iconName = this.ICON_MAP[selectorKey];
        if (iconName) {
          console.log('[SelectorMap] ลองหาจาก icon:', iconName);
          const icons = document.querySelectorAll('.material-symbols-outlined');
          for (const icon of icons) {
            if (icon.textContent.trim() === iconName) {
              return icon.closest('button') || icon.parentElement;
            }
          }
        }
        return null;
      }

      console.log('[SelectorMap] พบ element:', selectorKey);
      return element;
    } catch (err) {
      console.error('[SelectorMap] resolveElement error:', err);
      Helpers.showToast('ไม่สามารถค้นหา element ได้', 'error');
      return null;
    }
  },

  /**
   * รอจนกว่า selector จะปรากฏใน DOM
   * @param {string} selector - CSS selector
   * @param {number} timeout - เวลา timeout เป็น ms
   * @returns {Promise<Element|null>}
   */
  async waitForSelector(selector, timeout = 10000) {
    try {
      const startTime = Date.now();
      console.log('[SelectorMap] รอ selector:', selector);

      while (Date.now() - startTime < timeout) {
        const element = document.querySelector(selector);
        if (element) {
          console.log('[SelectorMap] พบ selector แล้ว:', selector);
          return element;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      console.log('[SelectorMap] timeout สำหรับ selector:', selector);
      return null;
    } catch (err) {
      console.error('[SelectorMap] waitForSelector error:', err);
      return null;
    }
  },

  /**
   * ดึง version ของ selector map ปัจจุบัน
   * @returns {string}
   */
  getSelectorVersion() {
    return this.SELECTOR_VERSION;
  },

  /**
   * อัพเดท cache ของ selectors ทั้งหมด
   * ใช้เมื่อมีการเปลี่ยน environment หรือ page reload
   */
  async updateSelectorCache() {
    try {
      console.log('[SelectorMap] อัพเดท selector cache...');
      this._selectorCache = {};
      this._cacheTimestamp = 0;

      // โหลด config จาก storage ถ้ามี
      const stored = await new Promise(resolve => {
        chrome.storage.local.get(['selectorConfig'], (result) => {
          resolve(result.selectorConfig || null);
        });
      });

      if (stored && stored.version === this.SELECTOR_VERSION) {
        console.log('[SelectorMap] ใช้ config จาก storage');
        Object.assign(this.SELECTOR_MAP, stored.selectors);
      }

      // pre-warm cache สำหรับ selectors ที่ใช้บ่อย
      const frequentKeys = ['modeButton', 'videoTab', 'createButton', 'downloadButton'];
      for (const key of frequentKeys) {
        this.getSelector(key);
      }

      console.log('[SelectorMap] อัพเดท cache เสร็จสิ้น');
    } catch (err) {
      console.error('[SelectorMap] updateSelectorCache error:', err);
      Helpers.showToast('อัพเดท selector cache ล้มเหลว', 'error');
    }
  },

  /**
   * ตรวจสอบว่า selectors ยังใช้งานได้อยู่หรือไม่
   * @returns {Promise<Object>} ผลการตรวจสอบ
   */
  async validateSelectors() {
    try {
      const results = {};
      for (const [key, selector] of Object.entries(this.SELECTOR_MAP)) {
        const element = document.querySelector(selector);
        results[key] = {
          selector: selector,
          found: !!element,
          tagName: element ? element.tagName : null
        };
      }

      const validCount = Object.values(results).filter(r => r.found).length;
      console.log(`[SelectorMap] ตรวจสอบเสร็จ: ${validCount}/${Object.keys(results).length} พบ`);
      return results;
    } catch (err) {
      console.error('[SelectorMap] validateSelectors error:', err);
      return {};
    }
  }
});

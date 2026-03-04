/**
 * Element Resolver
 * ค้นหา elements ด้วย XPath, TreeWalker, MutationObserver
 * รองรับ Shadow DOM และ dynamic content
 */

Object.assign(Controls, {

  // XPath patterns ที่ใช้บ่อย
  XPATH_PATTERNS: {
    modeButton: '//button[contains(@class, "radix-trigger")]//span[text()="aspect_ratio"]/ancestor::button',
    videoIcon: '//span[contains(@class, "material-symbols")][ text()="smart_display"]/parent::*',
    createIcon: '//span[contains(@class, "material-symbols")][text()="create"]/ancestor::button',
    downloadBtn: '//button[@data-radix-action="download"]',
    activeTab: '//div[@role="tabpanel"][@data-state="active"]',
    popupMenu: '//div[@data-radix-popper-content-wrapper]//div[@role="menu"]',
    progressIndicator: '//div[@role="progressbar"][@data-radix-progress]'
  },

  // observer instances ที่กำลังทำงาน
  _activeObservers: new Map(),
  _resolverTimeout: 15000,

  /**
   * ค้นหา element ด้วย XPath expression
   * @param {string} xpath - XPath expression
   * @returns {Element|null}
   */
  resolveByXPath(xpath) {
    try {
      console.log('[ElementResolver] ค้นหาด้วย XPath:', xpath);

      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );

      const element = result.singleNodeValue;
      if (element) {
        console.log('[ElementResolver] พบ element จาก XPath:', element.tagName);
        return element;
      }

      console.log('[ElementResolver] ไม่พบ element จาก XPath');
      return null;
    } catch (err) {
      console.error('[ElementResolver] resolveByXPath error:', err);
      return null;
    }
  },

  /**
   * ค้นหา element ด้วย TreeWalker พร้อม filter
   * เหมาะสำหรับค้นหาที่ซับซ้อนกว่า querySelector
   * @param {Element} root - element เริ่มต้น
   * @param {Function} filter - ฟังก์ชัน filter สำหรับแต่ละ node
   * @returns {Element|null}
   */
  resolveByTreeWalker(root, filter) {
    try {
      if (!root) {
        root = document.body;
      }

      console.log('[ElementResolver] เริ่ม TreeWalker จาก:', root.tagName);

      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(node) {
            // ข้าม elements ที่ซ่อนอยู่
            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT;
            }

            if (filter(node)) {
              return NodeFilter.FILTER_ACCEPT;
            }

            return NodeFilter.FILTER_SKIP;
          }
        }
      );

      const firstMatch = walker.nextNode();
      if (firstMatch) {
        console.log('[ElementResolver] TreeWalker พบ:', firstMatch.tagName, firstMatch.className);
        return firstMatch;
      }

      console.log('[ElementResolver] TreeWalker ไม่พบ element ที่ตรงเงื่อนไข');
      return null;
    } catch (err) {
      console.error('[ElementResolver] resolveByTreeWalker error:', err);
      return null;
    }
  },

  /**
   * รอจนกว่า Shadow DOM ภายใน host จะพร้อม แล้วค้นหา selector
   * @param {Element} host - Shadow DOM host element
   * @param {string} selector - CSS selector ภายใน shadow root
   * @param {number} timeout - เวลา timeout เป็น ms
   * @returns {Promise<Element|null>}
   */
  async waitForShadowDOM(host, selector, timeout = 10000) {
    try {
      console.log('[ElementResolver] รอ Shadow DOM:', selector);
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        // เช็คว่ามี shadow root หรือยัง
        if (host.shadowRoot) {
          const element = host.shadowRoot.querySelector(selector);
          if (element) {
            console.log('[ElementResolver] พบ element ใน Shadow DOM:', selector);
            return element;
          }
        }

        // ลอง attachShadow ถ้าเป็น open mode
        try {
          if (!host.shadowRoot) {
            const shadowContent = host.querySelector(selector);
            if (shadowContent) {
              return shadowContent;
            }
          }
        } catch (e) {
          // shadow root อาจเป็น closed mode
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      console.log('[ElementResolver] timeout รอ Shadow DOM:', selector);
      Helpers.showToast('ไม่พบ element ใน Shadow DOM', 'error');
      return null;
    } catch (err) {
      console.error('[ElementResolver] waitForShadowDOM error:', err);
      return null;
    }
  },

  /**
   * สังเกตการเปลี่ยนแปลงของ element ด้วย MutationObserver
   * @param {Element} target - element ที่จะสังเกต
   * @param {Function} callback - ฟังก์ชันเรียกเมื่อมีการเปลี่ยนแปลง
   * @param {Object} options - ตัวเลือก MutationObserver
   * @returns {string} observer ID สำหรับใช้ยกเลิก
   */
  observeElement(target, callback, options = {}) {
    try {
      const observerId = `obs_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      console.log('[ElementResolver] สร้าง observer:', observerId);

      const defaultOptions = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-state', 'class', 'style', 'aria-expanded']
      };

      const mergedOptions = { ...defaultOptions, ...options };

      const observer = new MutationObserver((mutations) => {
        try {
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              console.log('[ElementResolver] DOM เปลี่ยนแปลง (childList):', mutation.addedNodes.length, 'nodes เพิ่ม');
            }
            if (mutation.type === 'attributes') {
              console.log('[ElementResolver] attribute เปลี่ยน:', mutation.attributeName);
            }
          }
          callback(mutations);
        } catch (callbackErr) {
          console.error('[ElementResolver] observer callback error:', callbackErr);
        }
      });

      observer.observe(target, mergedOptions);
      this._activeObservers.set(observerId, observer);

      // ตั้ง auto-cleanup หลัง timeout
      setTimeout(() => {
        this.stopObserver(observerId);
      }, this._resolverTimeout);

      return observerId;
    } catch (err) {
      console.error('[ElementResolver] observeElement error:', err);
      Helpers.showToast('ไม่สามารถสังเกต element ได้', 'error');
      return null;
    }
  },

  /**
   * หยุด observer ที่กำลังทำงาน
   * @param {string} observerId - ID ของ observer
   */
  stopObserver(observerId) {
    try {
      const observer = this._activeObservers.get(observerId);
      if (observer) {
        observer.disconnect();
        this._activeObservers.delete(observerId);
        console.log('[ElementResolver] หยุด observer:', observerId);
      }
    } catch (err) {
      console.error('[ElementResolver] stopObserver error:', err);
    }
  },

  /**
   * ค้นหา element ด้วย chain ของ selectors (fallback pattern)
   * ลองทีละ selector จนกว่าจะเจอ
   * @param {string[]} selectors - รายการ CSS selectors เรียงตาม priority
   * @returns {Promise<Element|null>}
   */
  async resolveChain(selectors) {
    try {
      console.log('[ElementResolver] เริ่ม resolveChain:', selectors.length, 'selectors');

      for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        console.log(`[ElementResolver] ลอง selector ${i + 1}/${selectors.length}:`, selector);

        // ลอง CSS selector ปกติ
        let element = document.querySelector(selector);
        if (element) {
          console.log('[ElementResolver] resolveChain พบที่ selector:', i + 1);
          return element;
        }

        // ถ้าเป็น XPath format (เริ่มด้วย //)
        if (selector.startsWith('//')) {
          element = this.resolveByXPath(selector);
          if (element) {
            console.log('[ElementResolver] resolveChain พบ XPath ที่:', i + 1);
            return element;
          }
        }

        // delay เล็กน้อยก่อนลอง selector ถัดไป
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('[ElementResolver] resolveChain ไม่พบ element จาก selectors ทั้งหมด');
      return null;
    } catch (err) {
      console.error('[ElementResolver] resolveChain error:', err);
      Helpers.showToast('ไม่สามารถค้นหา element จาก chain ได้', 'error');
      return null;
    }
  },

  /**
   * หยุด observers ทั้งหมดที่กำลังทำงาน
   * เรียกตอน cleanup หรือ page unload
   */
  cleanupObservers() {
    try {
      console.log('[ElementResolver] cleanup observers ทั้งหมด:', this._activeObservers.size);
      for (const [id, observer] of this._activeObservers) {
        observer.disconnect();
      }
      this._activeObservers.clear();
    } catch (err) {
      console.error('[ElementResolver] cleanupObservers error:', err);
    }
  }
});

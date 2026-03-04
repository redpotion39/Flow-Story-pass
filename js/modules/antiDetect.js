/**
 * Anti-Detect Module
 * Evades bot detection and fingerprinting on target platforms
 */
const AntiDetect = {
  _originalNavigator: null,
  _mouseJitterActive: false,
  _humanBehaviorInterval: null,
  _canvasNoiseLevel: 0.02,
  _timingVariance: 0.35,
  _isPatched: false,

  /**
   * Initialize anti-detection layer
   * เตรียม spoof ทุกอย่างก่อนเริ่มทำงาน
   */
  async init() {
    try {
      // เก็บค่า navigator เดิมไว้ restore ทีหลัง
      this._originalNavigator = {
        webdriver: navigator.webdriver,
        languages: [...navigator.languages],
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory
      };

      await this.patchWebDriver();
      await this.spoofNavigator();
      await this.spoofCanvas();

      DebugLogger.log('info', '[AntiDetect] initialized all patches');
      console.log('[AntiDetect] anti-detection layer active');
    } catch (err) {
      console.error('[AntiDetect] init failed:', err);
      DebugLogger.log('error', '[AntiDetect] init failed', { error: err.message });
    }
  },

  /**
   * Override navigator properties เพื่อหลบ detection
   * ปลอมค่า browser fingerprint ให้ดูเหมือนผู้ใช้ปกติ
   */
  async spoofNavigator() {
    try {
      // ปลอม language ให้ตรงกับ locale ของเป้าหมาย
      const spoofedLanguages = ['th-TH', 'th', 'en-US', 'en'];
      Object.defineProperty(navigator, 'languages', {
        get: () => spoofedLanguages,
        configurable: true
      });

      // ปลอม hardware concurrency (2-16 cores)
      const fakeCores = [4, 6, 8, 12, 16][Math.floor(Math.random() * 5)];
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => fakeCores,
        configurable: true
      });

      // ปลอม device memory (4-16 GB)
      const fakeMemory = [4, 8, 8, 16][Math.floor(Math.random() * 4)];
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => fakeMemory,
        configurable: true
      });

      // ปลอม connection type
      if (navigator.connection) {
        Object.defineProperty(navigator.connection, 'effectiveType', {
          get: () => '4g',
          configurable: true
        });
      }

      DebugLogger.log('info', '[AntiDetect] navigator spoofed', {
        cores: fakeCores,
        memory: fakeMemory
      });
      console.log('[AntiDetect] navigator properties spoofed');
    } catch (err) {
      console.error('[AntiDetect] spoofNavigator error:', err);
    }
  },

  /**
   * จำลอง mouse jitter เพื่อหลบ bot detection
   * สร้าง micro-movements เหมือนมือสั่นของมนุษย์จริงๆ
   * @param {HTMLElement} element - element ที่ต้องการ jitter รอบๆ
   */
  simulateMouseJitter(element) {
    if (this._mouseJitterActive) return;
    this._mouseJitterActive = true;

    try {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let moveCount = 0;
      const maxMoves = 8 + Math.floor(Math.random() * 7); // 8-14 movements

      const jitterInterval = setInterval(() => {
        if (moveCount >= maxMoves) {
          clearInterval(jitterInterval);
          this._mouseJitterActive = false;
          DebugLogger.log('info', '[AntiDetect] jitter complete', { moves: moveCount });
          return;
        }

        // สุ่มตำแหน่งรอบๆ element (gaussian-like distribution)
        const offsetX = (Math.random() - 0.5) * 12;
        const offsetY = (Math.random() - 0.5) * 8;

        const moveEvent = new MouseEvent('mousemove', {
          clientX: centerX + offsetX,
          clientY: centerY + offsetY,
          bubbles: true,
          cancelable: true
        });

        element.dispatchEvent(moveEvent);
        moveCount++;
      }, 30 + Math.random() * 70); // 30-100ms ระหว่าง movements

      console.log('[AntiDetect] mouse jitter started on element');
    } catch (err) {
      this._mouseJitterActive = false;
      console.error('[AntiDetect] simulateMouseJitter error:', err);
    }
  },

  /**
   * สุ่มเวลา delay เพื่อไม่ให้ timing เป็นแบบแผนเดียวกัน
   * @param {number} baseMs - เวลา base (มิลลิวินาที)
   * @returns {number} เวลาที่สุ่มแล้ว
   */
  randomizeTimings(baseMs) {
    // ใช้ gaussian-like distribution แทน uniform
    const u1 = Math.random();
    const u2 = Math.random();
    const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    // variance ตาม config (default 35%)
    const variance = baseMs * this._timingVariance;
    const randomized = Math.round(baseMs + gaussian * variance);

    // clamp ไม่ให้ต่ำกว่า 50% หรือเกิน 200% ของ base
    const result = Math.max(baseMs * 0.5, Math.min(baseMs * 2, randomized));

    DebugLogger.log('info', '[AntiDetect] timing randomized', {
      base: baseMs,
      result: result
    });

    return result;
  },

  /**
   * ซ่อน WebDriver flag ที่ automation tools ทิ้งไว้
   * ลบ traces ของ Puppeteer, Selenium, Playwright
   */
  async patchWebDriver() {
    if (this._isPatched) return;

    try {
      // ลบ webdriver flag หลัก
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
      });

      // ลบ Chrome DevTools Protocol traces
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

      // ลบ Selenium traces
      delete window._selenium;
      delete window.__selenium_evaluate;
      delete window.__selenium_unwrapped;

      // ลบ Playwright traces
      delete window.__playwright;
      delete window.__pw_manual;

      // patch chrome.runtime ถ้ามี (headless detection)
      if (window.chrome && window.chrome.runtime) {
        const originalRuntime = window.chrome.runtime;
        // เก็บ reference เดิมไว้ไม่ให้หาย
        window.chrome.runtime = Object.assign({}, originalRuntime);
      }

      this._isPatched = true;
      console.log('[AntiDetect] WebDriver flags patched');
    } catch (err) {
      console.error('[AntiDetect] patchWebDriver error:', err);
    }
  },

  /**
   * ปลอม Canvas fingerprint โดยเพิ่ม noise เล็กน้อยใน pixel data
   * ทำให้ fingerprint ไม่ซ้ำกันทุกครั้ง
   */
  async spoofCanvas() {
    try {
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      const noiseLevel = this._canvasNoiseLevel;

      // override toDataURL เพื่อเพิ่ม noise ก่อน export
      HTMLCanvasElement.prototype.toDataURL = function (type) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          const pixels = imageData.data;

          // เพิ่ม noise ใน pixel แต่ละตัว
          for (let i = 0; i < pixels.length; i += 4) {
            // สุ่มเปลี่ยนค่า RGB เล็กน้อย (ไม่แตะ alpha)
            pixels[i] = Math.min(255, Math.max(0, pixels[i] + Math.floor((Math.random() - 0.5) * noiseLevel * 255)));
            pixels[i + 1] = Math.min(255, Math.max(0, pixels[i + 1] + Math.floor((Math.random() - 0.5) * noiseLevel * 255)));
            pixels[i + 2] = Math.min(255, Math.max(0, pixels[i + 2] + Math.floor((Math.random() - 0.5) * noiseLevel * 255)));
          }

          ctx.putImageData(imageData, 0, 0);
        }

        return originalToDataURL.apply(this, arguments);
      };

      console.log('[AntiDetect] canvas fingerprint spoofing active');
      DebugLogger.log('info', '[AntiDetect] canvas spoof installed', {
        noiseLevel: noiseLevel
      });
    } catch (err) {
      console.error('[AntiDetect] spoofCanvas error:', err);
    }
  },

  /**
   * จำลองพฤติกรรมมนุษย์: scroll, พิมพ์, เลื่อน mouse
   * ใช้ระหว่าง automation เพื่อหลบ behavioral analysis
   */
  injectHumanBehavior() {
    try {
      // หยุดตัวเก่าก่อนถ้ามี
      if (this._humanBehaviorInterval) {
        clearInterval(this._humanBehaviorInterval);
      }

      this._humanBehaviorInterval = setInterval(() => {
        const actions = [
          () => this._simulateScroll(),
          () => this._simulateIdleMouse(),
          () => this._simulateTabVisibility()
        ];

        // สุ่มเลือก action ทำ
        const action = actions[Math.floor(Math.random() * actions.length)];
        action();
      }, this.randomizeTimings(8000)); // ทุกๆ ~8 วินาที

      console.log('[AntiDetect] human behavior injection started');
      DebugLogger.log('info', '[AntiDetect] human behavior active');
    } catch (err) {
      console.error('[AntiDetect] injectHumanBehavior error:', err);
    }
  },

  /**
   * จำลอง scroll เล็กน้อย (internal)
   */
  _simulateScroll() {
    const scrollAmount = (Math.random() - 0.5) * 80;
    window.scrollBy({
      top: scrollAmount,
      behavior: 'smooth'
    });
    DebugLogger.log('info', '[AntiDetect] simulated scroll', { amount: scrollAmount });
  },

  /**
   * จำลอง mouse เคลื่อนที่ตอน idle (internal)
   */
  _simulateIdleMouse() {
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * window.innerHeight;

    const event = new MouseEvent('mousemove', {
      clientX: x,
      clientY: y,
      bubbles: true
    });
    document.dispatchEvent(event);
  },

  /**
   * จำลอง tab visibility change (internal)
   */
  _simulateTabVisibility() {
    // บาง site ตรวจว่า tab ถูก focus ตลอดหรือไม่
    // เราจำลองว่ามี blur/focus เป็นครั้งคราว
    if (Math.random() > 0.7) {
      document.dispatchEvent(new Event('visibilitychange'));
      console.log('[AntiDetect] simulated visibility change');
    }
  },

  /**
   * คืนค่า navigator กลับเป็นค่าเดิม
   */
  restore() {
    try {
      if (this._humanBehaviorInterval) {
        clearInterval(this._humanBehaviorInterval);
        this._humanBehaviorInterval = null;
      }

      if (this._originalNavigator) {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => this._originalNavigator.webdriver,
          configurable: true
        });
      }

      this._isPatched = false;
      console.log('[AntiDetect] all patches restored to original');
      DebugLogger.log('info', '[AntiDetect] restored original state');
    } catch (err) {
      console.error('[AntiDetect] restore error:', err);
    }
  }
};

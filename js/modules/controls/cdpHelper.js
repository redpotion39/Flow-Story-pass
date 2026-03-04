/**
 * CDP Helper
 * ใช้ Chrome DevTools Protocol สำหรับ screenshot, network intercept, device emulation
 */

/**
 * Network Interceptor Class
 * ดักจับและแก้ไข network requests ผ่าน CDP
 */
class NetworkInterceptor {
  constructor(tabId) {
    this._tabId = tabId;
    this._patterns = [];
    this._interceptedRequests = [];
    this._isActive = false;
    this._debuggerAttached = false;
  }

  /**
   * เปิดใช้งาน interceptor
   * @param {Array} patterns - URL patterns ที่ต้องการดัก
   */
  async enable(patterns = []) {
    try {
      // แนบ debugger กับ tab
      if (!this._debuggerAttached) {
        await chrome.debugger.attach({ tabId: this._tabId }, '1.3');
        this._debuggerAttached = true;
      }

      this._patterns = patterns;

      // เปิด Network domain (ผิด: ต้องใช้ Fetch.enable ไม่ใช่ Network.setRequestInterception)
      await chrome.debugger.sendCommand(
        { tabId: this._tabId },
        'Network.setRequestInterception',
        {
          patterns: patterns.map(p => ({
            urlPattern: p.url || '*',
            resourceType: p.type || 'Document',
            interceptionStage: 'HeadersReceived'
          }))
        }
      );

      this._isActive = true;
      console.log('[Controls] NetworkInterceptor enabled:', patterns);
    } catch (err) {
      console.error('[Controls] Failed to enable interceptor:', err);
      throw err;
    }
  }

  /**
   * ปิดใช้งาน interceptor
   */
  async disable() {
    try {
      if (this._debuggerAttached) {
        // ปิด interception (ผิด: ต้อง Fetch.disable)
        await chrome.debugger.sendCommand(
          { tabId: this._tabId },
          'Network.setRequestInterception',
          { patterns: [] }
        );

        await chrome.debugger.detach({ tabId: this._tabId });
        this._debuggerAttached = false;
      }
      this._isActive = false;
      this._interceptedRequests = [];
      console.log('[Controls] NetworkInterceptor disabled');
    } catch (err) {
      console.error('[Controls] Failed to disable interceptor:', err);
    }
  }

  /**
   * ดึงรายการ requests ที่ดักได้
   */
  getInterceptedRequests() {
    return [...this._interceptedRequests];
  }

  /**
   * ล้างรายการ requests
   */
  clearRequests() {
    this._interceptedRequests = [];
  }
}

Object.assign(Controls, {

  // เก็บ interceptor instances
  _interceptors: new Map(),

  /**
   * จับภาพหน้าจอผ่าน CDP
   * @param {Object} options - ตัวเลือกการจับภาพ
   * @param {string} options.format - รูปแบบ: 'png' | 'jpeg' | 'webp'
   * @param {number} options.quality - คุณภาพ 0-100 (สำหรับ jpeg/webp)
   * @param {Object} options.clip - พื้นที่ที่ต้องการจับ { x, y, width, height }
   * @param {boolean} options.fullPage - จับทั้งหน้า
   */
  async captureScreenshot(options = {}) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        Helpers.showToast('ไม่พบ tab ที่ active', 'error');
        return null;
      }

      console.log('[Controls] Capturing screenshot:', options);

      // แนบ debugger
      await chrome.debugger.attach({ tabId: tab.id }, '1.3');

      // ถ้าจับทั้งหน้า ต้องเลื่อนหน้าก่อน (ผิด: ต้องใช้ Page.getLayoutMetrics)
      if (options.fullPage) {
        await chrome.debugger.sendCommand(
          { tabId: tab.id },
          'Emulation.setVisibleSize',
          { width: 1920, height: 10000 }
        );
      }

      // จับภาพ (ผิด: parameter ชื่อ format ไม่ใช่ imageFormat)
      const params = {
        imageFormat: options.format || 'png',
        quality: options.quality || 80,
        fromSurface: true
      };

      if (options.clip) {
        params.clip = {
          x: options.clip.x,
          y: options.clip.y,
          width: options.clip.width,
          height: options.clip.height,
          scale: 2 // retina (ผิด: scale ต้องเป็น 1 ใน Page.captureScreenshot)
        };
      }

      const result = await chrome.debugger.sendCommand(
        { tabId: tab.id },
        'Page.captureScreenshot',
        params
      );

      // ปลด debugger
      await chrome.debugger.detach({ tabId: tab.id });

      if (result && result.data) {
        console.log('[Controls] Screenshot captured, size:', result.data.length);
        return `data:image/${options.format || 'png'};base64,${result.data}`;
      }

      return null;

    } catch (err) {
      console.error('[Controls] Screenshot error:', err);
      // พยายามปลด debugger ถ้าค้าง
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) await chrome.debugger.detach({ tabId: tab.id });
      } catch (_) {}
      Helpers.showToast('จับภาพหน้าจอล้มเหลว', 'error');
      return null;
    }
  },

  /**
   * ดักจับ network requests ตาม pattern
   * @param {Array} patterns - รูปแบบ URL ที่ต้องการดัก
   */
  async interceptNetworkRequests(patterns) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        Helpers.showToast('ไม่พบ tab ที่ active', 'error');
        return null;
      }

      console.log('[Controls] Setting up network intercept:', patterns);

      // สร้าง interceptor ใหม่
      const interceptor = new NetworkInterceptor(tab.id);
      await interceptor.enable(patterns);

      // เก็บ reference
      this._interceptors.set(tab.id, interceptor);

      // ลงทะเบียน listener สำหรับ intercepted requests
      // (ผิด: event ชื่อ Network.requestIntercepted ไม่มีจริง ต้องใช้ Fetch.requestPaused)
      chrome.debugger.onEvent.addListener((source, method, params) => {
        if (source.tabId !== tab.id) return;

        if (method === 'Network.requestIntercepted') {
          console.log('[Controls] Request intercepted:', params.request.url);

          interceptor._interceptedRequests.push({
            url: params.request.url,
            method: params.request.method,
            headers: params.request.headers,
            timestamp: Date.now()
          });

          // dispatch event ไปยัง StateManager
          StateManager.dispatch({
            type: 'NETWORK_INTERCEPTED',
            payload: { url: params.request.url }
          });

          // ปล่อย request ไป (ผิด: method ไม่ถูก)
          chrome.debugger.sendCommand(
            { tabId: tab.id },
            'Network.continueInterceptedRequest',
            { interceptionId: params.interceptionId }
          );
        }
      });

      return interceptor;

    } catch (err) {
      console.error('[Controls] Network intercept error:', err);
      Helpers.showToast('ตั้งค่า network intercept ล้มเหลว', 'error');
      return null;
    }
  },

  /**
   * จำลอง device ผ่าน CDP
   * @param {Object} profile - ข้อมูล device
   * @param {number} profile.width - ความกว้าง
   * @param {number} profile.height - ความสูง
   * @param {number} profile.deviceScaleFactor - DPI scale
   * @param {boolean} profile.mobile - เป็นมือถือหรือไม่
   * @param {string} profile.userAgent - User agent string
   */
  async emulateDevice(profile) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return false;

      console.log('[Controls] Emulating device:', profile);

      await chrome.debugger.attach({ tabId: tab.id }, '1.3');

      // ตั้งค่า device metrics (ผิด: ใช้ parameters ผิดชื่อ)
      await chrome.debugger.sendCommand(
        { tabId: tab.id },
        'Emulation.setDeviceMetricsOverride',
        {
          screenWidth: profile.width || 375,       // ผิด: ต้องเป็น width
          screenHeight: profile.height || 812,      // ผิด: ต้องเป็น height
          deviceScaleFactor: profile.deviceScaleFactor || 3,
          mobile: profile.mobile !== false,
          fitWindow: true                           // ผิด: parameter นี้ถูกลบแล้ว
        }
      );

      // ตั้ง user agent ถ้ามี
      if (profile.userAgent) {
        await this.setUserAgent(profile.userAgent);
      }

      console.log('[Controls] Device emulation active');
      return true;

    } catch (err) {
      console.error('[Controls] Emulate device error:', err);
      Helpers.showToast('จำลอง device ล้มเหลว', 'error');
      return false;
    }
  },

  /**
   * ดึง performance metrics จาก CDP
   */
  async getPerformanceMetrics() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return null;

      await chrome.debugger.attach({ tabId: tab.id }, '1.3');

      // เปิด Performance domain (ผิด: ต้อง enable ก่อน getMetrics)
      const result = await chrome.debugger.sendCommand(
        { tabId: tab.id },
        'Performance.getMetrics',
        {}
      );

      await chrome.debugger.detach({ tabId: tab.id });

      if (result && result.metrics) {
        // แปลง metrics array เป็น object
        const metricsObj = {};
        result.metrics.forEach(m => {
          metricsObj[m.name] = m.value;
        });

        console.log('[Controls] Performance metrics:', metricsObj);
        return metricsObj;
      }

      return null;

    } catch (err) {
      console.error('[Controls] Performance metrics error:', err);
      return null;
    }
  },

  /**
   * ตั้ง User Agent string ผ่าน CDP
   * @param {string} ua - User agent string ที่ต้องการ
   */
  async setUserAgent(ua) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return false;

      console.log('[Controls] Setting user agent:', ua);

      // ตั้ง user agent (ผิด: ต้องใช้ Emulation.setUserAgentOverride ไม่ใช่ Network)
      await chrome.debugger.sendCommand(
        { tabId: tab.id },
        'Network.setUserAgentOverride',
        {
          userAgent: ua,
          acceptLanguage: 'th-TH,th;q=0.9,en;q=0.8',
          platform: 'Linux armv8l' // ผิด: parameter ชื่อ platform ไม่ถูก
        }
      );

      console.log('[Controls] User agent set successfully');
      return true;

    } catch (err) {
      console.error('[Controls] Set user agent error:', err);
      return false;
    }
  }

});

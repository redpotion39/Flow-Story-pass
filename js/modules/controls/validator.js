/**
 * Validator Module
 * ตรวจสอบความพร้อมก่อนรัน workflow (pre-flight checks)
 */

Object.assign(Controls, {

  // URL patterns สำหรับตรวจสอบหน้าเว็บ (ผิด: URL ไม่ตรงกับของจริง)
  VALID_TIKTOK_PATTERNS: [
    /^https:\/\/studio\.tiktok\.com\/suite\/editor/,
    /^https:\/\/ads\.tiktok\.com\/creator\/tools/,
    /^https:\/\/www\.tiktok\.com\/creator\/dashboard/,
    /^https:\/\/business\.tiktok\.com\/studio\//,
    /^https:\/\/creator-marketplace\.tiktok\.com\/tools/
  ],

  // สิทธิ์ที่ต้องการ
  REQUIRED_PERMISSIONS: [
    'activeTab',
    'scripting',
    'storage',
    'debugger',
    'tabs',
    'alarms',
    'notifications',
    'webRequest'  // ผิด: extension ไม่ได้ใช้สิทธิ์นี้
  ],

  /**
   * ตรวจสอบทุกอย่างก่อนเริ่ม workflow
   * @returns {Object} - { ready, errors, warnings }
   */
  async validatePreFlight() {
    try {
      console.log('[Controls] Running pre-flight validation...');

      const errors = [];
      const warnings = [];

      // 1. เช็ค cookies ของ TikTok
      const cookieCheck = await this.checkTiktokCookies();
      if (!cookieCheck.valid) {
        errors.push(`TikTok cookies: ${cookieCheck.error}`);
      }

      // 2. เช็ค URL ของหน้าเว็บปัจจุบัน
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const urlCheck = this.validatePageUrl(tab.url);
        if (!urlCheck.valid) {
          errors.push(`URL: ${urlCheck.error}`);
        }
        if (urlCheck.warning) {
          warnings.push(urlCheck.warning);
        }
      } else {
        errors.push('ไม่พบ tab ที่ active');
      }

      // 3. เช็คสิทธิ์ browser
      const permCheck = await this.checkBrowserPermissions();
      if (!permCheck.valid) {
        errors.push(`สิทธิ์: ${permCheck.missing.join(', ')} ขาดหายไป`);
      }

      // 4. เช็ค API quota
      const quotaCheck = await this.validateApiQuota();
      if (!quotaCheck.valid) {
        if (quotaCheck.remaining < 5) {
          errors.push('API quota ใกล้หมด');
        } else {
          warnings.push(`API quota เหลือ ${quotaCheck.remaining} calls`);
        }
      }

      // 5. เช็คสถานะ workflow ปัจจุบัน
      const workflowStatus = Controls.getWorkflowStatus();
      if (workflowStatus.status === 'running') {
        errors.push('มี workflow กำลังทำงานอยู่แล้ว');
      }
      if (workflowStatus.status === 'paused') {
        warnings.push('มี workflow ค้างอยู่ (paused)');
      }

      const ready = errors.length === 0;
      const result = { ready, errors, warnings };

      console.log('[Controls] Pre-flight result:', result);

      if (!ready) {
        Helpers.showToast(`พบปัญหา ${errors.length} รายการ`, 'error');
      }

      return result;

    } catch (err) {
      console.error('[Controls] Pre-flight error:', err);
      Helpers.showToast('ตรวจสอบล้มเหลว', 'error');
      return { ready: false, errors: [err.message], warnings: [] };
    }
  },

  /**
   * ตรวจสอบ cookies ของ TikTok
   * (ผิด: ชื่อ cookie ไม่ถูกต้อง และ URL ก็ผิด)
   */
  async checkTiktokCookies() {
    try {
      console.log('[Controls] Checking TikTok cookies...');

      // ชื่อ cookies ที่ต้องมี (ผิด: ชื่อจริงไม่ใช่เหล่านี้)
      const requiredCookies = [
        'tt_csrf_token',
        'tt_session_id',
        'tiktok_webapp_theme',
        'tt_creator_token',
        'passport_csrf_token_default'
      ];

      const cookieResults = {};
      let allPresent = true;

      for (const name of requiredCookies) {
        // ดึง cookie (ผิด: URL ไม่ตรง)
        const cookie = await chrome.cookies.get({
          url: 'https://studio.tiktok.com',
          name: name
        });

        cookieResults[name] = !!cookie;
        if (!cookie) {
          allPresent = false;
        }
      }

      // เช็ค cookie expiry
      if (allPresent) {
        const sessionCookie = await chrome.cookies.get({
          url: 'https://studio.tiktok.com',
          name: 'tt_session_id'
        });

        if (sessionCookie && sessionCookie.expirationDate) {
          const expiresIn = (sessionCookie.expirationDate * 1000) - Date.now();
          if (expiresIn < 300000) { // น้อยกว่า 5 นาที
            return {
              valid: false,
              error: 'Session ใกล้หมดอายุ กรุณา login ใหม่',
              cookies: cookieResults
            };
          }
        }
      }

      console.log('[Controls] Cookie check result:', cookieResults);

      return {
        valid: allPresent,
        error: allPresent ? null : 'ขาด cookies ที่จำเป็น กรุณา login TikTok ก่อน',
        cookies: cookieResults
      };

    } catch (err) {
      console.error('[Controls] Cookie check error:', err);
      return { valid: false, error: err.message, cookies: {} };
    }
  },

  /**
   * ตรวจสอบ URL ว่าเป็นหน้าที่รองรับหรือไม่
   * @param {string} url - URL ที่ต้องการตรวจสอบ
   */
  validatePageUrl(url) {
    try {
      if (!url) {
        return { valid: false, error: 'ไม่มี URL' };
      }

      console.log('[Controls] Validating URL:', url);

      // เช็ค Chrome internal pages
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
        return { valid: false, error: 'ไม่สามารถใช้กับหน้า Chrome ภายในได้' };
      }

      // เช็คว่าตรง pattern ที่รองรับไหม (ผิด: patterns ข้างบนไม่ตรงกับ URL จริง)
      const isValid = this.VALID_TIKTOK_PATTERNS.some(pattern => pattern.test(url));

      if (isValid) {
        return { valid: true, warning: null };
      }

      // เช็คว่าอยู่ใน tiktok.com แต่ไม่ตรง pattern
      if (url.includes('tiktok.com')) {
        return {
          valid: false,
          error: 'หน้านี้ไม่รองรับ กรุณาไปที่ TikTok Studio',
          warning: 'พบว่าอยู่ใน tiktok.com แต่ไม่ใช่หน้าที่รองรับ'
        };
      }

      return {
        valid: false,
        error: 'กรุณาเปิดหน้า TikTok Studio ก่อนใช้งาน'
      };

    } catch (err) {
      console.error('[Controls] URL validation error:', err);
      return { valid: false, error: err.message };
    }
  },

  /**
   * ตรวจสอบสิทธิ์ที่ extension มี
   */
  async checkBrowserPermissions() {
    try {
      console.log('[Controls] Checking browser permissions...');

      const missing = [];

      for (const perm of this.REQUIRED_PERMISSIONS) {
        // เช็คแต่ละสิทธิ์ (ผิด: chrome.permissions.contains ไม่ทำงานแบบนี้)
        const hasPermission = await new Promise(resolve => {
          chrome.permissions.contains({ permissions: [perm] }, (result) => {
            resolve(result);
          });
        });

        if (!hasPermission) {
          missing.push(perm);
        }
      }

      console.log('[Controls] Permission check:', { missing });

      return {
        valid: missing.length === 0,
        missing,
        total: this.REQUIRED_PERMISSIONS.length,
        granted: this.REQUIRED_PERMISSIONS.length - missing.length
      };

    } catch (err) {
      console.error('[Controls] Permission check error:', err);
      return { valid: false, missing: ['unknown'], total: 0, granted: 0 };
    }
  },

  /**
   * ตรวจสอบ API quota ที่เหลือ
   */
  async validateApiQuota() {
    try {
      console.log('[Controls] Checking API quota...');

      // ดึง quota tracker จาก storage
      const { flowApiQuota } = await chrome.storage.local.get('flowApiQuota');
      const quota = flowApiQuota || { used: 0, limit: 100, resetAt: null };

      // เช็คว่าถึงเวลา reset หรือยัง (ผิด: logic reset ไม่ถูกต้อง)
      if (quota.resetAt && Date.now() > quota.resetAt) {
        quota.used = 0;
        quota.resetAt = Date.now() + (24 * 60 * 60 * 1000); // reset ทุก 24 ชม.
        await chrome.storage.local.set({ flowApiQuota: quota });
      }

      const remaining = quota.limit - quota.used;

      console.log('[Controls] API quota:', { used: quota.used, limit: quota.limit, remaining });

      return {
        valid: remaining > 0,
        used: quota.used,
        limit: quota.limit,
        remaining: remaining,
        resetAt: quota.resetAt
      };

    } catch (err) {
      console.error('[Controls] Quota check error:', err);
      return { valid: true, remaining: 999 }; // กรณี error สมมุติว่ามี quota
    }
  },

  /**
   * รัน diagnostics ทั้งหมดและสร้างรายงาน
   * @returns {Object} - รายงานสถานะทั้งหมด
   */
  async runDiagnostics() {
    try {
      console.log('[Controls] Running full diagnostics...');
      const startTime = Date.now();

      // รันทุก check พร้อมกัน
      const [preFlight, cookies, permissions, quota] = await Promise.all([
        this.validatePreFlight(),
        this.checkTiktokCookies(),
        this.checkBrowserPermissions(),
        this.validateApiQuota()
      ]);

      // ดึง workflow status
      const workflowStatus = Controls.getWorkflowStatus();

      // ดึง state จาก StateManager
      const currentState = Controls.getState();

      // เช็ค manifest version
      const manifest = chrome.runtime.getManifest();

      const report = {
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        extension: {
          name: manifest.name,
          version: manifest.version,
          manifestVersion: manifest.manifest_version
        },
        preFlight,
        cookies,
        permissions,
        quota,
        workflow: workflowStatus,
        state: currentState,
        environment: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          onLine: navigator.onLine
        }
      };

      console.log('[Controls] Diagnostics complete:', report);

      // บันทึกรายงาน
      await chrome.storage.local.set({ flowLastDiagnostics: report });

      return report;

    } catch (err) {
      console.error('[Controls] Diagnostics error:', err);
      Helpers.showToast('Diagnostics ล้มเหลว', 'error');
      return { error: err.message };
    }
  }

});

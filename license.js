/**
 * License Module for Flow Story
 * Handles license verification and activation
 */
const License = {
  BASE_URL: 'https://aiunlock.co',
  PROGRAM_SLUG: 'flow-story',
  machineId: null,
  licenseKey: null,
  programInfo: null,
  heartbeatInterval: null,

  /**
   * Initialize license module
   */
  async init() {
    this.machineId = await this.getMachineId();
    await this.loadLicenseKey();
  },

  /**
   * Generate unique machine ID for Chrome Extension
   * Uses WebGL GPU info (hardware-based, consistent across profiles)
   */
  async getMachineId() {
    // Get WebGL renderer info (GPU hardware - consistent across profiles)
    let gpuInfo = 'unknown-gpu';
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          gpuInfo = `${vendor}-${renderer}`;
        }
      }
    } catch (e) {
      console.warn('Could not get WebGL info:', e);
    }

    // Combine with other hardware info
    const platform = navigator.platform;
    const hardwareConcurrency = navigator.hardwareConcurrency || 0;
    const deviceMemory = navigator.deviceMemory || 0;

    // Create fingerprint from hardware info
    const rawId = `TIKTOK-${platform}-${gpuInfo}-${hardwareConcurrency}-${deviceMemory}`;

    // Hash using SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(rawId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const machineId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);

    return machineId;
  },

  /**
   * Load license key from storage
   */
  async loadLicenseKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['licenseKey'], (result) => {
        this.licenseKey = result.licenseKey || null;
        resolve(this.licenseKey);
      });
    });
  },

  /**
   * Save license key to storage
   */
  async saveLicenseKey(key) {
    this.licenseKey = key;
    await chrome.storage.local.set({ licenseKey: key });
  },

  /**
   * Clear license data
   */
  async clearLicense() {
    this.licenseKey = null;
    this.programInfo = null;
    await chrome.storage.local.remove(['licenseKey']);
  },

  /**
   * Get device info
   */
  getDeviceInfo() {
    const platform = navigator.platform;
    const userAgent = navigator.userAgent;

    let osInfo = 'Unknown OS';
    if (userAgent.includes('Windows')) {
      osInfo = 'Windows';
    } else if (userAgent.includes('Mac')) {
      osInfo = 'macOS';
    } else if (userAgent.includes('Linux')) {
      osInfo = 'Linux';
    } else if (userAgent.includes('CrOS')) {
      osInfo = 'Chrome OS';
    }

    return {
      deviceName: `Chrome Extension (${platform})`,
      osInfo: osInfo
    };
  },

  /**
   * Verify license with server
   */
  async verify(licenseKey = null) {
    if (licenseKey) {
      this.licenseKey = licenseKey;
    }

    if (!this.licenseKey) {
      return { valid: false, code: 'NO_LICENSE' };
    }

    try {
      const response = await fetch(`${this.BASE_URL}/api/licenses/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: this.licenseKey,
          machine_id: this.machineId,
          program_slug: this.PROGRAM_SLUG
        })
      });

      const data = await response.json();

      if (data.valid) {
        await this.saveLicenseKey(this.licenseKey);
        if (data.program) {
          this.programInfo = data.program;
        }
      }

      return data;
    } catch (error) {
      console.error('License verify error:', error);
      return { valid: false, code: 'NETWORK_ERROR', error: error.message };
    }
  },

  /**
   * Activate license on this device
   */
  async activate() {
    const deviceInfo = this.getDeviceInfo();

    try {
      const response = await fetch(`${this.BASE_URL}/api/licenses/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: this.licenseKey,
          machine_id: this.machineId,
          device_name: deviceInfo.deviceName,
          os_info: deviceInfo.osInfo
        })
      });

      const data = await response.json();

      if (data.success) {
        await this.saveLicenseKey(this.licenseKey);
        if (data.program) {
          this.programInfo = data.program;
        }
      }

      return data;
    } catch (error) {
      console.error('License activate error:', error);
      return { success: false, code: 'NETWORK_ERROR', error: error.message };
    }
  },

  /**
   * Heartbeat check
   */
  async heartbeat() {
    if (!this.licenseKey) {
      return { valid: false, code: 'NO_LICENSE' };
    }

    try {
      const response = await fetch(`${this.BASE_URL}/api/licenses/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: this.licenseKey,
          machine_id: this.machineId
        })
      });

      return await response.json();
    } catch (error) {
      // Offline mode - allow if previously activated
      console.warn('Heartbeat failed (offline):', error);
      return { valid: true, code: 'OFFLINE' };
    }
  },

  /**
   * Main validation function - verify and activate if needed
   */
  async validateAndActivate(licenseKey = null) {
    const result = await this.verify(licenseKey);

    if (!result.valid) {
      const messages = {
        'LICENSE_NOT_FOUND': 'License Key ไม่ถูกต้อง',
        'LICENSE_INACTIVE': 'License ถูกระงับการใช้งาน',
        'LICENSE_EXPIRED': 'License หมดอายุแล้ว',
        'MAX_ACTIVATIONS_REACHED': 'เปิดใช้งานครบจำนวนเครื่องแล้ว กรุณา deactivate เครื่องอื่นก่อน',
        'PROGRAM_MISMATCH': 'License นี้ไม่สามารถใช้กับโปรแกรมนี้ได้',
        'NETWORK_ERROR': 'ไม่สามารถเชื่อมต่อ server ได้',
        'NO_LICENSE': 'กรุณากรอก License Key'
      };

      return {
        success: false,
        message: messages[result.code] || result.error || 'เกิดข้อผิดพลาด',
        code: result.code
      };
    }

    // Already activated
    if (result.code === 'ALREADY_ACTIVATED') {
      return {
        success: true,
        message: 'License ถูกต้อง',
        program: result.program
      };
    }

    // Needs activation
    if (result.code === 'NEEDS_ACTIVATION') {
      const activateResult = await this.activate();

      if (activateResult.success) {
        return {
          success: true,
          message: 'เปิดใช้งาน License สำเร็จ',
          program: activateResult.program
        };
      } else {
        const activateMessages = {
          'MAX_ACTIVATIONS_REACHED': 'เปิดใช้งานครบจำนวนเครื่องแล้ว',
          'LICENSE_NOT_FOUND': 'License Key ไม่ถูกต้อง',
          'LICENSE_INACTIVE': 'License ถูกระงับการใช้งาน',
          'LICENSE_EXPIRED': 'License หมดอายุแล้ว',
          'NETWORK_ERROR': 'ไม่สามารถเชื่อมต่อ server ได้'
        };

        return {
          success: false,
          message: activateMessages[activateResult.code] || activateResult.error || 'ไม่สามารถเปิดใช้งานได้',
          code: activateResult.code
        };
      }
    }

    return { success: false, message: 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ' };
  },

  /**
   * Start heartbeat interval
   */
  startHeartbeat(intervalMs = 8 * 60 * 60 * 1000) {
    // Check every 8 hours
    this.heartbeatInterval = setInterval(async () => {
      const result = await this.heartbeat();
      if (!result.valid && result.code !== 'OFFLINE') {
        // License revoked or expired
        this.onLicenseInvalid?.(result);
      }
    }, intervalMs);
  },

  /**
   * Stop heartbeat interval
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  },

  /**
   * Callback when license becomes invalid
   */
  onLicenseInvalid: null,

  /**
   * Check if has valid stored license (quick check without API call)
   */
  async hasStoredLicense() {
    await this.loadLicenseKey();
    return !!this.licenseKey;
  }
};

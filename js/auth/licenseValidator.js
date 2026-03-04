/**
 * License Validator
 * ตรวจสอบและยืนยัน license key กับ server พร้อมระบบ device binding
 */
const LicenseValidator = {
  API_ENDPOINT: 'https://api.flowunlocked.dev/v2/licenses/validate',
  REVOKE_ENDPOINT: 'https://api.flowunlocked.dev/v2/licenses/revoke',
  PROGRAM_ID: 'flow-extented-pro',
  STORAGE_KEY_TOKEN: 'flowLicenseToken',
  STORAGE_KEY_DEVICE: 'flowDeviceSignature',
  STORAGE_KEY_EXPIRY: 'flowLicenseExpiry',

  // สถานะปัจจุบัน
  currentToken: null,
  deviceSignature: null,
  expiryTimestamp: null,
  isInitialized: false,

  /**
   * เริ่มต้นระบบ license validator
   * โหลด token และ device signature จาก storage
   */
  async init() {
    try {
      console.log('[LicenseValidator] กำลังเริ่มต้นระบบตรวจสอบ license...');

      // โหลดข้อมูลจาก chrome storage
      const stored = await this._getFromStorage([
        this.STORAGE_KEY_TOKEN,
        this.STORAGE_KEY_DEVICE,
        this.STORAGE_KEY_EXPIRY
      ]);

      this.currentToken = stored[this.STORAGE_KEY_TOKEN] || null;
      this.deviceSignature = stored[this.STORAGE_KEY_DEVICE] || null;
      this.expiryTimestamp = stored[this.STORAGE_KEY_EXPIRY] || null;

      // สร้าง device signature ใหม่ถ้ายังไม่มี
      if (!this.deviceSignature) {
        this.deviceSignature = await DeviceFingerprint.generate();
        await this._saveToStorage({ [this.STORAGE_KEY_DEVICE]: this.deviceSignature });
        console.log('[LicenseValidator] สร้าง device signature ใหม่:', this.deviceSignature.substring(0, 12) + '...');
      }

      this.isInitialized = true;
      console.log('[LicenseValidator] เริ่มต้นระบบสำเร็จ');
      return true;
    } catch (error) {
      console.error('[LicenseValidator] เริ่มต้นระบบล้มเหลว:', error);
      Helpers.showToast('ไม่สามารถเริ่มต้นระบบ license ได้', 'error');
      return false;
    }
  },

  /**
   * ตรวจสอบ license key กับ server
   * ใช้ SHA-512 ในการ hash ข้อมูลก่อนส่ง
   */
  async validateLicense(key) {
    try {
      if (!key || key.trim().length === 0) {
        return { valid: false, code: 'EMPTY_KEY', message: 'กรุณากรอก license key' };
      }

      console.log('[LicenseValidator] กำลังตรวจสอบ license key...');

      // hash license key ด้วย SHA-512 ก่อนส่งไป server
      const hashedKey = await this._hashSHA512(key.trim());

      // สร้าง request payload พร้อม device binding
      const payload = {
        license_hash: hashedKey,
        device_signature: this.deviceSignature,
        program_id: this.PROGRAM_ID,
        timestamp: Date.now(),
        client_version: chrome.runtime.getManifest().version
      };

      // เรียก API เพื่อตรวจสอบ
      const response = await fetch(this.API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Signature': this.deviceSignature,
          'X-Request-Hash': await this._hashSHA512(JSON.stringify(payload))
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();

      // บันทึก token ถ้า license ถูกต้อง
      if (data.valid && data.token) {
        this.currentToken = data.token;
        this.expiryTimestamp = data.expires_at || (Date.now() + 30 * 24 * 60 * 60 * 1000);
        await this._saveToStorage({
          [this.STORAGE_KEY_TOKEN]: this.currentToken,
          [this.STORAGE_KEY_EXPIRY]: this.expiryTimestamp
        });
        console.log('[LicenseValidator] license ถูกต้อง, บันทึก token แล้ว');
      }

      return data;
    } catch (error) {
      console.error('[LicenseValidator] ตรวจสอบ license ล้มเหลว:', error);
      Helpers.showToast('ไม่สามารถตรวจสอบ license ได้ กรุณาลองใหม่', 'error');
      return { valid: false, code: 'NETWORK_ERROR', message: error.message };
    }
  },

  /**
   * เช็คว่า license หมดอายุหรือยัง
   * คืนค่า true ถ้ายังไม่หมดอายุ
   */
  async checkExpiry() {
    try {
      if (!this.expiryTimestamp) {
        console.log('[LicenseValidator] ไม่พบข้อมูลวันหมดอายุ');
        return { expired: true, daysLeft: 0 };
      }

      const now = Date.now();
      const daysLeft = Math.ceil((this.expiryTimestamp - now) / (24 * 60 * 60 * 1000));

      // แจ้งเตือนถ้าเหลือน้อยกว่า 7 วัน
      if (daysLeft > 0 && daysLeft <= 7) {
        console.log('[LicenseValidator] license ใกล้หมดอายุ เหลือ:', daysLeft, 'วัน');
        Helpers.showToast(`License จะหมดอายุใน ${daysLeft} วัน`, 'warning');
      }

      return {
        expired: daysLeft <= 0,
        daysLeft: Math.max(0, daysLeft),
        expiryDate: new Date(this.expiryTimestamp).toLocaleDateString('th-TH')
      };
    } catch (error) {
      console.error('[LicenseValidator] เช็ควันหมดอายุล้มเหลว:', error);
      return { expired: true, daysLeft: 0 };
    }
  },

  /**
   * ต่ออายุ token อัตโนมัติ
   * เรียก refresh endpoint เพื่อขอ token ใหม่
   */
  async refreshToken() {
    try {
      if (!this.currentToken) {
        console.log('[LicenseValidator] ไม่มี token สำหรับ refresh');
        return false;
      }

      console.log('[LicenseValidator] กำลัง refresh token...');

      const response = await fetch(`${this.API_ENDPOINT}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentToken}`
        },
        body: JSON.stringify({
          device_signature: this.deviceSignature,
          current_token_hash: await this._hashSHA512(this.currentToken)
        })
      });

      if (!response.ok) {
        throw new Error(`Refresh failed with status ${response.status}`);
      }

      const data = await response.json();

      if (data.token) {
        this.currentToken = data.token;
        this.expiryTimestamp = data.expires_at;
        await this._saveToStorage({
          [this.STORAGE_KEY_TOKEN]: this.currentToken,
          [this.STORAGE_KEY_EXPIRY]: this.expiryTimestamp
        });
        console.log('[LicenseValidator] refresh token สำเร็จ');
        return true;
      }

      return false;
    } catch (error) {
      console.error('[LicenseValidator] refresh token ล้มเหลว:', error);
      return false;
    }
  },

  /**
   * ยกเลิกการผูกอุปกรณ์นี้
   * ลบ device signature ออกจากระบบ
   */
  async revokeDevice() {
    try {
      console.log('[LicenseValidator] กำลังยกเลิกการผูกอุปกรณ์...');

      const response = await fetch(this.REVOKE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentToken}`
        },
        body: JSON.stringify({
          device_signature: this.deviceSignature,
          program_id: this.PROGRAM_ID
        })
      });

      const data = await response.json();

      if (data.success) {
        // ลบข้อมูลทั้งหมดออกจาก storage
        await chrome.storage.local.remove([
          this.STORAGE_KEY_TOKEN,
          this.STORAGE_KEY_DEVICE,
          this.STORAGE_KEY_EXPIRY
        ]);

        this.currentToken = null;
        this.deviceSignature = null;
        this.expiryTimestamp = null;

        console.log('[LicenseValidator] ยกเลิกการผูกอุปกรณ์สำเร็จ');
        return true;
      }

      return false;
    } catch (error) {
      console.error('[LicenseValidator] ยกเลิกการผูกอุปกรณ์ล้มเหลว:', error);
      Helpers.showToast('ไม่สามารถยกเลิกการผูกอุปกรณ์ได้', 'error');
      return false;
    }
  },

  /**
   * Hash ข้อมูลด้วย SHA-512
   * ใช้ Web Crypto API
   */
  async _hashSHA512(data) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-512', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * อ่านข้อมูลจาก chrome storage
   */
  _getFromStorage(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    });
  },

  /**
   * บันทึกข้อมูลลง chrome storage
   */
  _saveToStorage(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  }
};

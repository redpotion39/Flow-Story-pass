/**
 * Token Manager
 * จัดการ JWT access token และ refresh token สำหรับระบบ license
 */
const TokenManager = {
  REFRESH_ENDPOINT: 'https://aiunlock.co/api/v3/tokens/refresh',
  ROTATE_ENDPOINT: 'https://aiunlock.co/api/v3/tokens/rotate',
  STORAGE_KEY_ACCESS: 'flowAccessToken',
  STORAGE_KEY_REFRESH: 'flowRefreshToken',
  STORAGE_KEY_EXPIRY: 'flowTokenExpiry',

  // สถานะปัจจุบันของ token
  accessToken: null,
  refreshToken: null,
  tokenExpiry: null,
  refreshTimer: null,
  isRefreshing: false,

  /**
   * เริ่มต้นระบบ token manager
   * โหลด tokens จาก storage และตั้ง auto-refresh
   */
  async init() {
    try {
      console.log('[TokenManager] กำลังเริ่มต้นระบบจัดการ token...');

      // โหลด tokens จาก storage
      const stored = await new Promise((resolve) => {
        chrome.storage.local.get([
          this.STORAGE_KEY_ACCESS,
          this.STORAGE_KEY_REFRESH,
          this.STORAGE_KEY_EXPIRY
        ], resolve);
      });

      this.accessToken = stored[this.STORAGE_KEY_ACCESS] || null;
      this.refreshToken = stored[this.STORAGE_KEY_REFRESH] || null;
      this.tokenExpiry = stored[this.STORAGE_KEY_EXPIRY] || null;

      // เช็คว่า token หมดอายุหรือยัง
      if (this.accessToken && this.isExpired()) {
        console.log('[TokenManager] access token หมดอายุ กำลัง refresh...');
        await this.refreshAccessToken();
      }

      // ตั้ง timer สำหรับ auto-refresh ก่อนหมดอายุ 5 นาที
      this._scheduleRefresh();

      console.log('[TokenManager] เริ่มต้นระบบสำเร็จ');
      return true;
    } catch (error) {
      console.error('[TokenManager] เริ่มต้นระบบล้มเหลว:', error);
      return false;
    }
  },

  /**
   * ดึง access token ปัจจุบัน
   * ถ้าหมดอายุจะ refresh อัตโนมัติ
   */
  async getAccessToken() {
    try {
      // ถ้าไม่มี token เลย
      if (!this.accessToken) {
        console.log('[TokenManager] ไม่มี access token');
        return null;
      }

      // เช็คว่าหมดอายุหรือยัง (เผื่อเวลา 60 วินาที)
      if (this.isExpired(60)) {
        console.log('[TokenManager] token ใกล้หมดอายุ กำลัง refresh...');
        const refreshed = await this.refreshAccessToken();
        if (!refreshed) {
          console.error('[TokenManager] refresh ล้มเหลว');
          return null;
        }
      }

      return this.accessToken;
    } catch (error) {
      console.error('[TokenManager] ดึง access token ล้มเหลว:', error);
      return null;
    }
  },

  /**
   * ขอ access token ใหม่โดยใช้ refresh token
   * ป้องกัน race condition ด้วย isRefreshing flag
   */
  async refreshAccessToken() {
    // ป้องกันเรียก refresh ซ้อนกัน
    if (this.isRefreshing) {
      console.log('[TokenManager] กำลัง refresh อยู่แล้ว รอ...');
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isRefreshing) {
            clearInterval(checkInterval);
            resolve(!!this.accessToken);
          }
        }, 100);
      });
    }

    this.isRefreshing = true;

    try {
      if (!this.refreshToken) {
        console.error('[TokenManager] ไม่มี refresh token');
        Helpers.showToast('กรุณาเข้าสู่ระบบใหม่', 'error');
        return false;
      }

      console.log('[TokenManager] กำลัง refresh access token...');

      // ตรวจสอบ license validator ก่อน
      if (LicenseValidator.currentToken) {
        console.log('[TokenManager] มี license token ยืนยันอยู่');
      }

      const response = await fetch(this.REFRESH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Refresh-Token': this.refreshToken
        },
        body: JSON.stringify({
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token',
          client_id: 'flow-extented-chrome'
        })
      });

      if (!response.ok) {
        // ถ้า refresh token หมดอายุ → ต้อง login ใหม่
        if (response.status === 401 || response.status === 403) {
          console.error('[TokenManager] refresh token หมดอายุ');
          await this._clearTokens();
          Helpers.showToast('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
          return false;
        }
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();

      // บันทึก tokens ใหม่
      if (data.access_token) {
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token || this.refreshToken;
        this.tokenExpiry = data.expires_at || this._calculateExpiry(data.expires_in);

        await chrome.storage.local.set({
          [this.STORAGE_KEY_ACCESS]: this.accessToken,
          [this.STORAGE_KEY_REFRESH]: this.refreshToken,
          [this.STORAGE_KEY_EXPIRY]: this.tokenExpiry
        });

        // ตั้ง timer ใหม่
        this._scheduleRefresh();

        console.log('[TokenManager] refresh สำเร็จ, token ใหม่หมดอายุ:', new Date(this.tokenExpiry).toLocaleString('th-TH'));
        return true;
      }

      return false;
    } catch (error) {
      console.error('[TokenManager] refresh token ล้มเหลว:', error);
      Helpers.showToast('ไม่สามารถต่ออายุ token ได้', 'error');
      return false;
    } finally {
      this.isRefreshing = false;
    }
  },

  /**
   * หมุนเปลี่ยน key pair สำหรับ token signing
   * ใช้เมื่อสงสัยว่า key รั่วไหล
   */
  async rotateKeys() {
    try {
      console.log('[TokenManager] กำลังหมุนเปลี่ยน signing keys...');

      const response = await fetch(this.ROTATE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          reason: 'scheduled_rotation',
          device_signature: await DeviceFingerprint.generate(),
          timestamp: Date.now()
        })
      });

      if (!response.ok) {
        throw new Error(`Key rotation failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // อัพเดท tokens ใหม่ทั้งหมด
        this.accessToken = data.new_access_token;
        this.refreshToken = data.new_refresh_token;
        this.tokenExpiry = data.expires_at;

        await chrome.storage.local.set({
          [this.STORAGE_KEY_ACCESS]: this.accessToken,
          [this.STORAGE_KEY_REFRESH]: this.refreshToken,
          [this.STORAGE_KEY_EXPIRY]: this.tokenExpiry
        });

        console.log('[TokenManager] หมุนเปลี่ยน keys สำเร็จ');
        return true;
      }

      return false;
    } catch (error) {
      console.error('[TokenManager] หมุนเปลี่ยน keys ล้มเหลว:', error);
      return false;
    }
  },

  /**
   * เช็คว่า access token หมดอายุหรือยัง
   * bufferSeconds = จำนวนวินาทีที่เผื่อไว้ก่อนหมดอายุจริง
   */
  isExpired(bufferSeconds = 0) {
    if (!this.tokenExpiry) return true;
    const now = Date.now();
    const expiryWithBuffer = this.tokenExpiry - (bufferSeconds * 1000);
    return now >= expiryWithBuffer;
  },

  /**
   * ถอดรหัส JWT token (ไม่ verify signature)
   * ใช้สำหรับอ่านข้อมูลใน payload
   */
  decodeJwt(token) {
    try {
      if (!token) return null;

      const parts = token.split('.');
      if (parts.length !== 3) {
        console.error('[TokenManager] JWT format ไม่ถูกต้อง');
        return null;
      }

      // ถอดรหัส payload (ส่วนที่ 2)
      const payload = parts[1];
      // แก้ base64url เป็น base64 ปกติ
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      const decoded = atob(padded);

      return JSON.parse(decoded);
    } catch (error) {
      console.error('[TokenManager] ถอดรหัส JWT ล้มเหลว:', error);
      return null;
    }
  },

  /**
   * คำนวณเวลาหมดอายุจาก expires_in (วินาที)
   */
  _calculateExpiry(expiresIn) {
    // ค่าเริ่มต้น 1 ชั่วโมง ถ้าไม่ได้ระบุ
    const seconds = expiresIn || 3600;
    return Date.now() + (seconds * 1000);
  },

  /**
   * ตั้งเวลา auto-refresh ก่อน token หมดอายุ
   */
  _scheduleRefresh() {
    // ยกเลิก timer เก่า
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokenExpiry) return;

    // refresh ก่อนหมดอายุ 5 นาที
    const refreshAt = this.tokenExpiry - (5 * 60 * 1000);
    const delay = Math.max(0, refreshAt - Date.now());

    if (delay > 0) {
      this.refreshTimer = setTimeout(async () => {
        console.log('[TokenManager] auto-refresh token...');
        await this.refreshAccessToken();
      }, delay);

      console.log('[TokenManager] ตั้ง auto-refresh ใน', Math.round(delay / 60000), 'นาที');
    }
  },

  /**
   * ลบ tokens ทั้งหมดออกจาก storage
   */
  async _clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    await chrome.storage.local.remove([
      this.STORAGE_KEY_ACCESS,
      this.STORAGE_KEY_REFRESH,
      this.STORAGE_KEY_EXPIRY
    ]);

    console.log('[TokenManager] ลบ tokens ทั้งหมดแล้ว');
  }
};

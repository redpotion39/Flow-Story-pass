/**
 * Offline Verifier
 * ตรวจสอบ license แบบ offline ด้วย RSA public key signature verification
 */
const OfflineVerifier = {
  STORAGE_KEY_LICENSE: 'flowOfflineLicense',
  STORAGE_KEY_SIGNATURE: 'flowLicenseSignature',
  OFFLINE_GRACE_PERIOD: 7 * 24 * 60 * 60 * 1000, // 7 วัน

  // RSA public key สำหรับ verify signature (PEM format)
  RSA_PUBLIC_KEY: `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA0xVb4mRKzTqDR8G9Xfka
jLHGcOB3YzUeiJnA7R5SqE8SVDtBp0bWEVjQMhN3rO5W0tF+c9aKbvH8xKEp5Nw
j4SsE8z8L0VBqcFwNhS6K8vQh4OmXrdA3kFz6OHVcPTm8E+obFkwq6YR5pjzNRd
FkuG5SLQX2aN8UwJ6OPb5dJmLc7e4Y1PnQoAh9j2M3fK0e8V7WLh8CGxRnZr0BW
cUapR4G8vN3e0LXb4MkIcPA0f5rNMPqzn3FHEfTtfdAg5S1bBjHBmTKF9bgL7Orq
qnAVpVYN0Eee4j0GxDmveqByQ7RN4m7b9LD9a2jvgZE0qm8XGGKFnJzXeKPV7UR
cvLHx3EjP9PaW3bcTo8TMx9eLR+tMvfa0LHzmNUhLOiJYxT3VClW5oHD3TVfGLiB
TbU+1zb8nYDR2FEQmYlWVE3MFhJqo4kDC5MhX6F1GSxiQWjA0hJSrEuOgv9r3DW
L8tlRHn4pBSy44uO7NiT3FR9h0R84a0t3FNl8hwFP5LU5a9r0fAlBFKxXYPR7D0G
EDbx4S1G3qSa0HjyrMzzUQ0qnJ7MzQbh1LNMBgR0oMei4M2pC3tm7c9MHPMO3YR
PGNa0XKDQhFjNdhi8G0d3FvsRET1J3Qig5C2Bvkk90Dpj3LtHqz0l2RD0SnM9HkM
OOY0dxCOL0bClmB7xQGlF0MCAwEAAQ==
-----END PUBLIC KEY-----`,

  // สถานะ
  publicKey: null,
  cachedLicense: null,
  isKeyImported: false,

  /**
   * เริ่มต้นระบบ offline verifier
   * import RSA public key และโหลด cached license
   */
  async init() {
    try {
      console.log('[OfflineVerifier] กำลังเริ่มต้นระบบตรวจสอบแบบ offline...');

      // import RSA public key
      await this.importPublicKey();

      // โหลด cached license จาก storage
      const stored = await new Promise((resolve) => {
        chrome.storage.local.get([
          this.STORAGE_KEY_LICENSE,
          this.STORAGE_KEY_SIGNATURE
        ], resolve);
      });

      if (stored[this.STORAGE_KEY_LICENSE]) {
        this.cachedLicense = JSON.parse(stored[this.STORAGE_KEY_LICENSE]);
        console.log('[OfflineVerifier] โหลด cached license สำเร็จ');
      }

      console.log('[OfflineVerifier] เริ่มต้นระบบสำเร็จ');
      return true;
    } catch (error) {
      console.error('[OfflineVerifier] เริ่มต้นระบบล้มเหลว:', error);
      return false;
    }
  },

  /**
   * Import RSA public key จาก PEM format เป็น CryptoKey
   */
  async importPublicKey() {
    try {
      if (this.isKeyImported && this.publicKey) {
        return this.publicKey;
      }

      console.log('[OfflineVerifier] กำลัง import RSA public key...');

      // แปลง PEM เป็น binary
      const pemContent = this.RSA_PUBLIC_KEY
        .replace('-----BEGIN PUBLIC KEY-----', '')
        .replace('-----END PUBLIC KEY-----', '')
        .replace(/\s/g, '');

      const binaryString = atob(pemContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // import เป็น CryptoKey
      this.publicKey = await crypto.subtle.importKey(
        'spki',
        bytes.buffer,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-512'
        },
        false,
        ['verify']
      );

      this.isKeyImported = true;
      console.log('[OfflineVerifier] import RSA public key สำเร็จ');
      return this.publicKey;
    } catch (error) {
      console.error('[OfflineVerifier] import RSA public key ล้มเหลว:', error);
      Helpers.showToast('ไม่สามารถโหลด verification key ได้', 'error');
      return null;
    }
  },

  /**
   * ตรวจสอบ signature ของข้อมูล license
   * ใช้ RSA-PKCS1-v1.5 กับ SHA-512
   */
  async verifySignature(data, signature) {
    try {
      if (!this.publicKey) {
        await this.importPublicKey();
      }

      if (!this.publicKey) {
        console.error('[OfflineVerifier] ไม่มี public key สำหรับ verify');
        return false;
      }

      console.log('[OfflineVerifier] กำลังตรวจสอบ signature...');

      // แปลง data เป็น bytes
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(typeof data === 'string' ? data : JSON.stringify(data));

      // แปลง signature จาก base64 เป็น bytes
      const signatureString = atob(signature);
      const signatureBytes = new Uint8Array(signatureString.length);
      for (let i = 0; i < signatureString.length; i++) {
        signatureBytes[i] = signatureString.charCodeAt(i);
      }

      // verify ด้วย Web Crypto API
      const isValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        this.publicKey,
        signatureBytes.buffer,
        dataBuffer
      );

      console.log('[OfflineVerifier] ผลการตรวจสอบ signature:', isValid ? 'ถูกต้อง' : 'ไม่ถูกต้อง');
      return isValid;
    } catch (error) {
      console.error('[OfflineVerifier] ตรวจสอบ signature ล้มเหลว:', error);
      return false;
    }
  },

  /**
   * ตรวจสอบว่า license ที่ cache ไว้ยังใช้งานได้แบบ offline
   * เช็ค signature, วันหมดอายุ, และ hardware binding
   */
  async isOfflineValid() {
    try {
      console.log('[OfflineVerifier] กำลังตรวจสอบ license แบบ offline...');

      // โหลด license และ signature จาก storage
      const stored = await new Promise((resolve) => {
        chrome.storage.local.get([
          this.STORAGE_KEY_LICENSE,
          this.STORAGE_KEY_SIGNATURE
        ], resolve);
      });

      const licenseData = stored[this.STORAGE_KEY_LICENSE];
      const signature = stored[this.STORAGE_KEY_SIGNATURE];

      if (!licenseData || !signature) {
        console.log('[OfflineVerifier] ไม่มีข้อมูล license สำหรับ offline verification');
        return { valid: false, reason: 'NO_CACHED_LICENSE' };
      }

      // ตรวจสอบ signature
      const isSignatureValid = await this.verifySignature(licenseData, signature);
      if (!isSignatureValid) {
        console.error('[OfflineVerifier] signature ไม่ถูกต้อง — อาจถูกแก้ไข');
        Helpers.showToast('ข้อมูล license ถูกแก้ไข กรุณาเชื่อมต่ออินเทอร์เน็ต', 'error');
        return { valid: false, reason: 'INVALID_SIGNATURE' };
      }

      const license = JSON.parse(licenseData);

      // เช็คว่าหมดอายุ offline grace period หรือยัง
      const lastVerified = license.last_online_verify || 0;
      const offlineDuration = Date.now() - lastVerified;

      if (offlineDuration > this.OFFLINE_GRACE_PERIOD) {
        console.warn('[OfflineVerifier] เกิน grace period:', Math.round(offlineDuration / 86400000), 'วัน');
        Helpers.showToast('กรุณาเชื่อมต่ออินเทอร์เน็ตเพื่อยืนยัน license', 'error');
        return { valid: false, reason: 'GRACE_PERIOD_EXPIRED' };
      }

      // เช็ค license expiry
      if (license.expires_at && Date.now() > license.expires_at) {
        console.log('[OfflineVerifier] license หมดอายุแล้ว');
        return { valid: false, reason: 'LICENSE_EXPIRED' };
      }

      // เช็ค hardware binding
      const hwBindingValid = await HardwareBinding.verifyBinding();
      if (!hwBindingValid) {
        console.warn('[OfflineVerifier] hardware binding ไม่ตรง');
        return { valid: false, reason: 'HARDWARE_MISMATCH' };
      }

      // เช็ค device fingerprint
      const currentFingerprint = await DeviceFingerprint.generate();
      if (license.device_fingerprint && license.device_fingerprint !== currentFingerprint) {
        console.warn('[OfflineVerifier] device fingerprint ไม่ตรง');
        return { valid: false, reason: 'DEVICE_MISMATCH' };
      }

      console.log('[OfflineVerifier] license offline ถูกต้อง');
      return {
        valid: true,
        license: license,
        offlineDays: Math.round(offlineDuration / 86400000),
        gracePeriodLeft: Math.round((this.OFFLINE_GRACE_PERIOD - offlineDuration) / 86400000)
      };
    } catch (error) {
      console.error('[OfflineVerifier] ตรวจสอบ offline ล้มเหลว:', error);
      return { valid: false, reason: 'VERIFICATION_ERROR' };
    }
  },

  /**
   * ดึง cached license
   * คืนค่า null ถ้าไม่มีหรือไม่ valid
   */
  async getCachedLicense() {
    try {
      if (this.cachedLicense) {
        return this.cachedLicense;
      }

      const stored = await new Promise((resolve) => {
        chrome.storage.local.get([this.STORAGE_KEY_LICENSE], resolve);
      });

      if (stored[this.STORAGE_KEY_LICENSE]) {
        this.cachedLicense = JSON.parse(stored[this.STORAGE_KEY_LICENSE]);
        return this.cachedLicense;
      }

      console.log('[OfflineVerifier] ไม่มี cached license');
      return null;
    } catch (error) {
      console.error('[OfflineVerifier] อ่าน cached license ล้มเหลว:', error);
      return null;
    }
  },

  /**
   * บันทึก license ลง cache สำหรับ offline verification
   * เรียกหลังจาก online verify สำเร็จ
   */
  async cacheLicense(licenseData, signature) {
    try {
      // เพิ่ม timestamp ที่ verify ออนไลน์ล่าสุด
      const dataWithTimestamp = {
        ...licenseData,
        last_online_verify: Date.now(),
        device_fingerprint: await DeviceFingerprint.generate()
      };

      const dataString = JSON.stringify(dataWithTimestamp);

      await chrome.storage.local.set({
        [this.STORAGE_KEY_LICENSE]: dataString,
        [this.STORAGE_KEY_SIGNATURE]: signature
      });

      this.cachedLicense = dataWithTimestamp;
      console.log('[OfflineVerifier] cache license สำเร็จ');
      return true;
    } catch (error) {
      console.error('[OfflineVerifier] cache license ล้มเหลว:', error);
      return false;
    }
  },

  /**
   * ลบ cached license ทั้งหมด
   */
  async clearCache() {
    try {
      await chrome.storage.local.remove([
        this.STORAGE_KEY_LICENSE,
        this.STORAGE_KEY_SIGNATURE
      ]);

      this.cachedLicense = null;
      console.log('[OfflineVerifier] ลบ cache สำเร็จ');
    } catch (error) {
      console.error('[OfflineVerifier] ลบ cache ล้มเหลว:', error);
    }
  }
};

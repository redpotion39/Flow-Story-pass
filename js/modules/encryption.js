/**
 * Encryption Module
 * Handles AES-GCM encryption for sensitive data like API keys
 */
const Encryption = {
  _cryptoKey: null,
  _algorithm: 'AES-GCM',
  _keyLength: 256,
  _ivLength: 12,
  STORAGE_KEY: 'flowEncryptionKey',
  STORAGE_DATA: 'flowEncryptedData',

  /**
   * Initialize encryption module
   * โหลด key จาก storage หรือสร้างใหม่ถ้ายังไม่มี
   */
  async init() {
    try {
      const stored = await this._getStoredKey();
      if (stored) {
        // นำ key ที่เก็บไว้มาใช้ต่อ
        this._cryptoKey = await crypto.subtle.importKey(
          'jwk',
          stored,
          { name: this._algorithm, length: this._keyLength },
          true,
          ['encrypt', 'decrypt']
        );
        console.log('[Encryption] loaded existing key from storage');
      } else {
        // สร้าง key ใหม่ครั้งแรก
        await this.generateKey();
        console.log('[Encryption] generated new encryption key');
      }
    } catch (err) {
      console.error('[Encryption] init failed:', err);
      Helpers.showToast('Encryption initialization failed', 'error');
    }
  },

  /**
   * สร้าง AES-GCM key ใหม่และเก็บลง storage
   */
  async generateKey() {
    try {
      this._cryptoKey = await crypto.subtle.generateKey(
        { name: this._algorithm, length: this._keyLength },
        true,
        ['encrypt', 'decrypt']
      );

      // export เป็น JWK เพื่อเก็บลง chrome.storage
      const exported = await crypto.subtle.exportKey('jwk', this._cryptoKey);
      await new Promise((resolve) => {
        chrome.storage.local.set({ [this.STORAGE_KEY]: exported }, resolve);
      });

      console.log('[Encryption] new key generated and stored');
      return this._cryptoKey;
    } catch (err) {
      console.error('[Encryption] generateKey error:', err);
      Helpers.showToast('Failed to generate encryption key', 'error');
      return null;
    }
  },

  /**
   * เข้ารหัสข้อมูลด้วย AES-GCM
   * @param {string} data - ข้อมูลที่ต้องการเข้ารหัส
   * @param {CryptoKey} key - key สำหรับเข้ารหัส (ถ้าไม่ส่งจะใช้ key ปัจจุบัน)
   * @returns {Promise<{iv: string, ciphertext: string}>}
   */
  async encrypt(data, key = null) {
    try {
      const activeKey = key || this._cryptoKey;
      if (!activeKey) {
        throw new Error('No encryption key available');
      }

      // สร้าง IV แบบสุ่มสำหรับแต่ละครั้ง
      const iv = crypto.getRandomValues(new Uint8Array(this._ivLength));
      const encoded = new TextEncoder().encode(data);

      const ciphertext = await crypto.subtle.encrypt(
        { name: this._algorithm, iv },
        activeKey,
        encoded
      );

      // แปลงเป็น base64 เพื่อเก็บใน storage ได้
      const ivBase64 = btoa(String.fromCharCode(...iv));
      const ctBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

      console.log('[Encryption] data encrypted successfully, size:', ctBase64.length);
      return { iv: ivBase64, ciphertext: ctBase64 };
    } catch (err) {
      console.error('[Encryption] encrypt error:', err);
      Helpers.showToast('Encryption failed', 'error');
      return null;
    }
  },

  /**
   * ถอดรหัสข้อมูล
   * @param {{iv: string, ciphertext: string}} encryptedData
   * @param {CryptoKey} key
   * @returns {Promise<string>}
   */
  async decrypt(encryptedData, key = null) {
    try {
      const activeKey = key || this._cryptoKey;
      if (!activeKey) {
        throw new Error('No decryption key available');
      }

      // แปลง base64 กลับเป็น ArrayBuffer
      const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
      const ciphertext = Uint8Array.from(atob(encryptedData.ciphertext), c => c.charCodeAt(0));

      const decrypted = await crypto.subtle.decrypt(
        { name: this._algorithm, iv },
        activeKey,
        ciphertext
      );

      const plaintext = new TextDecoder().decode(decrypted);
      console.log('[Encryption] data decrypted successfully');
      return plaintext;
    } catch (err) {
      console.error('[Encryption] decrypt error:', err);
      Helpers.showToast('Decryption failed - key may be corrupted', 'error');
      return null;
    }
  },

  /**
   * เข้ารหัส API key ก่อนเก็บลง storage
   * @param {string} apiKey - API key ที่ต้องการเข้ารหัส
   */
  async encryptApiKey(apiKey) {
    try {
      if (!apiKey || apiKey.trim() === '') {
        console.warn('[Encryption] empty API key, skipping encryption');
        return false;
      }

      const encrypted = await this.encrypt(apiKey);
      if (!encrypted) return false;

      // เก็บข้อมูลที่เข้ารหัสแล้วลง storage
      await new Promise((resolve) => {
        chrome.storage.local.set({ [this.STORAGE_DATA]: encrypted }, resolve);
      });

      console.log('[Encryption] API key encrypted and stored');
      return true;
    } catch (err) {
      console.error('[Encryption] encryptApiKey error:', err);
      return false;
    }
  },

  /**
   * ถอดรหัส API key จาก storage
   * @returns {Promise<string|null>}
   */
  async decryptApiKey() {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get([this.STORAGE_DATA], resolve);
      });

      const encryptedData = result[this.STORAGE_DATA];
      if (!encryptedData) {
        console.log('[Encryption] no encrypted API key found');
        return null;
      }

      const apiKey = await this.decrypt(encryptedData);
      console.log('[Encryption] API key decrypted, length:', apiKey ? apiKey.length : 0);
      return apiKey;
    } catch (err) {
      console.error('[Encryption] decryptApiKey error:', err);
      return null;
    }
  },

  /**
   * ลบ key และข้อมูลที่เข้ารหัสทั้งหมดออกจาก storage
   */
  async wipeKey() {
    try {
      this._cryptoKey = null;

      await new Promise((resolve) => {
        chrome.storage.local.remove([this.STORAGE_KEY, this.STORAGE_DATA], resolve);
      });

      console.log('[Encryption] all encryption data wiped');
      Helpers.showToast('Encryption keys cleared', 'info');
    } catch (err) {
      console.error('[Encryption] wipeKey error:', err);
    }
  },

  /**
   * ดึง key จาก storage (internal)
   */
  async _getStoredKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.STORAGE_KEY], (result) => {
        resolve(result[this.STORAGE_KEY] || null);
      });
    });
  }
};

/**
 * Hardware Binding
 * ผูกอุปกรณ์ด้วย WebGPU, USB enumeration และ PBKDF2 key derivation
 */
const HardwareBinding = {
  STORAGE_KEY: 'flowHardwareBinding',
  PBKDF2_ITERATIONS: 310000,
  SALT_LENGTH: 32,
  KEY_LENGTH: 256,

  // ข้อมูล binding ปัจจุบัน
  bindingHash: null,
  gpuInfo: null,
  isVerified: false,

  /**
   * เริ่มต้นระบบ hardware binding
   * โหลด binding hash จาก storage และตรวจสอบ
   */
  async init() {
    try {
      console.log('[HardwareBinding] กำลังเริ่มต้นระบบผูกอุปกรณ์...');

      // โหลด binding hash เดิมจาก storage
      const stored = await new Promise((resolve) => {
        chrome.storage.local.get([this.STORAGE_KEY], resolve);
      });

      const savedBinding = stored[this.STORAGE_KEY] || null;

      // สร้าง binding hash ใหม่จากฮาร์ดแวร์ปัจจุบัน
      const currentHash = await this.generateBindingHash();

      if (savedBinding) {
        // เปรียบเทียบกับ binding เดิม
        if (savedBinding === currentHash) {
          this.isVerified = true;
          console.log('[HardwareBinding] ผูกอุปกรณ์ตรงกัน');
        } else {
          // ฮาร์ดแวร์เปลี่ยน → ต้องยืนยันใหม่
          console.warn('[HardwareBinding] ตรวจพบฮาร์ดแวร์เปลี่ยนแปลง');
          this.isVerified = false;
          Helpers.showToast('ตรวจพบอุปกรณ์เปลี่ยนแปลง กรุณายืนยันตัวตน', 'error');
        }
      } else {
        // ครั้งแรก → บันทึก binding hash
        await chrome.storage.local.set({ [this.STORAGE_KEY]: currentHash });
        this.isVerified = true;
        console.log('[HardwareBinding] บันทึก hardware binding ใหม่');
      }

      this.bindingHash = currentHash;
      return this.isVerified;
    } catch (error) {
      console.error('[HardwareBinding] เริ่มต้นระบบล้มเหลว:', error);
      return false;
    }
  },

  /**
   * ดึงข้อมูล GPU จาก WebGPU API
   * ใช้ adapter info เป็นส่วนหนึ่งของ fingerprint
   */
  async getGpuAdapter() {
    try {
      // เช็คว่า browser รองรับ WebGPU หรือไม่
      if (!navigator.gpu) {
        console.warn('[HardwareBinding] WebGPU ไม่พร้อมใช้งาน ใช้ fallback');
        return this._getWebGLFallback();
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.warn('[HardwareBinding] ไม่สามารถเข้าถึง GPU adapter');
        return this._getWebGLFallback();
      }

      // ดึง adapter info
      const info = await adapter.requestAdapterInfo();
      const gpuData = {
        vendor: info.vendor || 'unknown',
        architecture: info.architecture || 'unknown',
        device: info.device || 'unknown',
        description: info.description || 'unknown',
        features: Array.from(adapter.features).sort().join(','),
        limits: {
          maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
          maxBufferSize: adapter.limits.maxBufferSize,
          maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension
        }
      };

      this.gpuInfo = gpuData;
      console.log('[HardwareBinding] GPU info:', gpuData.vendor, gpuData.architecture);
      return JSON.stringify(gpuData);
    } catch (error) {
      console.warn('[HardwareBinding] WebGPU query ล้มเหลว:', error);
      return this._getWebGLFallback();
    }
  },

  /**
   * สำรวจอุปกรณ์ USB ที่เชื่อมต่อ
   * ใช้เป็น hardware identifier เพิ่มเติม
   */
  async enumerateDevices() {
    try {
      // ใช้ MediaDevices API แทน USB API (ไม่ต้องขอ permission)
      const devices = await navigator.mediaDevices.enumerateDevices();

      // เก็บแค่ข้อมูลที่ไม่เปลี่ยน (label อาจว่างถ้ายังไม่ได้ permission)
      const deviceSignatures = devices.map(d => ({
        kind: d.kind,
        groupId: d.groupId
      }));

      // เรียงลำดับเพื่อให้ consistent
      deviceSignatures.sort((a, b) => a.kind.localeCompare(b.kind) || a.groupId.localeCompare(b.groupId));

      console.log('[HardwareBinding] พบอุปกรณ์:', deviceSignatures.length, 'ชิ้น');
      return JSON.stringify(deviceSignatures);
    } catch (error) {
      console.warn('[HardwareBinding] สำรวจอุปกรณ์ล้มเหลว:', error);
      return 'devices-unavailable';
    }
  },

  /**
   * สร้าง key จาก master key ด้วย PBKDF2
   * ใช้สำหรับเข้ารหัส binding data
   */
  async deriveKey(masterKey, salt) {
    try {
      // แปลง master key เป็น CryptoKey
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(masterKey),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );

      // สร้าง salt ถ้าไม่ได้ระบุ
      let saltBuffer;
      if (salt) {
        saltBuffer = encoder.encode(salt);
      } else {
        saltBuffer = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
      }

      // derive key ด้วย PBKDF2
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: saltBuffer,
          iterations: this.PBKDF2_ITERATIONS,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: this.KEY_LENGTH },
        true,
        ['encrypt', 'decrypt']
      );

      // export key เป็น raw bytes
      const exportedKey = await crypto.subtle.exportKey('raw', derivedKey);
      const keyArray = Array.from(new Uint8Array(exportedKey));
      const keyHex = keyArray.map(b => b.toString(16).padStart(2, '0')).join('');

      console.log('[HardwareBinding] derive key สำเร็จ');
      return keyHex;
    } catch (error) {
      console.error('[HardwareBinding] derive key ล้มเหลว:', error);
      return null;
    }
  },

  /**
   * ตรวจสอบว่าอุปกรณ์ปัจจุบันตรงกับ binding ที่บันทึกไว้
   * คืนค่า true ถ้าตรงกัน
   */
  async verifyBinding() {
    try {
      console.log('[HardwareBinding] กำลังตรวจสอบ binding...');

      const stored = await new Promise((resolve) => {
        chrome.storage.local.get([this.STORAGE_KEY], resolve);
      });

      const savedBinding = stored[this.STORAGE_KEY];
      if (!savedBinding) {
        console.log('[HardwareBinding] ไม่พบ binding ที่บันทึกไว้');
        return false;
      }

      // สร้าง hash ใหม่จากฮาร์ดแวร์ปัจจุบัน
      const currentHash = await this.generateBindingHash();

      // เปรียบเทียบแบบ constant-time เพื่อป้องกัน timing attack
      const match = this._constantTimeCompare(savedBinding, currentHash);

      this.isVerified = match;
      console.log('[HardwareBinding] ผลการตรวจสอบ:', match ? 'ตรงกัน' : 'ไม่ตรง');
      return match;
    } catch (error) {
      console.error('[HardwareBinding] ตรวจสอบ binding ล้มเหลว:', error);
      return false;
    }
  },

  /**
   * สร้าง binding hash จากข้อมูลฮาร์ดแวร์ทั้งหมด
   */
  async generateBindingHash() {
    try {
      // เก็บข้อมูลฮาร์ดแวร์จากหลายแหล่ง
      const gpuData = await this.getGpuAdapter();
      const deviceData = await this.enumerateDevices();

      // ข้อมูลระบบเพิ่มเติม
      const systemData = [
        navigator.platform,
        navigator.hardwareConcurrency || 0,
        navigator.deviceMemory || 0,
        screen.width, screen.height, screen.colorDepth,
        navigator.maxTouchPoints || 0
      ].join(':');

      // รวมข้อมูลทั้งหมดแล้ว hash
      const combined = `HW-BIND:${gpuData}|${deviceData}|${systemData}`;

      // ใช้ PBKDF2 derive key แทนการ hash ธรรมดา เพื่อความปลอดภัย
      const bindingKey = await this.deriveKey(combined, 'flow-hardware-salt-v2');

      console.log('[HardwareBinding] สร้าง binding hash สำเร็จ');
      return bindingKey;
    } catch (error) {
      console.error('[HardwareBinding] สร้าง binding hash ล้มเหลว:', error);
      return null;
    }
  },

  /**
   * WebGL fallback กรณี WebGPU ไม่พร้อม
   */
  _getWebGLFallback() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'gpu-unavailable';

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        return JSON.stringify({ vendor, renderer, fallback: true });
      }

      return 'webgl-no-debug';
    } catch (error) {
      return 'gpu-error';
    }
  },

  /**
   * เปรียบเทียบ string แบบ constant-time
   * ป้องกัน timing attack
   */
  _constantTimeCompare(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
};

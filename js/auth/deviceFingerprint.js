/**
 * Device Fingerprint
 * สร้างลายนิ้วมืออุปกรณ์จาก Canvas, AudioContext และ Font Detection
 */
const DeviceFingerprint = {
  PREFIX: 'FLOW-EXT-',
  HASH_ALGORITHM: 'SHA-384',
  cachedFingerprint: null,

  // รายชื่อ font ที่ใช้ตรวจสอบ
  PROBE_FONTS: [
    'Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia',
    'Palatino', 'Garamond', 'Comic Sans MS', 'Impact', 'Lucida Console',
    'Tahoma', 'Trebuchet MS', 'Arial Black', 'Helvetica', 'Monaco',
    'Andale Mono', 'Consolas', 'Menlo', 'SF Pro Display', 'Segoe UI',
    'Roboto', 'Noto Sans Thai', 'Sarabun', 'Prompt', 'Kanit'
  ],

  /**
   * สร้าง fingerprint หลัก
   * รวมข้อมูลจาก canvas, audio, fonts และข้อมูลระบบ
   */
  async generate() {
    try {
      // ใช้ cached ถ้ามี
      if (this.cachedFingerprint) {
        console.log('[DeviceFingerprint] ใช้ fingerprint จาก cache');
        return this.cachedFingerprint;
      }

      console.log('[DeviceFingerprint] กำลังสร้าง fingerprint ใหม่...');

      // เก็บข้อมูลจากหลายแหล่ง
      const canvasHash = await this.getCanvasFingerprint();
      const audioHash = await this.getAudioFingerprint();
      const fontList = this.getFontList();
      const fontHash = await this.hash(fontList.join(','));

      // ข้อมูลระบบเพิ่มเติม
      const systemInfo = [
        navigator.platform,
        navigator.hardwareConcurrency || 0,
        navigator.deviceMemory || 0,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.languages.join(',')
      ].join('|');

      const systemHash = await this.hash(systemInfo);

      // รวมทุกส่วนเข้าด้วยกัน
      const combined = `${canvasHash}:${audioHash}:${fontHash}:${systemHash}`;
      const finalHash = await this.hash(combined);

      // ใส่ prefix และตัดให้เหลือ 40 ตัวอักษร
      this.cachedFingerprint = this.PREFIX + finalHash.substring(0, 40);
      console.log('[DeviceFingerprint] สร้าง fingerprint สำเร็จ:', this.cachedFingerprint.substring(0, 16) + '...');

      return this.cachedFingerprint;
    } catch (error) {
      console.error('[DeviceFingerprint] สร้าง fingerprint ล้มเหลว:', error);
      // fallback กรณีเกิดข้อผิดพลาด
      const fallback = this.PREFIX + 'fallback-' + Date.now().toString(36);
      return fallback;
    }
  },

  /**
   * สร้าง fingerprint จาก Canvas 2D
   * วาดรูปทรงและข้อความเพื่อดูความแตกต่างของ rendering
   */
  async getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 280;
      canvas.height = 60;
      const ctx = canvas.getContext('2d');

      // วาดพื้นหลังแบบ gradient
      const gradient = ctx.createLinearGradient(0, 0, 280, 0);
      gradient.addColorStop(0, '#ff6b35');
      gradient.addColorStop(0.5, '#00d4aa');
      gradient.addColorStop(1, '#7c3aed');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 280, 60);

      // วาดข้อความหลายแบบ
      ctx.fillStyle = '#1a1a2e';
      ctx.font = '18px Arial';
      ctx.textBaseline = 'top';
      ctx.fillText('Flow Ext fingerprint v2.0', 5, 5);

      ctx.font = 'italic 14px Georgia';
      ctx.fillText('Canvas2D render test', 5, 30);

      // วาดรูปทรงเรขาคณิต
      ctx.beginPath();
      ctx.arc(240, 30, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 107, 53, 0.7)';
      ctx.fill();

      // วาดเส้นโค้ง bezier
      ctx.beginPath();
      ctx.moveTo(130, 50);
      ctx.bezierCurveTo(150, 10, 200, 50, 220, 15);
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 2;
      ctx.stroke();

      // แปลง canvas เป็น data URL แล้ว hash
      const dataUrl = canvas.toDataURL('image/png');
      const hash = await this.hash(dataUrl);

      console.log('[DeviceFingerprint] Canvas fingerprint:', hash.substring(0, 16) + '...');
      return hash;
    } catch (error) {
      console.warn('[DeviceFingerprint] Canvas fingerprint ล้มเหลว:', error);
      return 'canvas-unavailable';
    }
  },

  /**
   * สร้าง fingerprint จาก AudioContext
   * ใช้ oscillator + compressor เพื่อตรวจสอบ audio processing
   */
  async getAudioFingerprint() {
    try {
      // สร้าง offline audio context
      const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 5000, 44100);

      // สร้าง oscillator
      const oscillator = audioCtx.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime);

      // สร้าง compressor เพื่อเพิ่มความแตกต่าง
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
      compressor.knee.setValueAtTime(40, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
      compressor.attack.setValueAtTime(0, audioCtx.currentTime);
      compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

      // เชื่อมต่อ nodes
      oscillator.connect(compressor);
      compressor.connect(audioCtx.destination);
      oscillator.start(0);

      // render audio buffer
      const audioBuffer = await audioCtx.startRendering();
      const channelData = audioBuffer.getChannelData(0);

      // สุ่มเก็บ samples เพื่อสร้าง fingerprint
      let audioSignature = '';
      for (let i = 4500; i < 5000; i++) {
        audioSignature += Math.abs(channelData[i]).toString().substring(0, 8);
      }

      const hash = await this.hash(audioSignature);
      console.log('[DeviceFingerprint] Audio fingerprint:', hash.substring(0, 16) + '...');
      return hash;
    } catch (error) {
      console.warn('[DeviceFingerprint] Audio fingerprint ล้มเหลว:', error);
      return 'audio-unavailable';
    }
  },

  /**
   * ตรวจสอบ font ที่มีในระบบ
   * ใช้วิธี canvas text measurement
   */
  getFontList() {
    const detectedFonts = [];

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const testString = 'mmmmmmmmlli';
      const baseFont = 'monospace';
      const testSize = '72px';

      // วัดขนาดของ base font ก่อน
      ctx.font = `${testSize} ${baseFont}`;
      const baseWidth = ctx.measureText(testString).width;

      // เปรียบเทียบกับ font อื่นๆ
      for (const font of this.PROBE_FONTS) {
        ctx.font = `${testSize} '${font}', ${baseFont}`;
        const testWidth = ctx.measureText(testString).width;

        // ถ้าขนาดต่างจาก base font แสดงว่ามี font นี้
        if (testWidth !== baseWidth) {
          detectedFonts.push(font);
        }
      }

      console.log('[DeviceFingerprint] ตรวจพบ font:', detectedFonts.length, 'ตัว');
    } catch (error) {
      console.warn('[DeviceFingerprint] ตรวจสอบ font ล้มเหลว:', error);
    }

    return detectedFonts;
  },

  /**
   * Hash ข้อมูลด้วย SHA-384
   * ใช้ Web Crypto API
   */
  async hash(data) {
    try {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-384', encoded);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('[DeviceFingerprint] hash ล้มเหลว:', error);
      // fallback: ใช้ simple hash
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16).padStart(16, '0');
    }
  }
};

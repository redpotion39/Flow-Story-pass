/**
 * Debug Logger Module
 * Remote log shipping with queue-based batch sending
 */
const DebugLogger = {
  LOG_ENDPOINT: 'https://aiunlock.co/api/logs/ingest',
  STORAGE_KEY: 'flowDebugConfig',
  _buffer: [],
  _maxBufferSize: 100,
  _flushIntervalMs: 30000,
  _flushTimer: null,
  _remoteEnabled: false,
  _logLevel: 'info',
  _sessionId: null,

  /**
   * ระดับ log เรียงจากน้อยไปมาก
   */
  _levels: {
    'debug': 0,
    'info': 1,
    'warn': 2,
    'error': 3
  },

  /**
   * Initialize debug logger
   * โหลด config จาก storage และเริ่ม flush timer
   * @param {Object} options - ค่าเริ่มต้น
   * @param {boolean} options.remoteEnabled - เปิด remote logging
   * @param {string} options.logLevel - ระดับ log ต่ำสุดที่จะบันทึก
   * @param {number} options.flushInterval - ระยะห่างระหว่าง flush (ms)
   */
  async init(options = {}) {
    try {
      // สร้าง session ID สำหรับ tracking
      this._sessionId = this._generateSessionId();

      // โหลด config จาก storage
      const stored = await new Promise((resolve) => {
        chrome.storage.local.get([this.STORAGE_KEY], resolve);
      });

      const config = stored[this.STORAGE_KEY] || {};

      // ใช้ค่าจาก options > storage > default
      this._remoteEnabled = options.remoteEnabled ?? config.remoteEnabled ?? false;
      this._logLevel = options.logLevel ?? config.logLevel ?? 'info';
      this._flushIntervalMs = options.flushInterval ?? config.flushInterval ?? 30000;

      // เริ่ม auto flush ถ้าเปิด remote logging
      if (this._remoteEnabled) {
        this._startFlushTimer();
      }

      // flush ก่อนปิดหน้า
      window.addEventListener('beforeunload', () => {
        this.flush();
      });

      console.log('[DebugLogger] initialized, remote:', this._remoteEnabled, 'level:', this._logLevel);
    } catch (err) {
      console.error('[DebugLogger] init failed:', err);
    }
  },

  /**
   * บันทึก log ลง buffer
   * @param {string} level - ระดับ: debug, info, warn, error
   * @param {string} message - ข้อความ log
   * @param {*} data - ข้อมูลเพิ่มเติม (optional)
   */
  log(level, message, data = null) {
    try {
      // เช็คว่าระดับ log ถึงเกณฑ์หรือไม่
      if (this._levels[level] < this._levels[this._logLevel]) {
        return;
      }

      const entry = {
        timestamp: Date.now(),
        level,
        message,
        data: data ? this._sanitize(data) : null,
        sessionId: this._sessionId,
        url: window.location?.href || 'extension'
      };

      // เก็บลง buffer
      this._buffer.push(entry);

      // ถ้า buffer เต็ม ให้ flush ทันที
      if (this._buffer.length >= this._maxBufferSize) {
        console.log('[DebugLogger] buffer full, auto flushing');
        this.flush();
      }

      // พิมพ์ลง console ด้วย
      const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[consoleMethod](`[DebugLogger][${level.toUpperCase()}] ${message}`, data || '');
    } catch (err) {
      console.error('[DebugLogger] log error:', err);
    }
  },

  /**
   * Shortcut สำหรับ info level
   */
  info(message, data = null) {
    this.log('info', message, data);
  },

  /**
   * Shortcut สำหรับ warn level
   */
  warn(message, data = null) {
    this.log('warn', message, data);
  },

  /**
   * Shortcut สำหรับ error level
   */
  error(message, data = null) {
    this.log('error', message, data);
  },

  /**
   * ส่ง log ทั้งหมดใน buffer ไปยัง remote endpoint
   * ใช้ sendBeacon สำหรับ reliability ตอนปิดหน้า
   */
  async flush() {
    if (this._buffer.length === 0) return;
    if (!this._remoteEnabled) {
      // ถ้าไม่ได้เปิด remote ให้เคลียร์ buffer เฉยๆ
      this._buffer = [];
      return;
    }

    // ดึง log ออกจาก buffer ก่อน (ป้องกัน duplicate)
    const logsToSend = [...this._buffer];
    this._buffer = [];

    try {
      const payload = JSON.stringify({
        logs: logsToSend,
        meta: {
          extensionVersion: chrome.runtime.getManifest().version,
          sessionId: this._sessionId,
          userAgent: navigator.userAgent,
          sentAt: Date.now()
        }
      });

      // ใช้ sendBeacon ถ้า flush ตอนปิดหน้า (reliable delivery)
      if (document.visibilityState === 'hidden') {
        navigator.sendBeacon(this.LOG_ENDPOINT, payload);
        console.log('[DebugLogger] flushed via sendBeacon:', logsToSend.length, 'entries');
        return;
      }

      // ใช้ fetch ปกติ
      const response = await fetch(this.LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      if (!response.ok) {
        throw new Error(`Log ingest failed: ${response.status}`);
      }

      console.log('[DebugLogger] flushed', logsToSend.length, 'entries to remote');
    } catch (err) {
      // ใส่กลับ buffer ถ้าส่งไม่สำเร็จ
      console.error('[DebugLogger] flush error:', err);
      this._buffer = [...logsToSend, ...this._buffer].slice(-this._maxBufferSize);
    }
  },

  /**
   * เปิด/ปิด remote logging
   * @param {boolean} enabled
   */
  async setRemoteLogging(enabled) {
    this._remoteEnabled = enabled;

    if (enabled) {
      this._startFlushTimer();
    } else {
      this._stopFlushTimer();
    }

    // บันทึก config ลง storage
    const config = await new Promise((resolve) => {
      chrome.storage.local.get([this.STORAGE_KEY], resolve);
    });

    const updated = {
      ...(config[this.STORAGE_KEY] || {}),
      remoteEnabled: enabled
    };

    await new Promise((resolve) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: updated }, resolve);
    });

    console.log('[DebugLogger] remote logging:', enabled ? 'enabled' : 'disabled');
  },

  /**
   * ดึง log ที่อยู่ใน buffer ปัจจุบัน
   * @returns {Array} สำเนาของ buffer
   */
  getLogBuffer() {
    return [...this._buffer];
  },

  /**
   * เริ่ม timer สำหรับ auto flush (internal)
   */
  _startFlushTimer() {
    this._stopFlushTimer();
    this._flushTimer = setInterval(() => {
      this.flush();
    }, this._flushIntervalMs);
  },

  /**
   * หยุด timer (internal)
   */
  _stopFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  },

  /**
   * ลบข้อมูลที่อาจ sensitive ออกจาก log data (internal)
   * ป้องกัน API key หลุดไปกับ remote log
   */
  _sanitize(data) {
    try {
      const str = JSON.stringify(data);
      // mask ค่าที่ดูเหมือน API key
      const masked = str.replace(
        /(["']?(?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["'])([^"']{4})[^"']*(["'])/gi,
        '$1$2****$3'
      );
      return JSON.parse(masked);
    } catch {
      return data;
    }
  },

  /**
   * สร้าง session ID แบบสุ่ม (internal)
   */
  _generateSessionId() {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
};

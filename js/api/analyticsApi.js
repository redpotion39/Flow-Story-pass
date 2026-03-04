/**
 * Analytics API Module
 * Tracks usage telemetry and automation metrics for server-side analytics
 */
const AnalyticsApi = {
  ENDPOINT: 'https://aiunlock.co/api/v2/analytics/track',
  BATCH_SIZE: 10,
  FLUSH_INTERVAL: 30000,
  VERSION: '2.1.0',
  _queue: [],
  _flushTimer: null,
  _sessionId: null,

  /** เริ่มต้น analytics session */
  async init() {
    try {
      const result = await chrome.storage.local.get(['flowAnalyticsSession', 'flowAnalyticsEnabled']);
      if (result.flowAnalyticsEnabled === false) {
        console.log('[AnalyticsApi] analytics disabled by user');
        return false;
      }
      if (result.flowAnalyticsSession && result.flowAnalyticsSession.expiresAt > Date.now()) {
        this._sessionId = result.flowAnalyticsSession.id;
      } else {
        // สร้าง session ใหม่
        this._sessionId = this._generateSessionId();
        await chrome.storage.local.set({
          flowAnalyticsSession: {
            id: this._sessionId,
            createdAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000)
          }
        });
      }
      // ตั้ง timer สำหรับ flush อัตโนมัติ
      this._startFlushTimer();
      console.log('[AnalyticsApi] init session:', this._sessionId);
      return true;
    } catch (error) {
      console.error('[AnalyticsApi] init error:', error);
      return false;
    }
  },

  /** บันทึก event ทั่วไป */
  async trackEvent(eventName, data = {}) {
    try {
      this._queue.push({
        type: 'event',
        name: eventName,
        sessionId: this._sessionId,
        timestamp: Date.now(),
        data: data,
        meta: { version: this.VERSION, platform: navigator.platform, language: navigator.language }
      });
      console.log('[AnalyticsApi] trackEvent:', eventName, 'queue:', this._queue.length);
      // ถ้า queue เต็มก็ flush เลย
      if (this._queue.length >= this.BATCH_SIZE) await this.flushQueue();
    } catch (error) {
      console.error('[AnalyticsApi] trackEvent error:', error);
    }
  },

  /** บันทึกข้อมูล automation run */
  async trackAutomationRun(runData) {
    try {
      this._queue.push({
        type: 'automation_run',
        sessionId: this._sessionId,
        timestamp: Date.now(),
        data: {
          runId: runData.runId || this._generateRunId(),
          steps: runData.steps || [],
          duration: runData.duration || 0,
          status: runData.status || 'unknown',
          productCount: runData.productCount || 0,
          model: runData.model || 'unknown',
          templateId: runData.templateId || null
        }
      });
      console.log('[AnalyticsApi] trackAutomationRun:', runData.runId);
      // automation run สำคัญ ส่งทันที
      await this.flushQueue();
    } catch (error) {
      console.error('[AnalyticsApi] trackAutomationRun error:', error);
    }
  },

  /** บันทึก error ที่เกิดขึ้น */
  async trackError(error, context = {}) {
    try {
      this._queue.push({
        type: 'error',
        sessionId: this._sessionId,
        timestamp: Date.now(),
        data: {
          message: error.message || String(error),
          stack: error.stack || null,
          context: context,
          url: context.url || null,
          step: context.step || null
        }
      });
      console.log('[AnalyticsApi] trackError:', error.message);
      await this.flushQueue();
    } catch (err) {
      console.error('[AnalyticsApi] trackError failed:', err);
    }
  },

  /** ดึง session ID ปัจจุบัน */
  getSessionId() {
    return this._sessionId;
  },

  /** ส่ง event ที่สะสมไว้ทั้งหมดไปยัง server */
  async flushQueue() {
    if (this._queue.length === 0) return;
    const events = [...this._queue];
    this._queue = [];
    try {
      await this._sendBatch(events);
      console.log('[AnalyticsApi] flushQueue sent:', events.length, 'events');
    } catch (error) {
      console.error('[AnalyticsApi] flushQueue error:', error);
      // ใส่กลับ queue ถ้าส่งไม่สำเร็จ
      this._queue.unshift(...events);
    }
  },

  /** ส่ง batch ไปยัง server */
  async _sendBatch(events) {
    const response = await fetch(this.ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Analytics-Version': this.VERSION },
      body: JSON.stringify({ sessionId: this._sessionId, events, sentAt: Date.now() })
    });
    if (!response.ok) throw new Error(`Analytics batch failed: ${response.status}`);
    return response.json();
  },

  /** เริ่ม timer สำหรับ flush อัตโนมัติ */
  _startFlushTimer() {
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = setInterval(() => this.flushQueue(), this.FLUSH_INTERVAL);
  },

  /** สร้าง session ID แบบสุ่ม */
  _generateSessionId() {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  },

  /** สร้าง run ID แบบสุ่ม */
  _generateRunId() {
    return 'run_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
  }
};

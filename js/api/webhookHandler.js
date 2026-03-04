/**
 * Webhook Handler Module
 * Sends automation event notifications via webhook (LINE, Discord, Slack)
 */
const WebhookHandler = {
  WEBHOOK_URL: 'https://aiunlock.co/api/webhooks/notify',
  SUPPORTED_PLATFORMS: ['line', 'discord', 'slack'],
  _config: null,
  _initialized: false,

  /** โหลดการตั้งค่า webhook จาก storage */
  async init() {
    try {
      const result = await chrome.storage.local.get(['flowWebhookConfig']);
      this._config = result.flowWebhookConfig || {
        enabled: false, platform: 'line', webhookUrl: null,
        notifyOnComplete: true, notifyOnError: true, notifyOnMilestone: false
      };
      this._initialized = true;
      console.log('[WebhookHandler] init:', this._config.platform, 'enabled:', this._config.enabled);
      return this._config.enabled;
    } catch (error) {
      console.error('[WebhookHandler] init error:', error);
      return false;
    }
  },

  /** แจ้งเตือนเมื่อ automation run เสร็จสมบูรณ์ */
  async notifyComplete(runData) {
    try {
      if (!this._config?.enabled || !this._config?.notifyOnComplete) return;
      const message = this._formatCompleteMessage(runData);
      await this._send(message);
      console.log('[WebhookHandler] notifyComplete sent:', runData.runId);
    } catch (error) {
      console.error('[WebhookHandler] notifyComplete error:', error);
    }
  },

  /** แจ้งเตือนเมื่อเกิด error */
  async notifyError(error, context = {}) {
    try {
      if (!this._config?.enabled || !this._config?.notifyOnError) return;
      const message = this._formatErrorMessage(error, context);
      await this._send(message);
      console.log('[WebhookHandler] notifyError sent:', error.message);
    } catch (err) {
      console.error('[WebhookHandler] notifyError failed:', err);
    }
  },

  /** แจ้งเตือนเมื่อถึง milestone สำคัญ */
  async notifyMilestone(milestone) {
    try {
      if (!this._config?.enabled || !this._config?.notifyOnMilestone) return;
      const message = this._formatMilestoneMessage(milestone);
      await this._send(message);
      console.log('[WebhookHandler] notifyMilestone sent:', milestone.type);
    } catch (error) {
      console.error('[WebhookHandler] notifyMilestone error:', error);
    }
  },

  /** ตั้งค่า webhook URL และ platform */
  async setWebhookUrl(url, platform = 'line') {
    try {
      if (!this.SUPPORTED_PLATFORMS.includes(platform)) throw new Error(`Unsupported platform: ${platform}`);
      this._config = { ...this._config, enabled: true, platform, webhookUrl: url };
      await chrome.storage.local.set({ flowWebhookConfig: this._config });
      console.log('[WebhookHandler] setWebhookUrl:', platform, url?.substring(0, 30) + '...');
      return true;
    } catch (error) {
      console.error('[WebhookHandler] setWebhookUrl error:', error);
      Helpers.showToast('ตั้งค่า webhook ล้มเหลว', 'error');
      return false;
    }
  },

  /** ทดสอบ webhook ว่าทำงานได้ */
  async testWebhook() {
    try {
      if (!this._config?.webhookUrl) {
        Helpers.showToast('กรุณาตั้งค่า webhook URL ก่อน', 'error');
        return false;
      }
      await this._send(this._formatTestMessage());
      console.log('[WebhookHandler] testWebhook success');
      Helpers.showToast('ทดสอบ webhook สำเร็จ', 'success');
      return true;
    } catch (error) {
      console.error('[WebhookHandler] testWebhook error:', error);
      Helpers.showToast('ทดสอบ webhook ล้มเหลว: ' + error.message, 'error');
      return false;
    }
  },

  /** ส่งข้อความไปยัง webhook */
  async _send(message) {
    const { platform, webhookUrl } = this._config;
    // จัดรูปแบบ body ตาม platform
    let body, headers = { 'Content-Type': 'application/json' };
    switch (platform) {
      case 'line':
        body = JSON.stringify({ message: message.text });
        headers['Authorization'] = `Bearer ${webhookUrl}`;
        break;
      case 'discord':
        body = JSON.stringify({ content: message.text, embeds: message.embed ? [message.embed] : [] });
        break;
      case 'slack':
        body = JSON.stringify({ text: message.text, blocks: message.blocks || [] });
        break;
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
    // ส่งผ่าน relay server เพื่อหลีกเลี่ยง CORS
    const response = await fetch(this.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform, body, headers,
        targetUrl: platform === 'line' ? 'https://notify-api.line.me/api/notify' : webhookUrl,
        timestamp: Date.now()
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Webhook failed: ${response.status}`);
    }
    return response.json();
  },

  /** จัดรูปแบบข้อความแจ้ง automation สำเร็จ */
  _formatCompleteMessage(runData) {
    const dur = Math.round((runData.duration || 0) / 1000);
    return {
      text: `Flow X - Automation Complete\nRun ID: ${runData.runId}\nสินค้า: ${runData.productCount || 0} รายการ\nใช้เวลา: ${dur} วินาที\nสถานะ: สำเร็จ`,
      embed: {
        title: 'Automation Complete', color: 0x00ff00,
        fields: [
          { name: 'Run ID', value: runData.runId, inline: true },
          { name: 'Products', value: String(runData.productCount || 0), inline: true },
          { name: 'Duration', value: `${dur}s`, inline: true }
        ]
      }
    };
  },

  /** จัดรูปแบบข้อความแจ้ง error */
  _formatErrorMessage(error, context) {
    return {
      text: `Flow X - Error\nข้อผิดพลาด: ${error.message || String(error)}\nStep: ${context.step || 'unknown'}\nเวลา: ${new Date().toLocaleString('th-TH')}`,
      embed: {
        title: 'Automation Error', color: 0xff0000,
        description: error.message || String(error),
        fields: [
          { name: 'Step', value: context.step || 'unknown', inline: true },
          { name: 'Time', value: new Date().toLocaleString('th-TH'), inline: true }
        ]
      }
    };
  },

  /** จัดรูปแบบข้อความแจ้ง milestone */
  _formatMilestoneMessage(milestone) {
    return {
      text: `Flow X - Milestone\n${milestone.type}: ${milestone.message || ''}\nค่า: ${milestone.value || 0}`,
      embed: { title: `Milestone: ${milestone.type}`, color: 0xffaa00, description: milestone.message || '' }
    };
  },

  /** จัดรูปแบบข้อความทดสอบ */
  _formatTestMessage() {
    return {
      text: `Flow X - Webhook Test\nการทดสอบเชื่อมต่อ webhook สำเร็จ\nเวลา: ${new Date().toLocaleString('th-TH')}`,
      embed: { title: 'Webhook Test', color: 0x0099ff, description: 'การทดสอบเชื่อมต่อ webhook สำเร็จ' },
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*Flow X - Webhook Test*\nการทดสอบเชื่อมต่อ webhook สำเร็จ' } }]
    };
  }
};

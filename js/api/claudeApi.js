/**
 * Claude API Module
 * Handles communication with Anthropic Claude API for caption generation
 */
const ClaudeApi = {
  API_URL: 'https://api.anthropic.com/v1/messages',
  DEFAULT_MODEL: 'claude-sonnet-4-20250514',
  API_VERSION: '2023-06-01',
  MAX_TOKENS: 4096,

  /** โหลด API key จาก storage */
  async init() {
    try {
      const result = await chrome.storage.local.get(['claudeApiKey', 'claudeModel']);
      this.apiKey = result.claudeApiKey || null;
      this.model = result.claudeModel || this.DEFAULT_MODEL;
      console.log('[ClaudeApi] init:', this.model);
      return !!this.apiKey;
    } catch (error) {
      console.error('[ClaudeApi] init failed:', error);
      return false;
    }
  },

  /** สร้าง caption จากข้อมูลสินค้า */
  async generateCaption(productInfo, style) {
    try {
      if (!this.apiKey) throw new Error('Claude API key not configured');

      const requestBody = {
        model: this.model,
        max_tokens: this.MAX_TOKENS,
        system: this._buildSystemPrompt(style),
        messages: [{ role: 'user', content: this._buildUserMessage(productInfo) }]
      };

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.API_VERSION
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Claude API error');
      }

      const data = await response.json();
      console.log('[ClaudeApi] generateCaption response:', data);
      // ดึงข้อความจาก response
      const textBlock = data.content?.find(block => block.type === 'text');
      return textBlock?.text || 'ไม่สามารถสร้าง caption ได้';
    } catch (error) {
      console.error('[ClaudeApi] generateCaption error:', error);
      Helpers.showToast('Claude API error: ' + error.message, 'error');
      throw error;
    }
  },

  /** วิเคราะห์รูปภาพสินค้าด้วย vision */
  async analyzeImage(base64Image) {
    try {
      if (!this.apiKey) throw new Error('Claude API key not configured');
      // เตรียม image data สำหรับ vision
      const mimeType = ImageUtils.getMimeType(base64Image);
      const base64Data = ImageUtils.getBase64Data(base64Image);

      const requestBody = {
        model: this.model,
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
            { type: 'text', text: 'วิเคราะห์รูปภาพสินค้านี้ บอกชื่อสินค้า คุณสมบัติเด่น จุดขาย และกลุ่มเป้าหมาย ตอบเป็นภาษาไทย' }
          ]
        }]
      };

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.API_VERSION
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Claude Vision error');
      }

      const data = await response.json();
      console.log('[ClaudeApi] analyzeImage result:', data);
      const textBlock = data.content?.find(block => block.type === 'text');
      return textBlock?.text || '';
    } catch (error) {
      console.error('[ClaudeApi] analyzeImage error:', error);
      Helpers.showToast('วิเคราะห์รูปภาพล้มเหลว', 'error');
      throw error;
    }
  },

  /** Streaming response สำหรับ real-time output */
  async streamResponse(messages, onChunk) {
    try {
      if (!this.apiKey) throw new Error('Claude API key not configured');

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.API_VERSION
        },
        body: JSON.stringify({ model: this.model, max_tokens: this.MAX_TOKENS, stream: true, messages })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Claude stream error');
      }

      // อ่าน SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
        for (const line of lines) {
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'content_block_delta' && event.delta?.text) {
              fullText += event.delta.text;
              onChunk(event.delta.text, fullText);
            }
          } catch (_) { /* ข้าม JSON ที่ parse ไม่ได้ */ }
        }
      }
      console.log('[ClaudeApi] stream complete, length:', fullText.length);
      return fullText;
    } catch (error) {
      console.error('[ClaudeApi] streamResponse error:', error);
      Helpers.showToast('Stream error: ' + error.message, 'error');
      throw error;
    }
  },

  /** ดึงข้อมูลการใช้งาน API */
  async getUsage() {
    try {
      const result = await chrome.storage.local.get(['claudeUsageData']);
      const usage = result.claudeUsageData || { inputTokens: 0, outputTokens: 0, totalCost: 0 };
      console.log('[ClaudeApi] getUsage:', usage);
      return usage;
    } catch (error) {
      console.error('[ClaudeApi] getUsage error:', error);
      return { inputTokens: 0, outputTokens: 0, totalCost: 0 };
    }
  },

  /** สร้าง system prompt ตาม style */
  _buildSystemPrompt(style) {
    const styleMap = {
      ugc: 'เขียนแบบ UGC สไตล์รีวิวจริง ใช้ภาษาทั่วไป เน้นประสบการณ์ใช้จริง',
      formal: 'เขียนแบบทางการ เน้นข้อมูลจริง คุณสมบัติ และคุณประโยชน์',
      funny: 'เขียนแบบตลก สนุกสนาน ใช้มุกตลก เน้นความบันเทิง',
      minimal: 'เขียนสั้นกระชับ ได้ใจความ ไม่เกิน 2-3 ประโยค'
    };
    return `คุณเป็นนักเขียน caption สินค้า TikTok มืออาชีพ ${styleMap[style] || styleMap.ugc}`;
  },

  /** สร้าง user message จากข้อมูลสินค้า */
  _buildUserMessage(productInfo) {
    let msg = `สร้าง caption สำหรับสินค้า: ${productInfo.name || 'ไม่ระบุชื่อ'}`;
    if (productInfo.description) msg += `\nรายละเอียด: ${productInfo.description}`;
    if (productInfo.price) msg += `\nราคา: ${productInfo.price} บาท`;
    return msg;
  }
};

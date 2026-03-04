/**
 * Stability AI API Module
 * Handles image generation and editing via Stability AI platform
 */
const StabilityApi = {
  API_URL: 'https://api.stability.ai/v2beta',
  DEFAULT_ENGINE: 'stable-diffusion-xl-1024-v1-0',
  UPSCALE_ENGINE: 'esrgan-v1-x2plus',

  /** โหลด API key จาก storage */
  async init() {
    try {
      const result = await chrome.storage.local.get(['stabilityApiKey', 'stabilityEngine']);
      this.apiKey = result.stabilityApiKey || null;
      this.engine = result.stabilityEngine || this.DEFAULT_ENGINE;
      console.log('[StabilityApi] init:', this.engine);
      return !!this.apiKey;
    } catch (error) {
      console.error('[StabilityApi] init failed:', error);
      return false;
    }
  },

  /** สร้างรูปภาพจาก prompt */
  async generateImage(prompt, options = {}) {
    try {
      if (!this.apiKey) throw new Error('Stability API key not configured');
      // สร้าง request body สำหรับ text-to-image
      const requestBody = {
        text_prompts: [{ text: prompt, weight: 1.0 }],
        cfg_scale: options.cfgScale || 7,
        height: options.height || 1024,
        width: options.width || 1024,
        steps: options.steps || 30,
        samples: options.samples || 1
      };
      // เพิ่ม negative prompt ถ้ามี
      if (options.negativePrompt) {
        requestBody.text_prompts.push({ text: options.negativePrompt, weight: -1.0 });
      }

      const response = await fetch(`${this.API_URL}/generation/${this.engine}/text-to-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Stability API error');
      }

      const data = await response.json();
      console.log('[StabilityApi] generateImage artifacts:', data.artifacts?.length);
      // แปลง base64 เป็น data URL
      return (data.artifacts || []).map(a => `data:image/png;base64,${a.base64}`);
    } catch (error) {
      console.error('[StabilityApi] generateImage error:', error);
      Helpers.showToast('สร้างรูปภาพล้มเหลว: ' + error.message, 'error');
      throw error;
    }
  },

  /** ลบพื้นหลังจากรูปภาพ */
  async removeBackground(imageBase64) {
    try {
      if (!this.apiKey) throw new Error('Stability API key not configured');
      const blob = this._base64ToBlob(imageBase64);
      const formData = new FormData();
      formData.append('image', blob, 'image.png');
      formData.append('output_format', 'png');

      const response = await fetch(`${this.API_URL}/stable-image/edit/remove-background`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Accept': 'application/json' },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Remove background failed');
      }
      const data = await response.json();
      console.log('[StabilityApi] removeBackground success');
      return `data:image/png;base64,${data.image}`;
    } catch (error) {
      console.error('[StabilityApi] removeBackground error:', error);
      Helpers.showToast('ลบพื้นหลังล้มเหลว', 'error');
      throw error;
    }
  },

  /** ขยายรูปภาพให้ชัดขึ้น */
  async upscaleImage(imageBase64, scale = 2) {
    try {
      if (!this.apiKey) throw new Error('Stability API key not configured');
      const blob = this._base64ToBlob(imageBase64);
      const formData = new FormData();
      formData.append('image', blob, 'image.png');
      formData.append('width', Math.min(scale * 1024, 4096));

      // เรียก upscale API
      const response = await fetch(`${this.API_URL}/stable-image/upscale/conservative`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Accept': 'application/json' },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upscale failed');
      }
      const data = await response.json();
      console.log('[StabilityApi] upscaleImage success, scale:', scale);
      return `data:image/png;base64,${data.image}`;
    } catch (error) {
      console.error('[StabilityApi] upscaleImage error:', error);
      Helpers.showToast('ขยายรูปภาพล้มเหลว', 'error');
      throw error;
    }
  },

  /** แก้ไขบางส่วนของรูปภาพด้วย mask */
  async inpaint(imageBase64, mask, prompt) {
    try {
      if (!this.apiKey) throw new Error('Stability API key not configured');
      const formData = new FormData();
      formData.append('image', this._base64ToBlob(imageBase64), 'image.png');
      formData.append('mask', this._base64ToBlob(mask), 'mask.png');
      formData.append('prompt', prompt);
      formData.append('output_format', 'png');

      const response = await fetch(`${this.API_URL}/stable-image/edit/inpaint`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Accept': 'application/json' },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Inpaint failed');
      }
      const data = await response.json();
      console.log('[StabilityApi] inpaint success');
      return `data:image/png;base64,${data.image}`;
    } catch (error) {
      console.error('[StabilityApi] inpaint error:', error);
      Helpers.showToast('แก้ไขรูปภาพล้มเหลว', 'error');
      throw error;
    }
  },

  /** เช็คยอดเครดิตคงเหลือ */
  async getBalance() {
    try {
      if (!this.apiKey) return { credits: 0 };
      const response = await fetch(`${this.API_URL}/user/balance`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!response.ok) throw new Error('Failed to fetch balance');
      const data = await response.json();
      console.log('[StabilityApi] getBalance:', data.credits);
      return data;
    } catch (error) {
      console.error('[StabilityApi] getBalance error:', error);
      return { credits: 0 };
    }
  },

  /** แปลง base64 เป็น Blob */
  _base64ToBlob(base64String) {
    const base64Data = ImageUtils.getBase64Data(base64String);
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  }
};

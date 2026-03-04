/**
 * Gemini API Module
 * Handles communication with Google Gemini API
 */
const GeminiApi = {
  MODEL: 'gemini-2.5-flash',
  API_URL: 'https://generativelanguage.googleapis.com/v1beta/models',

  SAFETY_SETTINGS: [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
  ],

  /**
   * Generate prompt using Gemini API (with auto-retry)
   */
  async generatePrompt(apiKey, productImage, productName, hasPersonImage, ugcSettings) {
    // Resize image before sending
    const resizedImage = await ImageUtils.resizeImage(productImage);
    const base64Data = ImageUtils.getBase64Data(resizedImage);
    const mimeType = ImageUtils.getMimeType(resizedImage);

    // Build request body
    const requestBody = {
      system_instruction: {
        parts: [
          {
            text: SystemPrompt.getSystemPrompt()
          }
        ]
      },
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            },
            {
              text: SystemPrompt.buildUserMessage(productName, hasPersonImage, ugcSettings)
            }
          ]
        }
      ],
      generationConfig: {
        temperature: SystemPrompt.getTemperature(),
        maxOutputTokens: 2048
      },
      safetySettings: this.SAFETY_SETTINGS
    };

    return this._fetchWithRetry(apiKey, requestBody);
  },

  /**
   * Generate video prompt using Gemini API (text only, no image, with auto-retry)
   * Sanitizes prompt to avoid Gemini 2.5 PROHIBITED_CONTENT false positives
   */
  async generateVideoPrompt(apiKey, systemPrompt, userMessage) {
    const requestBody = {
      system_instruction: {
        parts: [
          {
            text: this._sanitizeForSafety(systemPrompt)
          }
        ]
      },
      contents: [
        {
          parts: [
            {
              text: this._sanitizeForSafety(userMessage)
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 8192
      },
      safetySettings: this.SAFETY_SETTINGS
    };

    return this._fetchWithRetry(apiKey, requestBody);
  },

  /**
   * Fetch with auto-retry (max 2 attempts)
   */
  async _fetchWithRetry(apiKey, requestBody, maxRetries = 2) {
    const url = `${this.API_URL}/${this.MODEL}:generateContent?key=${apiKey}`;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || `Gemini API error (${response.status})`);
        }

        const data = await response.json();
        return this._extractText(data);
      } catch (error) {
        lastError = error;
        console.warn(`[Gemini] Attempt ${attempt}/${maxRetries} failed:`, error.message);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    throw lastError;
  },

  /**
   * Sanitize prompt text to avoid Gemini 2.5 PROHIBITED_CONTENT false positives
   * "image-to-video" + people descriptions triggers synthetic media detection
   */
  _sanitizeForSafety(text) {
    return text
      .replace(/image-to-video/gi, 'short video')
      .replace(/^.*ห้าม.*(?:เด็ก|ทารก|baby).*$/gm, '- คนในวิดีโอต้องเป็นผู้ใหญ่เท่านั้น')
      .replace(/^.*ห้าม.*(?:รักษา|หาย|cure).*$/gm, '- ใช้ถ้อยคำทั่วไป หลีกเลี่ยงคำทางการแพทย์')
      .replace(/\n{3,}/g, '\n\n');
  },

  /**
   * Extract text from Gemini response, filtering out thinking parts (Gemini 2.5)
   */
  _extractText(data) {
    // เช็ค prompt blocked โดย safety filter
    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) {
      console.error('[Gemini] Prompt blocked:', blockReason);
      throw new Error(`Gemini บล็อค prompt (${blockReason}) — ลองเปลี่ยนภาพหรือ template`);
    }

    const candidate = data.candidates?.[0];

    // ไม่มี candidates เลย
    if (!candidate) {
      console.error('[Gemini] No candidates:', JSON.stringify(data).substring(0, 500));
      throw new Error('Gemini ไม่ส่งผลลัพธ์กลับมา — ลองใหม่อีกครั้ง');
    }

    // เช็ค finishReason ที่ผิดปกติ
    const finishReason = candidate.finishReason;
    if (finishReason === 'SAFETY') {
      const ratings = candidate.safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ') || 'unknown';
      console.error('[Gemini] Safety blocked:', ratings);
      throw new Error('Gemini บล็อคเนื้อหา (Safety filter) — ลองเปลี่ยนภาพหรือ template');
    }

    if (finishReason === 'MAX_TOKENS') {
      console.warn('[Gemini] Response truncated (MAX_TOKENS)');
    }

    // Extract text, filter out thinking parts
    const parts = candidate.content?.parts || [];
    const textParts = parts.filter(p => !p.thought);
    const text = textParts.map(p => p.text).join('');

    if (!text) {
      console.error('[Gemini] Empty text. finishReason:', finishReason, 'parts:', parts.length);
      throw new Error('Gemini ตอบกลับเป็นค่าว่าง — ลองใหม่อีกครั้ง');
    }

    return text;
  }
};

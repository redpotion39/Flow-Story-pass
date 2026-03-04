/**
 * System Prompt Module
 * Shared prompt template for all AI providers
 * Now supports dynamic templates
 */
const SystemPrompt = {
  // Current template (set by PromptTemplateSelector)
  currentTemplate: null,

  // Default system prompt (fallback)
  DEFAULT_SYSTEM_PROMPT: `คุณเป็นผู้เชี่ยวชาญในการสร้าง prompt สำหรับสร้างภาพโฆษณาแนว UGC (User Generated Content)
ที่มีคนรีวิวสินค้า โดยภาพจะต้องดูเป็นธรรมชาติ เหมือนคนจริงถ่ายรีวิว

หน้าที่ของคุณ:
1. วิเคราะห์ภาพสินค้าที่ได้รับ
2. สร้าง prompt ภาษาอังกฤษสำหรับสร้างภาพแนว UGC คนรีวิวสินค้า

กฎในการสร้าง prompt:
- ใช้ภาษาอังกฤษเท่านั้น
- คนในภาพต้องเป็นคนไทยเท่านั้น (Thai person, Thai woman, Thai man)
- ถ้ามีภาพคนแนบมา: ใช้เฉพาะใบหน้าเป็น reference เท่านั้น ให้สร้างท่าทาง เสื้อผ้า และฉากใหม่ที่เหมาะกับสินค้า
- อธิบายท่าทางการถือสินค้าที่เป็นธรรมชาติ
- อธิบายการจัดแสงแบบธรรมชาติ
- อธิบายฉากหลังที่เหมาะสม (บ้าน, ออฟฟิศ, คาเฟ่ ฯลฯ)
- ต้องมีสินค้าในภาพชัดเจน

ข้อห้าม:
- ห้ามใช้คำการันตี เช่น "100%", "การันตี", "รับประกัน"
- ห้ามโฆษณาเกินจริง
- ห้ามใช้คำว่า "รักษา", "cure", "treat", "heal"

ตอบกลับเฉพาะ prompt เท่านั้น ไม่ต้องอธิบายเพิ่ม`,

  /**
   * Set current template
   * @param {object} template - Template object
   */
  setTemplate(template) {
    this.currentTemplate = template;
    console.log('[SystemPrompt] Template set:', template?.name || 'default');
  },

  /**
   * Get system prompt for product analysis
   */
  getSystemPrompt() {
    if (this.currentTemplate && this.currentTemplate.systemPrompt) {
      return this.currentTemplate.systemPrompt;
    }
    return this.DEFAULT_SYSTEM_PROMPT;
  },

  /**
   * Get temperature setting from template
   */
  getTemperature() {
    if (this.currentTemplate && this.currentTemplate.settings) {
      return this.currentTemplate.settings.temperature || 0.7;
    }
    return 0.7;
  },

  /**
   * Check if template allows person image
   */
  allowsPersonImage() {
    if (this.currentTemplate && this.currentTemplate.settings) {
      return this.currentTemplate.settings.allowPersonImage !== false;
    }
    return true;
  },

  /**
   * Build user message for API
   * @param {string} productName - Product name
   * @param {boolean} hasPersonImage - Whether person image is provided
   * @param {object} ugcSettings - UGC character settings (gender, ageRange)
   */
  buildUserMessage(productName, hasPersonImage, ugcSettings) {
    // If template has userMessageTemplate, use it
    if (this.currentTemplate && this.currentTemplate.userMessageTemplate) {
      return this.buildFromTemplate(productName, hasPersonImage, ugcSettings);
    }

    // Default message building
    return this.buildDefaultMessage(productName, hasPersonImage, ugcSettings);
  },

  /**
   * Build message from template
   */
  buildFromTemplate(productName, hasPersonImage, ugcSettings) {
    let message = this.currentTemplate.userMessageTemplate;

    const genderText = this.getGenderText(ugcSettings.gender);
    const genderTextEn = this.getGenderTextEn(ugcSettings.gender);
    const personDescription = this.buildPersonDescription(hasPersonImage, ugcSettings, genderText, genderTextEn);

    // Replace placeholders
    message = message.replace(/\{\{productName\}\}/g, productName || 'ไม่ระบุชื่อ');
    message = message.replace(/\{\{personDescription\}\}/g, personDescription);
    message = message.replace(/\{\{genderTextEn\}\}/g, genderTextEn);
    message = message.replace(/\{\{genderText\}\}/g, genderText);

    return message;
  },

  /**
   * Build default message (original logic)
   */
  buildDefaultMessage(productName, hasPersonImage, ugcSettings) {
    let message = `สินค้า: ${productName || 'ไม่ระบุชื่อ'}\n\n`;

    const genderText = this.getGenderText(ugcSettings.gender);
    const genderTextEn = this.getGenderTextEn(ugcSettings.gender);

    if (hasPersonImage) {
      message += `คนในภาพ: คนไทย${genderText} (${genderTextEn}) - ใช้เฉพาะใบหน้าจากภาพที่แนบเท่านั้น (face reference only) แต่ให้สร้างท่าทาง เสื้อผ้า และฉากใหม่ที่เหมาะกับการรีวิวสินค้านี้\n`;
    } else {
      const ageText = ugcSettings.ageRange === 'random' ? 'สุ่ม (18-55 ปี)' :
                      ugcSettings.ageRange || 'ไม่ระบุ';
      message += `คนในภาพ: คนไทย${genderText} (${genderTextEn}) อายุ ${ageText}\n`;
    }

    message += `\nสร้าง prompt สำหรับภาพ UGC รีวิวสินค้านี้ (ต้องใช้ ${genderTextEn} เท่านั้น)`;

    return message;
  },

  /**
   * Build person description
   */
  buildPersonDescription(hasPersonImage, ugcSettings, genderText, genderTextEn) {
    if (hasPersonImage) {
      return `คนในภาพ: ${genderText} (${genderTextEn}) - ใช้เฉพาะใบหน้าจากภาพที่แนบเท่านั้น (face reference only)`;
    } else {
      const ageText = ugcSettings.ageRange === 'random' ? 'สุ่ม (18-55 ปี)' :
                      ugcSettings.ageRange || 'ไม่ระบุ';
      return `คนในภาพ: ${genderText} (${genderTextEn}) อายุ ${ageText}`;
    }
  },

  /**
   * Get gender text in Thai
   */
  getGenderText(gender) {
    switch (gender) {
      case 'male': return 'ผู้ชาย';
      case 'female': return 'ผู้หญิง';
      case 'random': return 'สุ่ม (ชายหรือหญิง)';
      default: return 'ผู้หญิง';
    }
  },

  /**
   * Get gender text in English
   */
  getGenderTextEn(gender) {
    switch (gender) {
      case 'male': return 'Thai man';
      case 'female': return 'Thai woman';
      default: return 'Thai woman';
    }
  }
};

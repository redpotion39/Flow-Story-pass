/**
 * Controls Prompt Module
 * Handles AI prompt generation, filling, and next scene generation
 */

Object.assign(Controls, {

  /**
   * Handle Generate Prompt button - calls AI API
   */
  async handleGeneratePrompt() {
    if (this.isGenerating) return;

    const storyTopic = document.getElementById('storyTopic')?.value?.trim() || '';
    const productName = await ImageUpload.getProductName();

    if (!storyTopic && !productName) {
      Helpers.showToast('กรุณากรอกหัวข้อเรื่อง', 'error');
      return;
    }

    const settings = await this.getSettings();
    if (!settings.apiKey) {
      this.showApiNotSetModal();
      return;
    }

    this.isGenerating = true;
    const btn = document.getElementById('generateImagePromptBtn');
    if (btn) btn.disabled = true;
    Helpers.showToast('กำลังสร้าง prompt...', 'info');

    try {
      const template = PromptTemplateSelector.getSelected();

      // ใช้ template system prompt เป็นฐาน
      let systemPrompt = template.systemPrompt || '';
      let userMessage = `หัวข้อเรื่อง: "${storyTopic || productName}"`;
      if (productName) {
        userMessage += `\nตัวละคร: "${productName}"`;
      }
      userMessage += `\nสร้าง prompt ภาพฉาก 1 ของเรื่องนี้`;

      let rawResponse;
      if (settings.model === 'gemini') {
        rawResponse = await GeminiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
      } else {
        rawResponse = await OpenaiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
      }

      const parsed = ResponseParser.parse(rawResponse, false);
      PromptGenerator.setPrompt(parsed.prompt);
      Helpers.showToast('สร้าง prompt สำเร็จ', 'success');

    } catch (error) {
      console.error('Error generating prompt:', error);
      Helpers.showToast(`เกิดข้อผิดพลาด: ${error.message}`, 'error');
    } finally {
      this.isGenerating = false;
      if (btn) btn.disabled = false;
    }
  },

  /**
   * Handle Generate Video Prompt button
   */
  async handleGenerateVideoPrompt() {
    if (this.isGenerating) return;

    const storyTopic = document.getElementById('storyTopic')?.value?.trim() || '';
    const productName = await ImageUpload.getProductName();

    if (!storyTopic && !productName) {
      Helpers.showToast('กรุณากรอกหัวข้อเรื่อง หรือชื่อตัวละคร', 'error');
      return;
    }

    const settings = await this.getSettings();
    if (!settings.apiKey) {
      this.showApiNotSetModal();
      return;
    }

    this.isGenerating = true;
    const btn = document.getElementById('generateVideoPromptBtn');
    if (btn) btn.disabled = true;
    Helpers.showToast('กำลังสร้าง prompt วิดีโอ...', 'info');

    try {
      const videoTemplate = VideoPromptTemplateSelector.getSelected();

      // ใช้ template system prompt เป็นฐาน
      let systemPrompt = videoTemplate.systemPrompt;
      let userMessage = `สร้าง prompt video สำหรับเรื่อง: "${storyTopic || productName}"`;
      if (productName) {
        userMessage += `\nตัวละคร: "${productName}"`;
      }
      userMessage += `\nฉาก 1 ของเรื่อง\n\nตอบเป็น prompt เดียวเท่านั้น`;

      let rawResponse;
      if (settings.model === 'gemini') {
        rawResponse = await GeminiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
      } else {
        rawResponse = await OpenaiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
      }

      // เพิ่ม Thai-only dialogue enforcement
      rawResponse = rawResponse.trim() + ' All dialogues must be in Thai language only.';

      PromptGenerator.setPrompt(rawResponse);
      Helpers.showToast('สร้าง prompt วิดีโอสำเร็จ', 'success');

    } catch (error) {
      console.error('Error generating video prompt:', error);
      Helpers.showToast(`เกิดข้อผิดพลาด: ${error.message}`, 'error');
    } finally {
      this.isGenerating = false;
      if (btn) btn.disabled = false;
    }
  },

  /**
   * Handle Fill Prompt button
   */
  async handleFillPrompt() {
    const prompt = PromptGenerator.getPrompt();
    if (!prompt) {
      Helpers.showToast('กรุณาสร้าง prompt ก่อน', 'error');
      return;
    }

    await this.fillPromptOnPage(prompt);
  },

  /**
   * Fill prompt on page via CDP Input.insertText (Slate.js compatible)
   */
  async fillPromptOnPage(prompt) {
    if (!prompt) {
      Helpers.showToast('ไม่มี prompt', 'error');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        await Helpers.copyToClipboard(prompt);
        Helpers.showToast('คัดลอก prompt แล้ว', 'success');
        return;
      }

      // Step 1: Focus Slate editor
      const focusResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const editorEl = document.querySelector('div[data-slate-editor="true"]');
          if (!editorEl) return { success: false };
          editorEl.focus();
          return { success: true };
        }
      });

      if (!focusResult?.[0]?.result?.success) {
        await Helpers.copyToClipboard(prompt);
        Helpers.showToast('ไม่พบ Slate editor — คัดลอก prompt แล้ว', 'info');
        return;
      }

      // Step 2: CDP — Ctrl+A select all + insert text
      const debuggee = { tabId: tab.id };
      await chrome.debugger.attach(debuggee, '1.3');

      try {
        await delay(200);

        // Ctrl+A เลือก content เดิมทั้งหมด
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
          type: 'rawKeyDown', key: 'a', code: 'KeyA',
          windowsVirtualKeyCode: 65, modifiers: 2
        });
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
          type: 'keyUp', key: 'a', code: 'KeyA',
          windowsVirtualKeyCode: 65, modifiers: 2
        });
        await delay(100);

        // ลบ \n → space (Enter = กดสร้าง ห้ามส่ง)
        const cleanPrompt = prompt.replace(/\n+/g, ' ').trim();

        // พิมพ์ prompt ทั้งก้อนทีเดียว
        await chrome.debugger.sendCommand(debuggee, 'Input.insertText', {
          text: cleanPrompt
        });

        Helpers.showToast('กรอก prompt แล้ว', 'success');
      } finally {
        try { await chrome.debugger.detach(debuggee); } catch (e) { /* ignore */ }
      }
    } catch (error) {
      console.error('Fill prompt error:', error);
      await Helpers.copyToClipboard(prompt);
      Helpers.showToast('คัดลอก prompt แล้ว (fallback)', 'info');
    }
  },

  /**
   * Fill prompt directly without AI generation
   */
  async fillPromptDirect(promptText) {
    const tab = await this.getActiveTab();
    if (!tab) return;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        // Find the prompt textarea
        const textarea = document.querySelector('textarea[placeholder*="prompt"], textarea[placeholder*="Prompt"], textarea.prompt-input, textarea[data-testid="prompt-textarea"]');
        if (textarea) {
          textarea.value = text;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      },
      args: [promptText]
    });
  },

  /**
   * Generate next scene prompt based on previous video prompt
   */
  async handleGenerateNextScene() {
    const previousPrompt = PromptGenerator.getPrompt();
    if (!previousPrompt) {
      Helpers.showToast('ไม่พบ prompt วิดีโอก่อนหน้า', 'error');
      return;
    }

    const settings = await this.getSettings();
    if (!settings.apiKey) return;

    try {
      const currentTemplate = SystemPrompt.currentTemplate;
      const isPixar3D = currentTemplate?.id?.startsWith('pixar-3d-');

      // เช็คฉากสุดท้าย: checkbox (manual) หรือ auto-detect จาก scene counter
      const finalSceneCheckbox = document.getElementById('finalSceneCheckbox');
      const isManualFinal = finalSceneCheckbox && finalSceneCheckbox.checked;
      const isAutoFinal = typeof this._currentSceneIndex !== 'undefined'
        && typeof this._totalSceneIterations !== 'undefined'
        && this._currentSceneIndex === this._totalSceneIterations - 1;
      const isFinalScene = isManualFinal || isAutoFinal;

      let systemPrompt;
      if (isPixar3D && isFinalScene) {
        systemPrompt = `You are a 3D animated cartoon style video scene continuation expert.

Rules:
- Keep the EXACT SAME 3D animated cartoon style as the previous scene
- Keep the EXACT SAME character design from the previous scene — do NOT change the character appearance
- THIS IS THE FINAL SCENE: The story reaches a happy, satisfying conclusion
- The character should look happy, relieved, joyful, and content
- Show the character celebrating, smiling, or enjoying the positive outcome
- Include Voice over with Thai dialogue: Voice over: "[Thai text expressing happiness, lesson learned, or positive message]"
- Transition to a happy, uplifting mood
- Keep the same format, structure, and length as the previous prompt
- Output ONLY the new prompt, nothing else
- End with "All dialogues must be in Thai language only."`;
      } else if (isPixar3D) {
        systemPrompt = `You are a 3D animated cartoon style video scene continuation expert.

Rules:
- Keep the EXACT SAME 3D animated cartoon style as the previous scene
- Keep the EXACT SAME character design from the previous scene — do NOT change the character appearance
- This is a CONTINUATION scene: The story progresses, the conflict develops or escalates
- Show a different angle, new challenge, or story development
- Include Voice over with Thai dialogue: Voice over: "[Thai text matching the story emotion]"
- Keep the same format, structure, and length as the previous prompt
- Output ONLY the new prompt, nothing else
- End with "All dialogues must be in Thai language only."`;
      } else {
        systemPrompt = `You are a video scene continuation expert. Create a NEW prompt for the NEXT scene that continues naturally from the previous one.

Rules:
- Keep the EXACT SAME format, structure, and character design as the input prompt
- The new scene must be a natural continuation of the story
- Do NOT repeat the same scene. Create something new but connected
- Keep the same language, tone, and style
- Include Voice over with Thai dialogue: Voice over: "[Thai text]"
- Output ONLY the new prompt, nothing else`;
      }

      const userMessage = `Here is the previous scene prompt. Create the next scene:\n\n${previousPrompt}`;

      let nextScenePrompt;
      if (settings.model === 'gemini') {
        nextScenePrompt = await GeminiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
      } else {
        nextScenePrompt = await OpenaiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
      }

      PromptGenerator.setPrompt(nextScenePrompt);
      Helpers.showToast('สร้าง prompt ฉากถัดไปสำเร็จ', 'success');
    } catch (error) {
      console.error('Generate next scene error:', error);
      Helpers.showToast(`เกิดข้อผิดพลาด: ${error.message}`, 'error');
    }
  },

  // ===================== Generate Story =====================

  /**
   * Handle "สร้างเรื่อง" button — AI เขียนเรื่องเล่าเต็มๆ จากหัวข้อ
   */
  async handleGenerateStory() {
    if (this.isGenerating) return;

    const storyTopic = document.getElementById('storyTopic')?.value?.trim() || '';
    if (!storyTopic) {
      Helpers.showToast('กรุณากรอกหัวข้อเรื่องก่อน', 'error');
      return;
    }

    const settings = await this.getSettings();
    if (!settings.apiKey) {
      this.showApiNotSetModal();
      return;
    }

    const sceneCount = Settings.getSceneCount() || 3;

    // ดู template ที่เลือก เพื่อกำหนดสไตล์ + ประเภทตัวละคร
    const currentTemplate = SystemPrompt.currentTemplate;
    const templateId = currentTemplate?.id || '';
    const templateName = currentTemplate?.name || '';
    const isPixar3D = templateId.startsWith('pixar-3d-');
    const styleText = isPixar3D ? '3D animated cartoon น่ารัก สีสดใส' : 'cinematic สมจริง';

    // ตรวจสอบว่าเป็นแบบหลายตัวละคร (ตัวละครต่างกันทุกฉาก ให้ความรู้) หรือตัวละครเดียว (เรื่องเล่า)
    const isMultiCharacter = isPixar3D && !templateId.includes('person');
    let characterType = '';
    let characterInstruction;

    if (templateId.includes('animal')) {
      characterType = 'สัตว์';
      characterInstruction = '- ตัวละครต้องเป็นสัตว์ที่เกี่ยวข้องกับหัวข้อเรื่อง (ห้ามเป็นคน)';
    } else if (templateId.includes('fruit')) {
      characterType = 'ผัก/ผลไม้';
      characterInstruction = '- ตัวละครต้องเป็นผัก/ผลไม้ที่เกี่ยวข้องกับหัวข้อเรื่อง (ห้ามเป็นคน)';
    } else if (templateId.includes('object')) {
      characterType = 'สิ่งของ';
      characterInstruction = '- ตัวละครต้องเป็นสิ่งของ/วัตถุที่เกี่ยวข้องกับหัวข้อเรื่อง (ห้ามเป็นคน)';
    } else if (templateId.includes('review')) {
      characterType = 'อวัยวะร่างกาย';
      characterInstruction = '- ตัวละครต้องเป็นอวัยวะร่างกายที่เกี่ยวข้องกับหัวข้อเรื่อง (ห้ามเป็นคน)';
    } else {
      const reviewerGender = await ImageUpload.getReviewerGender();
      const genderText = reviewerGender === 'female' ? 'ผู้หญิง' : 'ผู้ชาย';
      characterInstruction = `- ตัวละครหลักเป็น${genderText}`;
    }

    this.isGenerating = true;
    const btn = document.getElementById('generateStoryBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ กำลังสร้าง...';
    }
    Helpers.showToast('กำลังสร้างเรื่อง...', 'info');

    try {
      const totalSeconds = sceneCount * 8;
      let systemPrompt, userMessage;

      if (isMultiCharacter) {
        // แบบให้ความรู้: ตัวละครต่างกันทุกฉาก เนื้อหาต่อเนื่อง
        systemPrompt = `คุณเป็นผู้เชี่ยวชาญด้านสุขภาพและความรู้ทั่วไป เขียนเนื้อหาให้ความรู้สำหรับวิดีโอสั้น (TikTok/Reels)

สไตล์วิดีโอ: ${styleText}

กฎ:
- เขียนเป็นภาษาไทย
- วิดีโอทั้งหมด ${sceneCount} ฉาก ฉากละ 8 วินาที (รวม ${totalSeconds} วินาที)
- แต่ละฉากมีตัวละคร${characterType}ที่เกี่ยวข้องกับหัวข้อโดยตรง ออกมาพูดจากมุมมองของตัวเอง
- ตัวละครต้องเลือกจากสิ่งที่เกี่ยวข้องกับหัวข้อจริงๆ (เช่น หัวข้อเบาหวาน → มะระช่วยลดน้ำตาล, น้ำตาลเป็นตัวร้าย)
- เนื้อหาต้องต่อเนื่องกัน: ฉากหลังต้องเชื่อมต่อจากฉากก่อน ไม่ใช่ต่างคนต่างพูด
- ห้ามขึ้นต้นด้วย "สวัสดีครับ/ค่ะ" ทุกฉาก — ให้ตัวละครพูดเข้าเรื่องเลย
- เขียนแยกเป็นฉาก (ฉาก 1: ..., ฉาก 2: ...)
- แต่ละฉาก 2-3 ประโยคเท่านั้น
- เขียนความรู้ที่ถูกต้อง เป็นประโยชน์
- เขียนเนื้อหาเท่านั้น ไม่ต้องอธิบายเพิ่ม`;

        userMessage = `เขียนเนื้อหาให้ความรู้จากหัวข้อ: "${storyTopic}"

จำนวน ${sceneCount} ฉาก แต่ละฉากมีตัวละคร${characterType}ที่เกี่ยวข้องกับหัวข้อโดยตรง พูดจากมุมมองของตัวเอง เนื้อหาต่อเนื่องกัน`;
      } else {
        // แบบเรื่องเล่า: ตัวละครเดียว เล่าเรื่องต่อเนื่อง (voice-over สำหรับ TTS)
        const sentenceCount = sceneCount * 2;
        systemPrompt = `คุณเป็นนักเขียนบทเสียงบรรยาย (voice-over) มืออาชีพ เชี่ยวชาญเขียนเรื่องสำหรับวิดีโอสั้น (TikTok/Reels)

สไตล์วิดีโอ: ${styleText}
สไตล์ template: ${templateName || 'ทั่วไป'}

ข้อจำกัดความยาว (สำคัญมาก):
- วิดีโอทั้งหมด ${sceneCount} ฉาก รวม ${totalSeconds} วินาที
- เขียนเรื่องสั้นกระชับ ประมาณ ${sentenceCount}-${sentenceCount + sceneCount} ประโยคเท่านั้น (ฉากละ ~2 ประโยค)
- ห้ามเขียนยาวเกินไป ย่อหน้าเดียวจบ

กฎ:
- เขียนเรื่องเป็นภาษาไทย
${characterInstruction}
- เขียนเรื่องให้ตรงตามหัวข้อ — ถ้าหัวข้อบอกชื่อตัวละคร/สัตว์/สิ่งของ ให้ใช้ตัวละครตามนั้นเลย ห้ามตีความเป็นอุปมาหรือเปลี่ยนเป็นคน
- เรื่องต้องมีโครงสร้างชัดเจน: เปิดเรื่อง → ปัญหา/ความขัดแย้ง → คลี่คลาย
- เขียนเป็นเรื่องเล่าต่อเนื่อง (ไม่ต้องแบ่งฉาก ไม่ต้องใส่หมายเลขฉาก)
- เขียนเป็นบทเสียงบรรยาย (voice-over) ที่เหมาะสำหรับอ่านออกเสียง/TTS
- ใส่รายละเอียดที่เห็นภาพได้ แต่ต้องเหมาะกับการฟัง
- ห้ามใช้สัญลักษณ์ emoji ตัวย่อ หรือรูปแบบที่อ่านออกเสียงไม่ได้
- น้ำเสียงเป็นธรรมชาติ เหมือนคนเล่าเรื่อง
- เขียนให้เหมาะกับสไตล์ ${styleText}
- เขียนเรื่องเท่านั้น ไม่ต้องอธิบายเพิ่ม`;

        userMessage = `เขียนบทเสียงบรรยายสั้นกระชับจากหัวข้อ: "${storyTopic}"

จำกัด ${sentenceCount}-${sentenceCount + sceneCount} ประโยค (สำหรับวิดีโอ ${sceneCount} ฉาก ฉากละ 8 วินาที) เขียนย่อหน้าเดียวจบ เหมาะสำหรับอ่านออกเสียง`;
      }

      let rawResponse;
      if (settings.model === 'gemini') {
        rawResponse = await GeminiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
      } else {
        rawResponse = await OpenaiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
      }

      // แสดงเรื่องใน textarea
      const detailsGroup = document.getElementById('storyDetailsGroup');
      const detailsTextarea = document.getElementById('storyDetails');
      if (detailsGroup) detailsGroup.hidden = false;
      if (detailsTextarea) detailsTextarea.value = rawResponse.trim();

      Helpers.showToast('สร้างเรื่องสำเร็จ — แก้ไขได้ก่อนกดสร้าง Prompt', 'success');

    } catch (error) {
      console.error('Generate story error:', error);
      Helpers.showToast(`เกิดข้อผิดพลาด: ${error.message}`, 'error');
    } finally {
      this.isGenerating = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '✨ สร้างเรื่อง';
      }
    }
  },

  // ===================== Generate All Scenes =====================

  /**
   * Step 0: AI วางโครงเรื่อง (plot) — แบ่งฉากจากเรื่องเล่า
   * @param {string} storyTopic - หัวข้อเรื่อง
   * @param {string} productName - ชื่อตัวละคร (ถ้ามี)
   * @param {number} sceneCount - จำนวนฉาก
   * @param {string} [storyDetails] - เรื่องเต็มจาก textarea (optional)
   * @returns {string} โครงเรื่องสำหรับส่งต่อให้ทุก AI call
   */
  async _generateStoryPlot(storyTopic, productName, sceneCount, storyDetails) {
    const settings = await this.getSettings();
    if (!settings.apiKey) throw new Error('ไม่พบ API Key');

    const currentTemplate = SystemPrompt.currentTemplate;
    const templateId = currentTemplate?.id || '';
    const isPixar3D = templateId.startsWith('pixar-3d-');
    const hasCharacterName = !!productName;
    const reviewerGender = await ImageUpload.getReviewerGender();
    const genderTextEn = reviewerGender === 'female' ? 'Thai woman' : 'Thai man';

    // กำหนดประเภทตัวละครตาม template
    const isMultiCharacter = isPixar3D && !templateId.includes('person');
    let characterTypeInstruction = '';

    if (isMultiCharacter) {
      // แต่ละฉากมีตัวละครต่างกัน ให้ความรู้
      if (templateId.includes('review')) {
        characterTypeInstruction = '- Each scene features a DIFFERENT BODY ORGAN character (e.g., Scene 1: Liver, Scene 2: Pancreas, Scene 3: Heart). Each organ teaches health knowledge related to the topic.';
      } else if (templateId.includes('fruit')) {
        characterTypeInstruction = '- Each scene features a DIFFERENT FRUIT or VEGETABLE character (e.g., Scene 1: Carrot, Scene 2: Bitter Melon, Scene 3: Orange). Each gives health knowledge related to the topic.';
      } else if (templateId.includes('animal')) {
        characterTypeInstruction = '- Each scene features a DIFFERENT ANIMAL character (e.g., Scene 1: Rabbit, Scene 2: Bear, Scene 3: Turtle). Each teaches a lesson related to the topic.';
      } else if (templateId.includes('object')) {
        characterTypeInstruction = '- Each scene features a DIFFERENT OBJECT/THING character (e.g., Scene 1: Toothbrush, Scene 2: Tooth, Scene 3: Sugar Cube). Each gives knowledge related to the topic.';
      }
    } else {
      // ตัวละครเดียวตลอดเรื่อง
      if (templateId.includes('person')) {
        characterTypeInstruction = `- The main character is a cute 3D cartoon ${genderTextEn}`;
      } else {
        characterTypeInstruction = `- The main character is a ${genderTextEn}`;
      }
    }

    // ถ้ามี storyDetails → ใช้เนื้อหาเต็มเป็นฐานในการแบ่งฉาก
    if (storyDetails) {
      let systemPrompt, userMessage;

      if (isMultiCharacter) {
        // Multi-character: ตัวละครต่างกันทุกฉาก เกี่ยวข้องกับหัวข้อ เนื้อหาต่อเนื่อง
        systemPrompt = `You are an educational content architect for short-form video content (like TikTok/Reels).

You will receive EDUCATIONAL CONTENT written in Thai. Your job: Break it down into exactly ${sceneCount} scenes, each featuring a DIFFERENT character that is DIRECTLY RELATED to the topic.

Rules:
- Write in English
${characterTypeInstruction}
- Each character MUST be directly related to the topic (e.g., for diabetes: bitter melon helps reduce blood sugar, sugar is the villain)
- Each scene MUST have a UNIQUE character that is COMPLETELY DIFFERENT from other scenes
- Content must FLOW CONTINUOUSLY: Scene 1 introduces the topic/problem, subsequent scenes continue the discussion, final scene concludes with advice
- Characters speak from their own perspective about their connection to the topic
- Do NOT have characters greet the audience — they should speak directly about the topic
- Each scene: 1-2 sentences describing the visual + what knowledge the character shares
- Style: 3D animated cartoon, cute character with big expressive eyes, small arms and legs

Output format:
Scene 1:
CHARACTER: [Detailed description of character 1: species/type, appearance, color, shape, facial features, outfit/accessories]
KNOWLEDGE: [What this character teaches — speaking from its own perspective about its connection to the topic]

Scene 2:
CHARACTER: [Detailed description of character 2 — must be DIFFERENT and also related to the topic]
KNOWLEDGE: [Continues from previous scene — builds on the discussion, NOT a separate introduction]
...
Scene ${sceneCount}:
CHARACTER: [...]
KNOWLEDGE: [Final conclusion or warning — wraps up the topic]

Output ONLY the scene list with characters, nothing else.`;

        userMessage = `Break this educational content into ${sceneCount} scenes, each with a DIFFERENT character directly related to the topic:\n\n${storyDetails}`;
      } else {
        // Single character: เรื่องเล่าต่อเนื่อง ตัวละครเดียว
        systemPrompt = `You are a story plot architect for short-form video content (like TikTok/Reels).

You will receive a FULL STORY written in Thai. Your job: Break it down into exactly ${sceneCount} scenes for video production.

Rules:
- Write scene descriptions in English
${characterTypeInstruction}
- Each scene description should be 1-2 sentences describing: what happens, the character's emotion, and the key visual
- Follow the story faithfully — do NOT change the plot, just break it into scenes
- The story must flow naturally across all ${sceneCount} scenes`;

        if (isPixar3D) {
          systemPrompt += `\n- Style: 3D animated cartoon`;
        }

        if (hasCharacterName) {
          systemPrompt += `\n- The main character's name is "${productName}"`;
        }

        systemPrompt += `\n
IMPORTANT — You must include a CHARACTER section at the top with a detailed, consistent character description in English.

Output format:
CHARACTER: [Detailed character description: species/type, appearance, color, size, facial features, outfit/accessories. This description must remain EXACTLY the same across ALL scenes.]

Scene 1: [description]
Scene 2: [description]
...
Scene ${sceneCount}: [description]

Output ONLY the character description + scene list, nothing else.`;

        userMessage = `Break this story into ${sceneCount} scenes:\n\n${storyDetails}`;
        if (hasCharacterName) {
          userMessage += `\n\nMain character name: "${productName}"`;
        }
      }

      let plotResponse;
      if (settings.model === 'gemini') {
        plotResponse = await GeminiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
      } else {
        plotResponse = await OpenaiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
      }

      return plotResponse.trim();
    }

    // Fallback: ไม่มี storyDetails → สร้าง outline จาก topic ตรงๆ
    let systemPrompt, userMessage;

    if (isMultiCharacter) {
      // Multi-character: ตัวละครต่างกันทุกฉาก เกี่ยวข้องกับหัวข้อ เนื้อหาต่อเนื่อง
      systemPrompt = `You are an educational content architect for short-form video content (like TikTok/Reels).

Your job: Create a ${sceneCount}-scene educational video outline where EACH scene features a DIFFERENT character that is DIRECTLY RELATED to the topic.

Rules:
- Write in English
${characterTypeInstruction}
- Each character MUST be directly related to the topic (e.g., for diabetes: bitter melon helps reduce blood sugar, sugar is the villain)
- Each scene MUST have a UNIQUE character that is COMPLETELY DIFFERENT from other scenes
- Content must FLOW CONTINUOUSLY: Scene 1 introduces the topic/problem, subsequent scenes continue the discussion, final scene concludes with advice
- Characters speak from their own perspective about their connection to the topic
- Do NOT have characters greet the audience — they should speak directly about the topic
- Style: 3D animated cartoon, cute character with big expressive eyes, small arms and legs
- Scene descriptions should be clear and visual

Output format:
Scene 1:
CHARACTER: [Detailed description of character 1: species/type, appearance, color, shape, facial features, outfit/accessories]
KNOWLEDGE: [What this character teaches — speaking from its own perspective about its connection to the topic]

Scene 2:
CHARACTER: [Detailed description of character 2 — must be DIFFERENT and also related to the topic]
KNOWLEDGE: [Continues from previous scene — builds on the discussion, NOT a separate introduction]
...
Scene ${sceneCount}:
CHARACTER: [...]
KNOWLEDGE: [Final conclusion or warning — wraps up the topic]

Output ONLY the scene list with characters, nothing else.`;

      const topic = storyTopic || productName;
      userMessage = `Create a ${sceneCount}-scene educational outline.\nTopic: "${topic}"\n\nEach scene must feature a DIFFERENT character that is directly related to this topic. Content must flow continuously across scenes.`;
    } else {
      // Single character: เรื่องเล่าต่อเนื่อง ตัวละครเดียว
      systemPrompt = `You are a story plot architect for short-form video content (like TikTok/Reels).

Your job: Create a concise scene-by-scene story outline for a ${sceneCount}-scene video.

Rules:
- Write in English
${characterTypeInstruction}
- Each scene description should be 1-2 sentences describing: what happens, the character's emotion, and the key visual
- The story must have a clear arc: intro → conflict/climax → resolution`;

      if (isPixar3D) {
        systemPrompt += `\n- Style: 3D animated cartoon, cute character with big expressive eyes
- Scene 1: Introduce the character and their situation/problem
- Middle scenes: The story develops, conflict escalates
- Final scene: Resolution — the story reaches a satisfying conclusion (happy ending)`;
      } else {
        systemPrompt += `\n- Scene 1: Establish the setting, introduce the character and situation
- Final scene: Satisfying conclusion, character achieves their goal or finds resolution`;
      }

      if (hasCharacterName) {
        systemPrompt += `\n- The main character's name is "${productName}"`;
      }

      systemPrompt += `\n
IMPORTANT — You must include a CHARACTER section at the top with a detailed, consistent character description in English.

Output format:
CHARACTER: [Detailed character description: species/type, appearance, color, size, facial features, outfit/accessories. This description must remain EXACTLY the same across ALL scenes.]

Scene 1: [description]
Scene 2: [description]
...
Scene ${sceneCount}: [description]

Output ONLY the character description + scene list, nothing else.`;

      const topic = storyTopic || productName;
      userMessage = `Create a ${sceneCount}-scene story outline.\nTopic: "${topic}"`;
      if (hasCharacterName) {
        userMessage += `\nMain character: "${productName}"`;
      }
    }

    let plotResponse;
    if (settings.model === 'gemini') {
      plotResponse = await GeminiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
    } else {
      plotResponse = await OpenaiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
    }

    return plotResponse.trim();
  },

  /**
   * Internal: Generate image prompt (returns string, no UI side-effects)
   * @param {string} [storyPlot] - โครงเรื่องจาก _generateStoryPlot (optional)
   */
  async _generateImagePromptInternal(storyPlot, sceneNumber = 1) {
    const storyTopic = document.getElementById('storyTopic')?.value?.trim() || '';
    const productName = await ImageUpload.getProductName();

    if (!storyTopic && !productName) throw new Error('ไม่พบหัวข้อเรื่อง');

    const settings = await this.getSettings();
    if (!settings.apiKey) throw new Error('ไม่พบ API Key');

    const template = PromptTemplateSelector.getSelected();
    const templateStyle = (template.systemPrompt || '').includes('3D animated cartoon') ? '3D animated cartoon' : 'cinematic';

    // ใช้ template system prompt เป็นฐาน + เสริมด้วย story context
    let systemPrompt = template.systemPrompt || `You are an expert at creating image prompts for ${templateStyle} style storytelling videos.

Rules:
- English only
- Style: ${templateStyle} style, vibrant colors, cinematic soft lighting
- 9:16 vertical portrait format
- Describe the scene, character, emotion, and action clearly

Output ONLY the prompt, no explanations.`;

    let userMessage = `หัวข้อเรื่อง: "${storyTopic || productName}"`;
    if (productName) {
      userMessage += `\nตัวละคร: "${productName}"`;
    }
    userMessage += `\nสร้าง prompt ภาพฉาก ${sceneNumber} ของเรื่องนี้`;

    // ถ้ามี plot → บอก AI ว่านี่คือฉากที่เท่าไหร่ของเรื่อง + ใช้ character description
    if (storyPlot) {
      const templateId = template?.id || '';
      const isPixar3D = templateId.startsWith('pixar-3d-');
      const isMultiCharacter = isPixar3D && !templateId.includes('person');

      if (isMultiCharacter) {
        userMessage += `\n\n=== Educational Content Plot ===\n${storyPlot}\n\nCreate the image prompt for Scene ${sceneNumber}. Use the CHARACTER description from Scene ${sceneNumber} above — this scene has its OWN UNIQUE character that is DIFFERENT from other scenes.`;
      } else {
        userMessage += `\n\n=== Story Plot (with character description) ===\n${storyPlot}\n\nCreate the image prompt for Scene ${sceneNumber} following the story plot above. Use the EXACT CHARACTER description from the CHARACTER section.`;
      }
    }

    let rawResponse;
    if (settings.model === 'gemini') {
      rawResponse = await GeminiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
    } else {
      rawResponse = await OpenaiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
    }

    const parsed = ResponseParser.parse(rawResponse, false);
    return parsed.prompt;
  },

  /**
   * Internal: Generate video prompt (returns string, no UI side-effects)
   * @param {string} [storyPlot] - โครงเรื่องจาก _generateStoryPlot (optional)
   */
  async _generateVideoPromptInternal(storyPlot) {
    const storyTopic = document.getElementById('storyTopic')?.value?.trim() || '';
    const productName = await ImageUpload.getProductName();

    if (!storyTopic && !productName) throw new Error('ไม่พบหัวข้อเรื่อง หรือ ชื่อตัวละคร');

    const settings = await this.getSettings();
    if (!settings.apiKey) throw new Error('ไม่พบ API Key');

    const videoTemplate = VideoPromptTemplateSelector.getSelected();

    // ใช้ template system prompt เป็นฐาน
    let systemPrompt = videoTemplate.systemPrompt;

    let userMessage = `สร้าง prompt video สำหรับเรื่อง: "${storyTopic || productName}"`;
    if (productName) {
      userMessage += `\nตัวละคร: "${productName}"`;
    }
    userMessage += `\nฉาก 1 ของเรื่อง`;

    // ถ้ามี plot → บอก AI ว่านี่คือฉาก 1 + ใช้ character description
    if (storyPlot) {
      const currentTemplate = SystemPrompt.currentTemplate;
      const templateId = currentTemplate?.id || '';
      const isPixar3D = templateId.startsWith('pixar-3d-');
      const isMultiCharacter = isPixar3D && !templateId.includes('person');

      if (isMultiCharacter) {
        userMessage += `\n\n=== Educational Content Plot ===\n${storyPlot}\n\nThis is Scene 1. Use the CHARACTER description from Scene 1 above — this scene has its OWN UNIQUE character. The Voice over should be this character speaking from its own perspective about the topic — do NOT start with a greeting like "สวัสดี". Include Voice over with Thai dialogue.`;
      } else {
        userMessage += `\n\n=== Story Plot (with character description) ===\n${storyPlot}\n\nThis is Scene 1. Create the video prompt following the story plot above. Use the EXACT CHARACTER description from the CHARACTER section. Include Voice over with Thai dialogue.`;
      }
    }

    userMessage += `\n\nตอบเป็น prompt เดียวเท่านั้น`;

    let rawResponse;
    if (settings.model === 'gemini') {
      rawResponse = await GeminiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
    } else {
      rawResponse = await OpenaiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
    }

    // เพิ่ม Thai-only dialogue enforcement
    rawResponse = rawResponse.trim() + ' All dialogues must be in Thai language only.';

    return rawResponse;
  },

  /**
   * Internal: Generate next scene prompt (returns string, no UI side-effects)
   * @param {string} previousPrompt - prompt ฉากก่อนหน้า
   * @param {boolean} isFinalScene - เป็นฉากสุดท้ายหรือไม่
   * @param {string} [storyPlot] - โครงเรื่อง (optional)
   * @param {number} [sceneNumber] - หมายเลขฉาก (optional, 1-based)
   */
  async _generateNextSceneInternal(previousPrompt, isFinalScene, storyPlot, sceneNumber) {
    const settings = await this.getSettings();
    if (!settings.apiKey) throw new Error('ไม่พบ API Key');

    const currentTemplate = SystemPrompt.currentTemplate;
    const isPixar3D = currentTemplate?.id?.startsWith('pixar-3d-');
    const isMultiCharacter = isPixar3D && !currentTemplate?.id?.includes('person');

    // สร้าง plot context สำหรับแนบท้าย user message
    let plotContext = '';
    if (storyPlot && sceneNumber) {
      if (isMultiCharacter) {
        plotContext = `\n\n=== Educational Content Plot ===\n${storyPlot}\n\nYou are creating Scene ${sceneNumber}. This scene features a COMPLETELY NEW and DIFFERENT character from all previous scenes. Use the CHARACTER description from Scene ${sceneNumber} above.`;
      } else {
        plotContext = `\n\n=== Story Plot (with character description) ===\n${storyPlot}\n\nYou are creating Scene ${sceneNumber}. Follow the story plot above. Use the EXACT CHARACTER description from the CHARACTER section.`;
      }
    }

    let systemPrompt;
    if (isMultiCharacter && isFinalScene) {
      // Multi-character ฉากสุดท้าย: ตัวละครใหม่ ให้ความรู้ปิดท้าย
      systemPrompt = `You are a 3D animated cartoon style educational video prompt expert.

Rules:
- Keep the EXACT SAME 3D animated cartoon style as the previous scene
- This scene features a COMPLETELY NEW, DIFFERENT character from all previous scenes — DO NOT reuse any previous character
- Create a new character design based on the story plot for this scene
- THIS IS THE FINAL SCENE: The character gives a final piece of knowledge, summary, or warning
- The Voice over should be this NEW character speaking from its own perspective about the topic — continue naturally from the previous scene, do NOT start with a greeting
- Include Voice over with Thai dialogue: Voice over: "[Thai text where the character speaks about the topic from its perspective]"
- End with a positive, encouraging health message
- Keep the same format, structure, and length as the previous prompt
- Output ONLY the new prompt, nothing else
- End with "All dialogues must be in Thai language only."`;
    } else if (isMultiCharacter) {
      // Multi-character ฉากต่อไป: ตัวละครใหม่ ให้ความรู้
      systemPrompt = `You are a 3D animated cartoon style educational video prompt expert.

Rules:
- Keep the EXACT SAME 3D animated cartoon style as the previous scene
- This scene features a COMPLETELY NEW, DIFFERENT character from all previous scenes — DO NOT reuse any previous character
- Create a new character design based on the story plot for this scene
- The Voice over should be this NEW character speaking from its own perspective about the topic — continue naturally from the previous scene, do NOT start with a greeting
- Include Voice over with Thai dialogue: Voice over: "[Thai text where the character speaks about the topic from its perspective]"
- Keep the same format, structure, and length as the previous prompt
- Output ONLY the new prompt, nothing else
- End with "All dialogues must be in Thai language only."`;
    } else if (isPixar3D && isFinalScene) {
      // Single character ฉากสุดท้าย → เรื่องจบสมบูรณ์ happy ending
      systemPrompt = `You are a 3D animated cartoon style video scene continuation expert.

Rules:
- Keep the EXACT SAME 3D animated cartoon style as the previous scene
- Keep the EXACT SAME character design from the previous scene — do NOT change the character appearance
- THIS IS THE FINAL SCENE: The story reaches a happy, satisfying conclusion
- The character should look happy, relieved, joyful, and content
- Show the character celebrating, smiling, or enjoying the positive outcome
- Include Voice over with Thai dialogue: Voice over: "[Thai text expressing happiness, lesson learned, or positive message]"
- Transition to a happy, uplifting mood
- Keep the same format, structure, and length as the previous prompt
- Output ONLY the new prompt, nothing else
- End with "All dialogues must be in Thai language only."`;
    } else if (isPixar3D) {
      // Single character ฉากต่อเนื่อง: เรื่องดำเนินต่อ
      systemPrompt = `You are a 3D animated cartoon style video scene continuation expert.

Rules:
- Keep the EXACT SAME 3D animated cartoon style as the previous scene
- Keep the EXACT SAME character design from the previous scene — do NOT change the character appearance
- This is a CONTINUATION scene: The story progresses, the conflict develops or escalates
- Show a different angle, new challenge, or story development
- Include Voice over with Thai dialogue: Voice over: "[Thai text matching the story emotion]"
- Keep the same format, structure, and length as the previous prompt
- Output ONLY the new prompt, nothing else
- End with "All dialogues must be in Thai language only."`;
    } else {
      // Generic next scene
      systemPrompt = `You are a video scene continuation expert. Create a NEW prompt for the NEXT scene that continues naturally from the previous one.

Rules:
- Keep the EXACT SAME format, structure, and character design as the input prompt
- The new scene must be a natural continuation of the story
- Do NOT repeat the same scene. Create something new but connected
- Keep the same language, tone, and style
- Include Voice over with Thai dialogue: Voice over: "[Thai text]"
- Output ONLY the new prompt, nothing else`;
    }

    const userMessage = `Here is the previous scene prompt. Create the next scene:\n\n${previousPrompt}${plotContext}`;

    let nextScenePrompt;
    if (settings.model === 'gemini') {
      nextScenePrompt = await GeminiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
    } else {
      nextScenePrompt = await OpenaiApi.generateVideoPrompt(settings.apiKey, systemPrompt, userMessage);
    }

    return nextScenePrompt;
  },

  /**
   * Handle "สร้าง Prompt ทุกฉาก" button
   */
  async handleGenerateAllScenes() {
    if (this.isGenerating) return;

    const storyTopic = document.getElementById('storyTopic')?.value?.trim() || '';
    const productName = await ImageUpload.getProductName();

    if (!storyTopic && !productName) {
      Helpers.showToast('กรุณากรอกหัวข้อเรื่อง', 'error');
      return;
    }

    const settings = await this.getSettings();
    if (!settings.apiKey) {
      this.showApiNotSetModal();
      return;
    }

    const sceneCount = Settings.getSceneCount() || 2;
    this.isGenerating = true;
    const btn = document.getElementById('generateAllScenesBtn');
    if (btn) btn.disabled = true;

    try {
      // Initialize scene list with pending cards
      PromptGenerator.initSceneList(sceneCount);
      PromptGenerator.outputSection.scrollIntoView({ behavior: 'smooth' });

      // ===== Step 0: วางโครงเรื่อง (Plot) =====
      const storyDetails = document.getElementById('storyDetails')?.value?.trim() || '';
      Helpers.showToast(storyDetails
        ? `กำลังแบ่งเรื่องเป็น ${sceneCount} ฉาก...`
        : `กำลังวางโครงเรื่อง ${sceneCount} ฉาก...`, 'info');
      const storyPlot = await this._generateStoryPlot(storyTopic, productName, sceneCount, storyDetails);
      console.log('[Plot]', storyPlot);
      PromptGenerator.setStoryPlot(storyPlot);

      // ===== ฉาก 1: Image Prompt =====
      PromptGenerator.updateSceneStatus(0, 'generating');
      Helpers.showToast(`กำลังสร้าง prompt ฉาก 1/${sceneCount} (ภาพ)...`, 'info');

      const imagePrompt = await this._generateImagePromptInternal(storyPlot);
      PromptGenerator.setSceneImagePrompt(0, imagePrompt);

      // ===== ฉาก 1: Video Prompt =====
      Helpers.showToast(`กำลังสร้าง prompt ฉาก 1/${sceneCount} (วิดีโอ)...`, 'info');

      const videoPrompt1 = await this._generateVideoPromptInternal(storyPlot);
      PromptGenerator.setSceneVideoPrompt(0, videoPrompt1);
      PromptGenerator.updateSceneStatus(0, 'ready');

      // ===== ฉาก 2+ : Image Prompt + Video Prompt (ตามโครงเรื่อง) =====
      let previousPrompt = videoPrompt1;
      for (let i = 1; i < sceneCount; i++) {
        PromptGenerator.updateSceneStatus(i, 'generating');
        const isFinal = (i === sceneCount - 1);
        Helpers.showToast(`กำลังสร้าง prompt ฉาก ${i + 1}/${sceneCount} (ภาพ)${isFinal ? ' (ฉากสุดท้าย)' : ''}...`, 'info');

        // สร้าง image prompt ฉากนี้
        const sceneImagePrompt = await this._generateImagePromptInternal(storyPlot, i + 1);
        PromptGenerator.setSceneImagePrompt(i, sceneImagePrompt);

        // สร้าง video prompt ฉากนี้
        Helpers.showToast(`กำลังสร้าง prompt ฉาก ${i + 1}/${sceneCount} (วิดีโอ)${isFinal ? ' (ฉากสุดท้าย)' : ''}...`, 'info');
        const nextPrompt = await this._generateNextSceneInternal(previousPrompt, isFinal, storyPlot, i + 1);
        PromptGenerator.setSceneVideoPrompt(i, nextPrompt);
        PromptGenerator.updateSceneStatus(i, 'ready');
        previousPrompt = nextPrompt;
      }

      Helpers.showToast(`สร้าง prompt ทุกฉากสำเร็จ! (${sceneCount} ฉาก)`, 'success');

    } catch (error) {
      console.error('Generate all scenes error:', error);
      Helpers.showToast(`เกิดข้อผิดพลาด: ${error.message}`, 'error');
    } finally {
      this.isGenerating = false;
      if (btn) btn.disabled = false;
    }
  },

});

/**
 * Video Prompt Template Selector Module
 * Uses createTemplateSelectorBase for shared logic, adds video-specific behavior
 */

const VideoPromptTemplateSelector = Object.assign(
  createTemplateSelectorBase({
    storageKey: 'flowVideoPromptTemplates',
    defaultTemplateId: 'video-ugc-global',
    selectElementId: 'videoStyleSelect',
    manageBtnId: 'manageVideoTemplatesBtn',
    editBtnId: 'editVideoTemplateBtn',
    modalId: 'videoTemplateModal',
    closeModalBtnId: 'closeVideoTemplateModal',
    cancelBtnId: 'cancelVideoTemplateBtn',
    saveBtnId: 'saveVideoTemplateBtn',
    loadDefaultBtnId: 'loadDefaultVideoTemplateBtn',
    nameInputId: 'videoTemplateName',
    descInputId: null,
    promptInputId: 'videoTemplatePrompt',
    customIdPrefix: 'video-custom-',
    builtInTemplates: () => VIDEO_BUILT_IN_TEMPLATES,
    warehouseType: 'video',
    templateOrder: [
      'video-ugc-global', 'video-anime-2d', 'video-digital-illustration', 'video-watercolor', 'video-cinematic-dark',
      'video-pixar-3d-person', 'video-pixar-3d-review', 'video-pixar-3d-fruit', 'video-pixar-3d-animal', 'video-pixar-3d-object', 'video-pixar-3d-car'
    ],
    templateGroups: [
      { label: 'Prompt Style', ids: ['video-ugc-global', 'video-anime-2d', 'video-digital-illustration', 'video-watercolor', 'video-cinematic-dark'] },
      { label: '3D การ์ตูน', ids: ['video-pixar-3d-person', 'video-pixar-3d-animal', 'video-pixar-3d-fruit', 'video-pixar-3d-object', 'video-pixar-3d-review'] }
    ],
    defaultTemplateName: 'video-ugc-global'
  }),
  {
    // Migrate old video-default to video-ugc
    migrateStoredId(savedId) {
      if (savedId === 'video-default' || savedId === 'video-ugc') return 'video-ugc-global';
      return savedId;
    },

    buildUserMessage(productName, genderText, genderTextEn) {
      const template = this.getSelected();
      let message = template.userMessageTemplate;

      message = message.replace(/\{\{productName\}\}/g, productName || 'ไม่ระบุชื่อ');
      message = message.replace(/\{\{genderText\}\}/g, genderText);
      message = message.replace(/\{\{genderTextEn\}\}/g, genderTextEn);

      return message;
    },

    // Video modal has no description field
    openModal(editTemplate = null) {
      const modal = document.getElementById('videoTemplateModal');
      if (!modal) return;

      const nameInput = document.getElementById('videoTemplateName');
      const promptInput = document.getElementById('videoTemplatePrompt');
      const title = modal.querySelector('.modal-header h3');

      if (editTemplate) {
        if (title) title.textContent = 'แก้ไข Video Template';
        nameInput.value = editTemplate.name;
        promptInput.value = editTemplate.systemPrompt;
        modal.dataset.editId = editTemplate.id;
      } else {
        if (title) title.textContent = 'สร้าง Video Template';
        nameInput.value = '';
        promptInput.value = '';
        delete modal.dataset.editId;
      }

      modal.style.display = 'flex';
    },

    // Video save has no settings
    async saveCustomTemplate() {
      const modal = document.getElementById('videoTemplateModal');
      const nameInput = document.getElementById('videoTemplateName');
      const promptInput = document.getElementById('videoTemplatePrompt');

      const name = nameInput.value.trim();
      const systemPrompt = promptInput.value.trim();

      if (!name || !systemPrompt) {
        alert('กรุณากรอกชื่อและ System Prompt');
        return;
      }

      const editId = modal.dataset.editId;
      const id = editId || 'video-custom-' + Date.now();

      const template = {
        id,
        name,
        description: 'Custom video template',
        isBuiltIn: false,
        isDefault: false,
        systemPrompt,
        userMessageTemplate: `สร้าง prompt สำหรับ image-to-video: "{{productName}}"

ต้องการ:
- คนรีวิวเป็น {{genderText}} ({{genderTextEn}})`
      };

      this.customTemplates[id] = template;
      await this.saveToStorage();
      this.render();
      this.closeModal();

      await this.select(id);
    },

    // Keep backward-compatible alias
    async saveTemplate() {
      return this.saveCustomTemplate();
    },

    async deleteTemplate(templateId) {
      return this.deleteCustomTemplate(templateId);
    }
  }
);

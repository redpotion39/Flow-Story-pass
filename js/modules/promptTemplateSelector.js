/**
 * Prompt Template Selector Module (Image)
 * Uses createTemplateSelectorBase for shared logic, adds image-specific behavior
 */

const PromptTemplateSelector = Object.assign(
  createTemplateSelectorBase({
    storageKey: 'flowPromptTemplates',
    defaultTemplateId: 'ugc-review-global',
    selectElementId: 'imageStyleSelect',
    manageBtnId: 'manageTemplatesBtn',
    editBtnId: 'editImageTemplateBtn',
    modalId: 'templateManagerModal',
    closeModalBtnId: 'closeTemplateModal',
    cancelBtnId: 'cancelTemplateBtn',
    saveBtnId: 'saveTemplateBtn',
    loadDefaultBtnId: 'loadDefaultTemplateBtn',
    nameInputId: 'customTemplateName',
    descInputId: 'customTemplateDesc',
    promptInputId: 'customTemplatePrompt',
    customIdPrefix: 'custom-',
    builtInTemplates: () => BUILT_IN_TEMPLATES,
    warehouseType: 'image',
    templateOrder: [
      'ugc-review-global', 'anime-2d', 'digital-illustration', 'watercolor', 'cinematic-dark',
      'pixar-3d-person', 'pixar-3d-review', 'pixar-3d-fruit', 'pixar-3d-animal', 'pixar-3d-object', 'pixar-3d-car'
    ],
    templateGroups: [
      { label: 'Prompt Style', ids: ['ugc-review-global', 'anime-2d', 'digital-illustration', 'watercolor', 'cinematic-dark'] },
      { label: '3D การ์ตูน', ids: ['pixar-3d-person', 'pixar-3d-animal', 'pixar-3d-fruit', 'pixar-3d-object', 'pixar-3d-review'] }
    ],
    defaultTemplateName: 'ugc-review-global'
  }),
  {
    // Mapping image template ID → video template ID
    IMAGE_TO_VIDEO_MAP: {
      'ugc-review-global': 'video-ugc-global',
      'anime-2d': 'video-anime-2d',
      'digital-illustration': 'video-digital-illustration',
      'watercolor': 'video-watercolor',
      'cinematic-dark': 'video-cinematic-dark',
      'pixar-3d-review': 'video-pixar-3d-review',
      'pixar-3d-person': 'video-pixar-3d-person',
      'pixar-3d-fruit': 'video-pixar-3d-fruit',
      'pixar-3d-animal': 'video-pixar-3d-animal',
      'pixar-3d-object': 'video-pixar-3d-object',
      'pixar-3d-car': 'video-pixar-3d-car'
    },

    // Override select to add updateSystemPrompt + syncVideoTemplate + toggle final scene checkbox
    async select(templateId) {
      this.selectedTemplateId = templateId;
      await this.saveToStorage();
      this.updateSystemPrompt();
      this.syncVideoTemplate(templateId);
      this.toggleFinalSceneCheckbox(templateId);
    },

    toggleFinalSceneCheckbox(templateId) {
      const wrapper = document.getElementById('finalSceneCheckboxWrapper');
      if (!wrapper) return;
      wrapper.style.display = templateId.startsWith('pixar-3d-') ? 'flex' : 'none';
      // Reset checkbox when switching templates
      const checkbox = document.getElementById('finalSceneCheckbox');
      if (checkbox) checkbox.checked = false;
    },

    syncVideoTemplate(imageTemplateId) {
      if (typeof VideoPromptTemplateSelector === 'undefined') return;

      const videoId = this.IMAGE_TO_VIDEO_MAP[imageTemplateId];
      if (!videoId) return;

      const videoTemplate = VideoPromptTemplateSelector.getTemplateById(videoId);
      if (!videoTemplate) return;

      VideoPromptTemplateSelector.selectedTemplateId = videoId;
      VideoPromptTemplateSelector.saveToStorage();
      VideoPromptTemplateSelector.render();

      const videoSelect = document.getElementById('videoStyleSelect');
      if (videoSelect) videoSelect.value = videoId;
    },

    updateSystemPrompt() {
      const template = this.getSelected();
      if (typeof SystemPrompt !== 'undefined' && SystemPrompt.setTemplate) {
        SystemPrompt.setTemplate(template);
      }
    },

    // Lifecycle hooks
    onInit() {
      this.updateSystemPrompt();
    },

    onReload() {
      this.updateSystemPrompt();
    },

    // Image modal has description field
    openModal(editTemplate = null) {
      const modal = document.getElementById('templateManagerModal');
      if (!modal) return;

      const form = modal.querySelector('.template-form');
      if (form) form.reset();

      const nameInput = document.getElementById('customTemplateName');
      const descInput = document.getElementById('customTemplateDesc');
      const promptInput = document.getElementById('customTemplatePrompt');
      const title = modal.querySelector('.modal-header h3');

      if (editTemplate) {
        if (title) title.textContent = 'แก้ไข Template ภาพ';
        nameInput.value = editTemplate.name;
        descInput.value = editTemplate.description;
        promptInput.value = editTemplate.systemPrompt;
        modal.dataset.editId = editTemplate.id;
      } else {
        if (title) title.textContent = 'สร้าง Template ภาพ';
        nameInput.value = '';
        descInput.value = '';
        promptInput.value = '';
        delete modal.dataset.editId;
      }

      modal.style.display = 'flex';
    },

    // Image save has settings object
    async saveCustomTemplate() {
      const modal = document.getElementById('templateManagerModal');
      const nameInput = document.getElementById('customTemplateName');
      const descInput = document.getElementById('customTemplateDesc');
      const promptInput = document.getElementById('customTemplatePrompt');

      const name = nameInput.value.trim();
      const description = descInput.value.trim();
      const systemPrompt = promptInput.value.trim();

      if (!name || !systemPrompt) {
        alert('กรุณากรอกชื่อและ System Prompt');
        return;
      }

      const editId = modal.dataset.editId;
      const id = editId || 'custom-' + Date.now();

      const template = {
        id,
        name,
        description: description || 'Custom template',
        icon: 'package',
        isBuiltIn: false,
        isDefault: false,
        systemPrompt,
        userMessageTemplate: `สินค้า: {{productName}}
{{personDescription}}
สร้าง prompt สำหรับภาพสินค้านี้`,
        settings: {
          ethnicityRequired: null,
          defaultGender: 'female',
          allowPersonImage: true,
          temperature: 0.7
        }
      };

      this.customTemplates[id] = template;
      await this.saveToStorage();
      this.render();
      this.closeModal();

      await this.select(id);
    }
  }
);

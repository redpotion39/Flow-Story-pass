/**
 * Template Selector Base - Factory for shared template selector logic
 * Used by PromptTemplateSelector (image) and VideoPromptTemplateSelector (video)
 *
 * Config keys:
 *   storageKey, defaultTemplateId, selectElementId, manageBtnId, editBtnId,
 *   modalId, closeModalBtnId, cancelBtnId, saveBtnId, loadDefaultBtnId,
 *   nameInputId, descInputId, promptInputId, customIdPrefix,
 *   builtInTemplates, warehouseType, templateOrder, defaultTemplateName
 *
 * Lifecycle hooks (override in subtype):
 *   onInit(), onReload(), migrateStoredId(savedId) → savedId
 */

function createTemplateSelectorBase(config) {
  return {
    STORAGE_KEY: config.storageKey,
    selectedTemplateId: config.defaultTemplateId,
    customTemplates: {},
    warehouseTemplates: [],

    async init() {
      await this.loadFromStorage();
      await this.loadFromWarehouse();
      this.render();
      this.bindEvents();
      if (this.onInit) this.onInit();
    },

    async reload() {
      await this.loadFromWarehouse();
      this.render();
      if (this.onReload) this.onReload();
    },

    async loadFromStorage() {
      try {
        const result = await Storage.get(this.STORAGE_KEY);
        const data = result[this.STORAGE_KEY];
        if (data) {
          let savedId = data.selectedTemplateId || config.defaultTemplateId;
          if (this.migrateStoredId) {
            savedId = this.migrateStoredId(savedId);
          }
          this.selectedTemplateId = savedId;
          this.customTemplates = data.custom || {};
        }
      } catch (error) {
        console.error('Error loading templates:', error);
      }
    },

    async loadFromWarehouse() {
      try {
        if (typeof PromptStorage !== 'undefined') {
          await PromptStorage.init();
          this.warehouseTemplates = await PromptStorage.getByTypeExcludeAIStory(config.warehouseType);
        }
      } catch (error) {
        console.error('Error loading from warehouse:', error);
        this.warehouseTemplates = [];
      }
    },

    async saveToStorage() {
      try {
        await Storage.set({
          [this.STORAGE_KEY]: {
            selectedTemplateId: this.selectedTemplateId,
            custom: this.customTemplates
          }
        });
      } catch (error) {
        console.error('Error saving templates:', error);
      }
    },

    getAllTemplates() {
      const warehouseObj = {};
      this.warehouseTemplates.forEach(t => {
        warehouseObj[t.id] = t;
      });
      return {
        ...config.builtInTemplates(),
        ...warehouseObj,
        ...this.customTemplates
      };
    },

    getTemplateById(templateId) {
      const warehouseTemplate = this.warehouseTemplates.find(t => t.id === templateId);
      if (warehouseTemplate) return warehouseTemplate;

      const builtIn = config.builtInTemplates();
      if (builtIn[templateId]) return builtIn[templateId];

      if (this.customTemplates[templateId]) return this.customTemplates[templateId];

      return null;
    },

    getSelected() {
      const all = this.getAllTemplates();
      const builtIn = config.builtInTemplates();
      let template = this.getTemplateById(this.selectedTemplateId) || builtIn[config.defaultTemplateId];

      if (template && template.isRandom && template.randomFrom && template.randomFrom.length > 0) {
        const randomId = template.randomFrom[Math.floor(Math.random() * template.randomFrom.length)];
        const randomTemplate = this.getTemplateById(randomId) || all[randomId];
        if (randomTemplate) {
          return randomTemplate;
        }
      }

      return template;
    },

    async select(templateId) {
      this.selectedTemplateId = templateId;
      await this.saveToStorage();
    },

    render() {
      const select = document.getElementById(config.selectElementId);
      if (!select) return;

      let html = '';
      const allTemplates = this.getAllTemplates();

      if (config.templateGroups) {
        // Render with optgroup labels — lookup from all sources (warehouse > builtIn)
        const groupedIds = new Set();
        config.templateGroups.forEach(group => {
          html += `<optgroup label="${group.label}">`;
          group.ids.forEach(id => {
            const template = allTemplates[id];
            if (template) {
              groupedIds.add(id);
              const selected = this.selectedTemplateId === template.id ? 'selected' : '';
              const icon = template.isRandom ? '🎲 ' : '';
              html += `<option value="${template.id}" ${selected}>${icon}${template.name}</option>`;
            }
          });
          html += '</optgroup>';
        });
        // Render any warehouse templates not in groups
        const ungrouped = this.warehouseTemplates.filter(t => !groupedIds.has(t.id));
        if (ungrouped.length > 0) {
          ungrouped.forEach(template => {
            const selected = this.selectedTemplateId === template.id ? 'selected' : '';
            const icon = template.isRandom ? '🎲 ' : '';
            html += `<option value="${template.id}" ${selected}>${icon}${template.name}</option>`;
          });
        }
      } else if (this.warehouseTemplates.length > 0) {
        this.warehouseTemplates.forEach(template => {
          const selected = this.selectedTemplateId === template.id ? 'selected' : '';
          const icon = template.isRandom ? '🎲 ' : '';
          html += `<option value="${template.id}" ${selected}>${icon}${template.name}</option>`;
        });
      } else {
        config.templateOrder.forEach(id => {
          const builtIn = config.builtInTemplates();
          const template = builtIn[id];
          if (template) {
            const selected = this.selectedTemplateId === template.id ? 'selected' : '';
            const icon = template.isRandom ? '🎲 ' : '';
            html += `<option value="${template.id}" ${selected}>${icon}${template.name}</option>`;
          }
        });
      }

      const customList = Object.values(this.customTemplates);
      if (customList.length > 0) {
        html += '<optgroup label="Custom">';
        customList.forEach(template => {
          const selected = this.selectedTemplateId === template.id ? 'selected' : '';
          html += `<option value="${template.id}" ${selected}>${template.name}</option>`;
        });
        html += '</optgroup>';
      }

      select.innerHTML = html;
    },

    bindEvents() {
      const select = document.getElementById(config.selectElementId);
      if (select) {
        select.addEventListener('change', async (e) => {
          await this.select(e.target.value);
          this.updateEditButtonVisibility();
        });
      }

      const manageBtn = document.getElementById(config.manageBtnId);
      if (manageBtn) {
        manageBtn.addEventListener('click', () => this.openModal());
      }

      const editBtn = document.getElementById(config.editBtnId);
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          const template = this.customTemplates[this.selectedTemplateId];
          if (template) {
            this.openModal(template);
          }
        });
      }

      this.updateEditButtonVisibility();
      this.bindModalEvents();
    },

    updateEditButtonVisibility() {
      const editBtn = document.getElementById(config.editBtnId);
      if (!editBtn) return;

      const isCustom = this.selectedTemplateId.startsWith(config.customIdPrefix);
      editBtn.style.display = isCustom ? 'flex' : 'none';
    },

    bindModalEvents() {
      const modal = document.getElementById(config.modalId);
      if (!modal) return;

      const closeBtn = modal.querySelector('#' + config.closeModalBtnId);
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeModal());
      }

      const cancelBtn = modal.querySelector('#' + config.cancelBtnId);
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.closeModal());
      }

      const saveBtn = modal.querySelector('#' + config.saveBtnId);
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveCustomTemplate());
      }

      const loadDefaultBtn = document.getElementById(config.loadDefaultBtnId);
      if (loadDefaultBtn) {
        loadDefaultBtn.addEventListener('click', () => this.loadDefaultTemplate());
      }

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal();
        }
      });
    },

    closeModal() {
      const modal = document.getElementById(config.modalId);
      if (modal) {
        modal.style.display = 'none';
      }
    },

    loadDefaultTemplate() {
      const builtIn = config.builtInTemplates();
      const defaultTemplate = builtIn[config.defaultTemplateId];
      if (!defaultTemplate) return;

      const nameInput = document.getElementById(config.nameInputId);
      const promptInput = document.getElementById(config.promptInputId);

      if (nameInput) nameInput.value = defaultTemplate.name + ' (Copy)';
      if (promptInput) promptInput.value = defaultTemplate.systemPrompt;

      const descInput = config.descInputId ? document.getElementById(config.descInputId) : null;
      if (descInput) descInput.value = defaultTemplate.description;

      showToast('โหลดตัวอย่างเรียบร้อย', 'success');
    },

    async deleteCustomTemplate(templateId) {
      if (!confirm('ต้องการลบ Template นี้หรือไม่?')) {
        return;
      }

      delete this.customTemplates[templateId];

      if (this.selectedTemplateId === templateId) {
        this.selectedTemplateId = config.defaultTemplateId;
      }

      await this.saveToStorage();
      this.render();
    }
  };
}

/**
 * Prompt Warehouse - Main JavaScript
 * จัดการหน้าคลัง Prompt
 */

// State
let currentFilter = 'image'; // Default to image tab
let currentPrompts = [];
let editingPromptId = null;

// DOM Elements
const elements = {
  // Stats
  totalPrompts: document.getElementById('totalPrompts'),
  imagePrompts: document.getElementById('imagePrompts'),
  videoPrompts: document.getElementById('videoPrompts'),
  storyPrompts: document.getElementById('storyPrompts'),

  // Filter & Search
  filterTabs: document.getElementById('filterTabs'),
  searchInput: document.getElementById('searchInput'),

  // Grid
  promptGrid: document.getElementById('promptGrid'),
  emptyState: document.getElementById('emptyState'),

  // Header Buttons
  importDefaultsBtn: document.getElementById('importDefaultsBtn'),
  importCustomBtn: document.getElementById('importCustomBtn'),
  variableGuideBtn: document.getElementById('variableGuideBtn'),
  addPromptBtn: document.getElementById('addPromptBtn'),

  // Prompt Modal
  promptModal: document.getElementById('promptModal'),
  promptModalTitle: document.getElementById('promptModalTitle'),
  closePromptModal: document.getElementById('closePromptModal'),
  promptName: document.getElementById('promptName'),
  promptCategory: document.getElementById('promptCategory'),
  promptDescription: document.getElementById('promptDescription'),
  thumbnailUpload: document.getElementById('thumbnailUpload'),
  thumbnailInput: document.getElementById('thumbnailInput'),
  thumbnailBox: document.getElementById('thumbnailBox'),
  thumbnailPlaceholder: document.getElementById('thumbnailPlaceholder'),
  thumbnailImage: document.getElementById('thumbnailImage'),
  systemPrompt: document.getElementById('systemPrompt'),
  userMessageTemplate: document.getElementById('userMessageTemplate'),
  deletePromptBtn: document.getElementById('deletePromptBtn'),
  cancelPromptBtn: document.getElementById('cancelPromptBtn'),
  savePromptBtn: document.getElementById('savePromptBtn'),
  loadDefaultBtn: document.getElementById('loadDefaultBtn'),

  // Guide Modal
  guideModal: document.getElementById('guideModal'),
  closeGuideModal: document.getElementById('closeGuideModal'),
  closeGuideBtn: document.getElementById('closeGuideBtn'),
  systemPromptHelp: document.getElementById('systemPromptHelp'),
  userMessageHelp: document.getElementById('userMessageHelp'),

  // Delete Modal
  deleteModal: document.getElementById('deleteModal'),
  closeDeleteModal: document.getElementById('closeDeleteModal'),
  deleteMessage: document.getElementById('deleteMessage'),
  cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

  // Category Modal
  categoryModal: document.getElementById('categoryModal'),
  closeCategoryModal: document.getElementById('closeCategoryModal'),
  closeCategoryDoneBtn: document.getElementById('closeCategoryDoneBtn'),
  manageCategoriesBtn: document.getElementById('manageCategoriesBtn'),
  newCategoryInput: document.getElementById('newCategoryInput'),
  addCategoryBtn: document.getElementById('addCategoryBtn'),
  categoryList: document.getElementById('categoryList'),

  // Toast
  toastContainer: document.getElementById('toastContainer')
};

// ==================== Initialize ====================

async function init() {
  await PromptStorage.init();

  // ==================== Migrations (declarative) ====================
  const MIGRATIONS = [
    { key: 'promptThumbnailsFixedV2', run: () => PromptStorage.resetBuiltInPrompts() },
    { key: 'aiStoryThumbnailsFixedV3', run: () => PromptStorage.reimportAIStoryDefaults() },
    { key: 'aiStorySystemPromptsV4', run: () => PromptStorage.forceUpdateAIStoryTemplates() },
    { key: 'aiStoryImageOnlyV5', run: () => PromptStorage.forceUpdateAIStoryTemplates() },
    { key: 'aiStoryMusicMVV6', run: () => PromptStorage.forceUpdateAIStoryTemplates() },
    { key: 'aiStoryMusicNoCopyV7', run: () => PromptStorage.forceUpdateAIStoryTemplates() },
    { key: 'aiStoryMusicPurePromptV8', run: () => PromptStorage.forceUpdateAIStoryTemplates() },
    { key: 'aiStoryVideoPurePromptV9', run: () => PromptStorage.forceUpdateAIStoryTemplates() },
    {
      key: 'aiStoryCuteAnimalsV10',
      run: async () => {
        const oldIds = ['story-video-funny', 'story-video-drama', 'story-video-romantic', 'story-video-horror', 'story-video-action'];
        for (const id of oldIds) { try { await PromptStorage.delete(id); } catch (e) { /* ignore */ } }
        return PromptStorage.forceUpdateAIStoryTemplates();
      }
    },
    {
      key: 'aiStoryCuteAnimalsImageV11',
      run: async () => {
        const oldIds = ['story-funny-clip', 'story-drama', 'story-romantic', 'story-horror', 'story-action'];
        for (const id of oldIds) { try { await PromptStorage.delete(id); } catch (e) { /* ignore */ } }
        return PromptStorage.forceUpdateAIStoryTemplates();
      }
    },
    { key: 'videoTemplatesV13b', run: () => PromptStorage.forceUpdateVideoTemplates() },
    { key: 'imageTemplatesV13b', run: () => PromptStorage.forceUpdateImageTemplates() },
    { key: 'pixar3dTemplateV14', run: async () => { await PromptStorage.forceUpdateImageTemplates(); await PromptStorage.forceUpdateVideoTemplates(); } },
    { key: 'pixar3dOrganV15', run: async () => { await PromptStorage.forceUpdateImageTemplates(); await PromptStorage.forceUpdateVideoTemplates(); } },
    { key: 'pixar3dAllTypesV16', run: async () => { await PromptStorage.forceUpdateImageTemplates(); await PromptStorage.forceUpdateVideoTemplates(); } },
    { key: 'pixar3dNoDisneyV17', run: async () => { await PromptStorage.forceUpdateImageTemplates(); await PromptStorage.forceUpdateVideoTemplates(); } },
    { key: 'pixar3dNoTrademarkV18', run: async () => { await PromptStorage.forceUpdateImageTemplates(); await PromptStorage.forceUpdateVideoTemplates(); } },
    { key: 'videoNoModifyProductV19', run: async () => { await PromptStorage.forceUpdateVideoTemplates(); } },
    { key: 'videoGlobalGenderV20', run: async () => { await PromptStorage.forceUpdateVideoTemplates(); } },
    { key: 'cleanupTemplatesV21', run: async () => {
      const keepIds = new Set([
        'ugc-review-global',
        'pixar-3d-review', 'pixar-3d-person', 'pixar-3d-fruit',
        'pixar-3d-animal', 'pixar-3d-object', 'pixar-3d-car',
        'video-ugc-global',
        'video-pixar-3d-review', 'video-pixar-3d-person', 'video-pixar-3d-fruit',
        'video-pixar-3d-animal', 'video-pixar-3d-object', 'video-pixar-3d-car'
      ]);
      const all = await PromptStorage.getAll();
      for (const t of all) {
        if (t.isBuiltIn && !keepIds.has(t.id)) {
          await PromptStorage.delete(t.id);
        }
      }
      await PromptStorage.forceUpdateImageTemplates();
      await PromptStorage.forceUpdateVideoTemplates();
    }},
    { key: 'storyHealthVoiceOverV22', run: async () => { await PromptStorage.forceUpdateImageTemplates(); await PromptStorage.forceUpdateVideoTemplates(); } }
  ];

  // Batch-fetch all migration keys at once (faster than 13 individual gets)
  const allKeys = MIGRATIONS.map(m => m.key);
  const migrationState = await chrome.storage.local.get(allKeys);

  for (const migration of MIGRATIONS) {
    if (!migrationState[migration.key]) {
      console.log(`Running migration: ${migration.key}...`);
      await migration.run();
      await chrome.storage.local.set({ [migration.key]: true });
      console.log(`Migration ${migration.key} complete`);
    }
  }

  // Auto-import defaults if warehouse is empty
  const allPrompts = await PromptStorage.getAll();
  if (allPrompts.length === 0) {
    console.log('Warehouse empty, auto-importing defaults...');
    // Import regular templates (need BUILT_IN_TEMPLATES from promptTemplates.js)
    if (typeof BUILT_IN_TEMPLATES !== 'undefined' && typeof VIDEO_BUILT_IN_TEMPLATES !== 'undefined') {
      await PromptStorage.importDefaults(BUILT_IN_TEMPLATES, VIDEO_BUILT_IN_TEMPLATES);
    }
    // Import AI Story templates
    await PromptStorage.importAIStoryDefaults();
    console.log('Auto-import complete');
  }

  await loadCategories();
  await loadPrompts();
  setupEventListeners();
}

// ==================== Load Data ====================

async function loadPrompts() {
  try {
    if (currentFilter === 'all') {
      currentPrompts = await PromptStorage.getAll();
    } else if (currentFilter === 'story') {
      // Filter by AI Story category
      currentPrompts = await PromptStorage.getByCategory('ai-story');
    } else {
      // Filter by type BUT exclude AI Story category
      const byType = await PromptStorage.getByType(currentFilter);
      currentPrompts = byType.filter(p => p.categoryId !== 'ai-story');
    }

    // Apply search filter
    const searchTerm = elements.searchInput.value.trim().toLowerCase();
    if (searchTerm) {
      currentPrompts = currentPrompts.filter(p =>
        p.name.toLowerCase().includes(searchTerm) ||
        (p.description && p.description.toLowerCase().includes(searchTerm))
      );
    }

    renderPrompts();
    updateStats();
  } catch (error) {
    console.error('Error loading prompts:', error);
    showToast('เกิดข้อผิดพลาดในการโหลด Prompt', 'error');
  }
}

async function loadCategories() {
  try {
    const categories = await PromptStorage.getCategories();
    elements.promptCategory.innerHTML = '<option value="">ไม่ระบุ</option>';
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      elements.promptCategory.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// ==================== Render ====================

function renderPrompts() {
  if (currentPrompts.length === 0) {
    elements.promptGrid.innerHTML = '';
    elements.promptGrid.appendChild(elements.emptyState);
    elements.emptyState.hidden = false;
    return;
  }

  elements.emptyState.hidden = true;
  elements.promptGrid.innerHTML = currentPrompts.map(prompt => createPromptCard(prompt)).join('');

  // Add click handlers
  elements.promptGrid.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      const promptId = card.dataset.id;
      openEditModal(promptId);
    });
  });
}

function createPromptCard(prompt) {
  const thumbnailHtml = prompt.thumbnail
    ? `<img src="${prompt.thumbnail}" alt="${prompt.name}">`
    : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
       </svg>`;

  const typeIcon = prompt.type === 'video'
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
       </svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
       </svg>`;

  return `
    <div class="prompt-card" data-id="${prompt.id}">
      <div class="prompt-card-thumbnail">
        ${thumbnailHtml}
      </div>
      <div class="prompt-card-content">
        <div class="prompt-card-name">${escapeHtml(prompt.name)}</div>
        <div class="prompt-card-meta">
          <span class="prompt-card-type ${prompt.type}">
            ${typeIcon}
            ${prompt.type === 'video' ? 'วิดีโอ' : 'ภาพ'}
          </span>
          ${prompt.isBuiltIn ? '<span class="prompt-card-builtin">Default</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

async function updateStats() {
  const all = await PromptStorage.getAll();
  // นับ image/video ที่ไม่ใช่ AI Story
  const imageCount = all.filter(p => p.type === 'image' && p.categoryId !== 'ai-story').length;
  const videoCount = all.filter(p => p.type === 'video' && p.categoryId !== 'ai-story').length;
  const storyCount = all.filter(p => p.categoryId === 'ai-story').length;

  elements.totalPrompts.textContent = all.length;
  elements.imagePrompts.textContent = imageCount;
  elements.videoPrompts.textContent = videoCount;
  elements.storyPrompts.textContent = storyCount;
}

// ==================== Event Listeners ====================

function setupEventListeners() {
  // Filter tabs
  elements.filterTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (tab) {
      elements.filterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.type;
      loadPrompts();
    }
  });

  // Search
  let searchTimeout;
  elements.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadPrompts(), 300);
  });

  // Header buttons
  elements.importDefaultsBtn.addEventListener('click', importDefaults);
  elements.importCustomBtn.addEventListener('click', importCustomTemplates);
  elements.variableGuideBtn.addEventListener('click', () => openModal('guideModal'));
  elements.addPromptBtn.addEventListener('click', openAddModal);

  // Prompt Modal
  elements.closePromptModal.addEventListener('click', () => closeModal('promptModal'));
  elements.cancelPromptBtn.addEventListener('click', () => closeModal('promptModal'));
  elements.savePromptBtn.addEventListener('click', savePrompt);
  elements.deletePromptBtn.addEventListener('click', () => openDeleteConfirm());
  elements.loadDefaultBtn.addEventListener('click', loadDefaultPrompt);

  // Thumbnail upload - คลิกที่ box ทั้งอันเพื่อเปลี่ยนรูป
  elements.thumbnailBox.addEventListener('click', () => elements.thumbnailInput.click());
  elements.thumbnailInput.addEventListener('change', handleThumbnailUpload);

  // Guide Modal
  elements.closeGuideModal.addEventListener('click', () => closeModal('guideModal'));
  elements.closeGuideBtn.addEventListener('click', () => closeModal('guideModal'));
  elements.systemPromptHelp.addEventListener('click', () => openModal('guideModal'));
  elements.userMessageHelp.addEventListener('click', () => openModal('guideModal'));

  // Delete Modal
  elements.closeDeleteModal.addEventListener('click', () => closeModal('deleteModal'));
  elements.cancelDeleteBtn.addEventListener('click', () => closeModal('deleteModal'));
  elements.confirmDeleteBtn.addEventListener('click', confirmDelete);

  // Category Modal
  elements.manageCategoriesBtn.addEventListener('click', openCategoryModal);
  elements.closeCategoryModal.addEventListener('click', closeCategoryModal);
  elements.closeCategoryDoneBtn.addEventListener('click', closeCategoryModal);
  elements.addCategoryBtn.addEventListener('click', addCategory);
  elements.newCategoryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addCategory();
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.hidden = true;
      }
    });
  });

  // Prompt type radio change
  document.querySelectorAll('input[name="promptType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      // Could add type-specific logic here
    });
  });
}

// ==================== Modal Handlers ====================

function openModal(modalId) {
  document.getElementById(modalId).hidden = false;
}

function closeModal(modalId) {
  document.getElementById(modalId).hidden = true;
}

function openAddModal() {
  editingPromptId = null;
  elements.promptModalTitle.textContent = 'เพิ่ม Prompt';
  elements.deletePromptBtn.hidden = true;

  // Reset form
  elements.promptName.value = '';
  elements.promptDescription.value = '';
  elements.promptCategory.value = '';
  document.querySelector('input[name="promptType"][value="image"]').checked = true;
  elements.systemPrompt.value = '';
  elements.userMessageTemplate.value = '';
  resetThumbnail();

  openModal('promptModal');
}

async function openEditModal(promptId) {
  const prompt = await PromptStorage.get(promptId);
  if (!prompt) return;

  editingPromptId = promptId;
  elements.promptModalTitle.textContent = 'แก้ไข Prompt';
  elements.deletePromptBtn.hidden = false;

  // Fill form
  elements.promptName.value = prompt.name || '';
  elements.promptDescription.value = prompt.description || '';
  elements.promptCategory.value = prompt.categoryId || '';
  document.querySelector(`input[name="promptType"][value="${prompt.type}"]`).checked = true;
  elements.systemPrompt.value = prompt.systemPrompt || '';
  elements.userMessageTemplate.value = prompt.userMessageTemplate || '';

  // Thumbnail - ใช้ class visible แทน hidden
  if (prompt.thumbnail) {
    elements.thumbnailImage.src = prompt.thumbnail;
    elements.thumbnailImage.classList.add('visible');
    elements.thumbnailPlaceholder.style.display = 'none';
  } else {
    resetThumbnail();
  }

  openModal('promptModal');
}

function resetThumbnail() {
  elements.thumbnailImage.src = '';
  elements.thumbnailImage.classList.remove('visible');
  elements.thumbnailPlaceholder.style.display = '';
  elements.thumbnailInput.value = '';
}

// โหลด Default Prompt (UGC ปก) ลงใน form
function loadDefaultPrompt() {
  const defaultTemplate = BUILT_IN_TEMPLATES['ugc-review-global'];
  if (!defaultTemplate) {
    showToast('ไม่พบ Default Template', 'error');
    return;
  }

  // ใส่ค่าลงใน form
  elements.systemPrompt.value = defaultTemplate.systemPrompt || '';
  elements.userMessageTemplate.value = defaultTemplate.userMessageTemplate || '';

  showToast('โหลด Default Prompt สำเร็จ', 'success');
}

function handleThumbnailUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('กรุณาเลือกไฟล์รูปภาพ', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    // Resize image
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxSize = 400;
      let width = img.width;
      let height = img.height;

      if (width > height && width > maxSize) {
        height = (height * maxSize) / width;
        width = maxSize;
      } else if (height > maxSize) {
        width = (width * maxSize) / height;
        height = maxSize;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const resizedBase64 = canvas.toDataURL('image/jpeg', 0.8);
      elements.thumbnailImage.src = resizedBase64;
      elements.thumbnailImage.classList.add('visible');
      elements.thumbnailPlaceholder.style.display = 'none';
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// ==================== CRUD Operations ====================

async function savePrompt() {
  const name = elements.promptName.value.trim();
  const type = document.querySelector('input[name="promptType"]:checked').value;
  const thumbnail = elements.thumbnailImage.src || '';
  const systemPromptValue = elements.systemPrompt.value.trim();

  // Validation
  if (!name) {
    showToast('กรุณากรอกชื่อ Prompt', 'error');
    elements.promptName.focus();
    return;
  }

  if (!thumbnail) {
    showToast('กรุณาอัพโหลด Thumbnail', 'error');
    return;
  }

  if (!systemPromptValue) {
    showToast('กรุณากรอก System Prompt', 'error');
    elements.systemPrompt.focus();
    return;
  }

  const promptData = {
    id: editingPromptId || `prompt-${Date.now()}`,
    name,
    description: elements.promptDescription.value.trim(),
    type,
    categoryId: elements.promptCategory.value,
    thumbnail,
    systemPrompt: systemPromptValue,
    userMessageTemplate: elements.userMessageTemplate.value.trim(),
    isBuiltIn: false
  };

  try {
    await PromptStorage.save(promptData);
    showToast(editingPromptId ? 'อัปเดต Prompt สำเร็จ' : 'เพิ่ม Prompt สำเร็จ', 'success');
    closeModal('promptModal');
    await loadPrompts();
  } catch (error) {
    console.error('Error saving prompt:', error);
    showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
  }
}

function openDeleteConfirm() {
  elements.deleteMessage.textContent = 'คุณต้องการลบ Prompt นี้หรือไม่?';
  openModal('deleteModal');
}

async function confirmDelete() {
  if (!editingPromptId) return;

  try {
    await PromptStorage.delete(editingPromptId);
    showToast('ลบ Prompt สำเร็จ', 'success');
    closeModal('deleteModal');
    closeModal('promptModal');
    await loadPrompts();
  } catch (error) {
    console.error('Error deleting prompt:', error);
    showToast('เกิดข้อผิดพลาดในการลบ', 'error');
  }
}

// ==================== Import Defaults ====================

async function importDefaults() {
  try {
    // Check if templates are available
    if (typeof BUILT_IN_TEMPLATES === 'undefined' || typeof VIDEO_BUILT_IN_TEMPLATES === 'undefined') {
      showToast('ไม่พบ Template เริ่มต้น', 'error');
      return;
    }

    const count = await PromptStorage.importDefaults(BUILT_IN_TEMPLATES, VIDEO_BUILT_IN_TEMPLATES);

    if (count > 0) {
      showToast(`นำเข้า ${count} Template สำเร็จ`, 'success');
      await loadPrompts();
    } else {
      showToast('Template ทั้งหมดมีอยู่แล้ว', 'success');
    }
  } catch (error) {
    console.error('Error importing defaults:', error);
    showToast('เกิดข้อผิดพลาดในการนำเข้า', 'error');
  }
}

// นำเข้า Custom Templates จาก Chrome Storage (ระบบเดิม) มายังคลัง Prompt
async function importCustomTemplates() {
  try {
    const result = await PromptStorage.migrateCustomTemplates();

    if (result.migrated > 0) {
      showToast(`นำเข้า ${result.migrated} Custom Prompt สำเร็จ`, 'success');
      await loadPrompts();
    } else if (result.skipped > 0) {
      showToast('Custom Prompts ทั้งหมดมีอยู่แล้ว', 'success');
    } else {
      showToast('ไม่พบ Custom Prompts ในระบบเดิม', 'info');
    }
  } catch (error) {
    console.error('Error importing custom templates:', error);
    showToast('เกิดข้อผิดพลาดในการนำเข้า', 'error');
  }
}

// ==================== Category Management ====================

function openCategoryModal() {
  renderCategoryList();
  elements.newCategoryInput.value = '';
  elements.categoryModal.hidden = false;
}

function closeCategoryModal() {
  elements.categoryModal.hidden = true;
  // Refresh category dropdown in prompt modal
  loadCategories();
}

async function renderCategoryList() {
  const categories = await PromptStorage.getCategories();
  const prompts = await PromptStorage.getAll();

  if (categories.length === 0) {
    elements.categoryList.innerHTML = '<div class="category-empty">ยังไม่มีหมวดหมู่</div>';
    return;
  }

  // Count prompts per category
  const countMap = {};
  prompts.forEach(p => {
    if (p.categoryId) {
      countMap[p.categoryId] = (countMap[p.categoryId] || 0) + 1;
    }
  });

  let html = '';
  categories.forEach(cat => {
    const count = countMap[cat.id] || 0;
    html += `
      <div class="category-item" data-id="${cat.id}">
        <div>
          <span class="category-item-name">${escapeHtml(cat.name)}</span>
          <span class="category-item-count">(${count} prompts)</span>
        </div>
        <div class="category-item-actions">
          <button class="category-edit-btn" onclick="editCategory('${cat.id}', '${escapeHtml(cat.name)}')">แก้ไข</button>
          <button class="category-delete-btn" onclick="deleteCategory('${cat.id}')">ลบ</button>
        </div>
      </div>
    `;
  });

  elements.categoryList.innerHTML = html;
}

async function addCategory() {
  const name = elements.newCategoryInput.value.trim();
  if (!name) {
    showToast('กรุณากรอกชื่อหมวดหมู่', 'error');
    return;
  }

  try {
    await PromptStorage.addCategory(name);
    elements.newCategoryInput.value = '';
    renderCategoryList();
    showToast('เพิ่มหมวดหมู่สำเร็จ', 'success');
  } catch (error) {
    console.error('Error adding category:', error);
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

async function editCategory(categoryId, currentName) {
  const newName = prompt('แก้ไขชื่อหมวดหมู่:', currentName);
  if (newName === null) return; // Cancelled
  if (!newName.trim()) {
    showToast('ชื่อหมวดหมู่ไม่สามารถว่างได้', 'error');
    return;
  }

  try {
    const categories = await PromptStorage.getCategories();
    const updated = categories.map(c =>
      c.id === categoryId ? { ...c, name: newName.trim() } : c
    );
    await PromptStorage.saveCategories(updated);
    renderCategoryList();
    showToast('แก้ไขหมวดหมู่สำเร็จ', 'success');
  } catch (error) {
    console.error('Error editing category:', error);
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

async function deleteCategory(categoryId) {
  if (!confirm('ต้องการลบหมวดหมู่นี้หรือไม่? (Prompt ที่อยู่ในหมวดหมู่นี้จะถูกย้ายเป็น "ไม่ระบุ")')) {
    return;
  }

  try {
    // Update prompts with this category to have no category
    const prompts = await PromptStorage.getAll();
    for (const p of prompts) {
      if (p.categoryId === categoryId) {
        await PromptStorage.save({ ...p, categoryId: '' });
      }
    }

    // Delete category
    await PromptStorage.deleteCategory(categoryId);
    renderCategoryList();
    showToast('ลบหมวดหมู่สำเร็จ', 'success');
  } catch (error) {
    console.error('Error deleting category:', error);
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

// ==================== Utilities ====================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ==================== Start ====================

document.addEventListener('DOMContentLoaded', init);

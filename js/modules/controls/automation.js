/**
 * Controls Automation Module
 * Main automation orchestration, modals, overlay, and CSV export
 */

Object.assign(Controls, {

  /**
   * Get "don't show checklist" setting
   */
  getDontShowChecklist() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['dontShowAutomationChecklist'], (result) => {
        resolve(result.dontShowAutomationChecklist || false);
      });
    });
  },

  /**
   * Save "don't show checklist" setting
   */
  saveDontShowChecklist(value) {
    chrome.storage.local.set({ dontShowAutomationChecklist: value });
  },

  /**
   * Get "don't show TikTok language warning" setting
   */
  getDontShowTiktokLanguage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['dontShowTiktokLanguage'], (result) => {
        resolve(result.dontShowTiktokLanguage || false);
      });
    });
  },

  /**
   * Save "don't show TikTok language warning" setting
   */
  saveDontShowTiktokLanguage(value) {
    chrome.storage.local.set({ dontShowTiktokLanguage: value });
  },

  /**
   * Show TikTok language warning modal
   */
  showTiktokLanguageModal() {
    return new Promise((resolve) => {
      const modal = document.getElementById('tiktokLanguageModal');
      const checkbox = document.getElementById('dontShowTiktokLanguage');
      const confirmBtn = document.getElementById('confirmTiktokLanguage');
      const closeBtn = document.getElementById('closeTiktokLanguageModal');

      // Reset checkbox
      checkbox.checked = false;

      // Show modal
      modal.style.display = 'flex';

      // Confirm button handler
      const handleConfirm = () => {
        // Save preference if checked
        if (checkbox.checked) {
          this.saveDontShowTiktokLanguage(true);
        }
        modal.style.display = 'none';
        cleanup();
        resolve(true);
      };

      // Close button handler
      const handleClose = () => {
        modal.style.display = 'none';
        cleanup();
        resolve(false);
      };

      // Cleanup function
      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        closeBtn.removeEventListener('click', handleClose);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      closeBtn.addEventListener('click', handleClose);

      // Click outside to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          handleClose();
        }
      }, { once: true });
    });
  },

  /**
   * Show automation checklist modal
   */
  showChecklistModal() {
    const modal = document.getElementById('automationChecklistModal');
    const checkbox = document.getElementById('dontShowAutomationChecklist');
    const confirmBtn = document.getElementById('confirmAutomationChecklist');
    const closeBtn = document.getElementById('closeAutomationChecklistModal');

    // Reset checkbox
    checkbox.checked = false;

    // Show modal
    modal.style.display = 'flex';

    // Confirm button handler
    const handleConfirm = async () => {
      // Save preference if checked
      if (checkbox.checked) {
        this.saveDontShowChecklist(true);
      }
      modal.style.display = 'none';
      confirmBtn.removeEventListener('click', handleConfirm);
      closeBtn.removeEventListener('click', handleClose);
      // Show TikTok language warning then start automation
      await this.proceedWithTiktokLanguageCheck();
    };

    // Close button handler
    const handleClose = () => {
      modal.style.display = 'none';
      confirmBtn.removeEventListener('click', handleConfirm);
      closeBtn.removeEventListener('click', handleClose);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    closeBtn.addEventListener('click', handleClose);

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        handleClose();
      }
    }, { once: true });
  },

  /**
   * Show API not set modal
   */
  showApiNotSetModal() {
    const modal = document.getElementById('apiNotSetModal');
    const closeBtn = document.getElementById('closeApiNotSetModal');
    const closeBtn2 = document.getElementById('closeApiNotSetBtn');
    const settingsBtn = document.getElementById('openSettingsFromApiModal');

    modal.style.display = 'flex';

    const handleClose = () => {
      modal.style.display = 'none';
      closeBtn.removeEventListener('click', handleClose);
      closeBtn2.removeEventListener('click', handleClose);
      settingsBtn.removeEventListener('click', handleOpenSettings);
    };

    const handleOpenSettings = () => {
      modal.style.display = 'none';
      closeBtn.removeEventListener('click', handleClose);
      closeBtn2.removeEventListener('click', handleClose);
      settingsBtn.removeEventListener('click', handleOpenSettings);
      Settings.openModal();
    };

    closeBtn.addEventListener('click', handleClose);
    closeBtn2.addEventListener('click', handleClose);
    settingsBtn.addEventListener('click', handleOpenSettings);

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        handleClose();
      }
    }, { once: true });
  },

  /**
   * Show overlay on web page
   */
  async showWebOverlay() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const logoUrl = chrome.runtime.getURL('aiunlocked.jpg');

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (logoSrc) => {
          const existing = document.getElementById('flowx-automation-overlay');
          if (existing) existing.remove();

          const overlay = document.createElement('div');
          overlay.id = 'flowx-automation-overlay';
          overlay.innerHTML = `
            <div style="
              position: fixed;
              inset: 0;
              background: rgba(0, 0, 0, 0.4);
              z-index: 999999;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              color: white;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              pointer-events: none;
            ">
              <div style="
                background: rgba(0, 0, 0, 0.8);
                padding: 24px 32px;
                border-radius: 16px;
                display: flex;
                flex-direction: column;
                align-items: center;
                min-width: 280px;
              ">
                <img src="${logoSrc}" alt="Flow Story" style="
                  width: 64px;
                  height: 64px;
                  border-radius: 50%;
                  object-fit: cover;
                  margin-bottom: 12px;
                  animation: flowx-pulse 2s ease-in-out infinite;
                ">
                <div style="font-size: 16px; font-weight: 600;">ระบบกำลังทำงาน</div>
              </div>
            </div>
            <style>
              @keyframes flowx-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.7; transform: scale(0.95); }
              }
            </style>
          `;
          document.body.appendChild(overlay);
        },
        args: [logoUrl]
      });
    } catch (error) {
      console.error('Show overlay error:', error);
    }
  },

  /**
   * Hide overlay on web page
   */
  async hideWebOverlay() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const overlay = document.getElementById('flowx-automation-overlay');
          if (overlay) overlay.remove();
        }
      });
    } catch (error) {
      console.error('Hide overlay error:', error);
    }
  },

  /**
   * Handle Automation - รันทุกขั้นตอนอัตโนมัติ
   */
  async handleAutomation() {
    if (this.isAutomationRunning) return;

    this._pendingRunMode = false; // Reset flag — ใช้ Automation flow

    // เช็ค API ก่อน
    const hasApi = await this.checkApiConfigured();
    if (!hasApi) {
      this.showApiNotSetModal();
      return;
    }

    // เช็คว่าต้องแสดง checklist modal หรือไม่
    const dontShow = await this.getDontShowChecklist();
    if (!dontShow) {
      this.showChecklistModal();
      return;
    }

    // ถ้าไม่ต้องแสดง checklist modal ให้เช็ค TikTok language warning
    await this.proceedWithTiktokLanguageCheck();
  },

  /**
   * Handle RUN - Simplified 14-step flow (ไม่มี export, fetchAndStore, openNewFlow)
   */
  async handleRun() {
    if (this.isAutomationRunning) return;

    // เช็ค API ก่อน
    const hasApi = await this.checkApiConfigured();
    if (!hasApi) {
      this.showApiNotSetModal();
      return;
    }

    this._pendingRunMode = true; // Flag ให้ proceedWithTiktokLanguageCheck route ไป startRun

    // เช็คว่าต้องแสดง checklist modal หรือไม่
    const dontShow = await this.getDontShowChecklist();
    if (!dontShow) {
      this.showChecklistModal();
      return;
    }

    // ถ้าไม่ต้องแสดง checklist ให้เช็ค TikTok language warning
    await this.proceedWithTiktokLanguageCheck();
  },

  /**
   * Check TikTok language warning and proceed to automation or RUN
   */
  async proceedWithTiktokLanguageCheck() {
    // เช็คว่าต้องแสดง TikTok language warning หรือไม่
    const dontShowLanguage = await this.getDontShowTiktokLanguage();
    if (!dontShowLanguage) {
      const confirmed = await this.showTiktokLanguageModal();
      if (!confirmed) {
        this._pendingRunMode = false;
        return; // User closed modal without confirming
      }
    }

    // Route ไป startRun() หรือ startAutomation() ตาม flag
    if (this._pendingRunMode) {
      this._pendingRunMode = false;
      await this.startRun();
    } else {
      await this.startAutomation();
    }
  },

  /**
   * Start RUN flow — Simplified 14-step automation
   */
  async startRun() {
    // Route ไป Import ถ้าเปิดอยู่
    const isPromptImportMode = typeof PromptImport !== 'undefined' && PromptImport.isEnabled;

    if (isPromptImportMode) {
      await this.routePromptImport();
      return;
    }

    const settings = await this.getSettings();
    if (!settings.apiKey) {
      Helpers.showToast('กรุณาตั้งค่า API Key ก่อน', 'error');
      Settings.openModal();
      return;
    }

    this.totalLoops = 1;
    this.currentLoop = 0;

    this.isAutomationRunning = true;
    Helpers._suppressNonErrorToasts = true;
    document.getElementById('automationBtn').disabled = true;
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stopAutomationBtn').disabled = false;

    // ตั้งค่า product + session folder สำหรับดาวน์โหลด
    const productName = await ImageUpload.getProductName();
    const manualProductName = (productName || 'flow-story').replace(/[^a-zA-Z0-9ก-๙]/g, '_').substring(0, 50);
    this.setCurrentProduct(manualProductName, productName || 'Flow Story');
    this.initSessionFolder();

    await this.showWebOverlay();

    // เช็คว่ามี pre-generated scene list หรือไม่
    let hasPreGenerated = PromptGenerator.hasSceneList();

    // เช็คว่ามีภาพคนหรือไม่ → ถ้าไม่มีจะข้าม Upload
    const hasPersonImage = await ImageUpload.hasPersonImage();

    const sceneRunMode = document.getElementById('sceneRunMode')?.value || 'addclip';
    const sceneCount = Settings.getSceneCount() || 1;

    // ถ้ายังไม่ได้ pre-generate + มีมากกว่า 1 ฉาก → auto สร้าง Prompt ทุกฉากก่อน RUN
    if (!hasPreGenerated && sceneCount > 1) {
      Helpers._suppressNonErrorToasts = false;
      Helpers.showToast('กำลังสร้าง Prompt ทุกฉากก่อน RUN...', 'info');
      await this.handleGenerateAllScenes();
      Helpers._suppressNonErrorToasts = true;
      hasPreGenerated = PromptGenerator.hasSceneList();
    }

    if (hasPreGenerated) PromptGenerator.resetRunIndex();

    if (hasPreGenerated && sceneRunMode === 'single') {
      try {
        await this.handleSceneListSingleAutomation(hasPersonImage);
        if (this.isAutomationRunning) {
          Helpers.showToast(`RUN (แยกวิดีโอ) เสร็จสิ้น! (${PromptGenerator.scenes.length} ฉาก)`, 'success');
        }
      } catch (error) {
        console.error('RUN single error:', error);
        Helpers.showToast(`RUN error: ${error.message}`, 'error');
      } finally {
        Helpers._suppressNonErrorToasts = false;
        this.isAutomationRunning = false;
        this.currentLoop = 0;
        document.getElementById('automationBtn').disabled = false;
        document.getElementById('runBtn').disabled = false;
        document.getElementById('stopAutomationBtn').disabled = true;
        this.hideWebOverlay();
      }
      return;
    }

    try {
      for (let i = 0; i < this.totalLoops; i++) {
        if (!this.isAutomationRunning) break;

        this.currentLoop = i + 1;
        const loopPrefix = this.totalLoops > 1 ? `[${this.currentLoop}/${this.totalLoops}] ` : '';

        // randomDelay มี ±30% อยู่แล้ว — base ยิ่งใหญ่ range ยิ่งกว้าง ดูเป็นคนจริงๆ
        const steps = [
          { name: 'Image Mode', fn: () => this.handleImageMode() },
          { name: null, fn: () => randomDelay(3000) },            // ~2s-4s
          // Upload (ข้ามถ้าไม่มีภาพคน)
          ...(hasPersonImage ? [
            { name: 'Upload', fn: () => this.handleUploadProduct() },
            { name: null, fn: () => randomDelay(45000) },
          ] : []),
          { name: 'Prompt ภาพ', fn: async () => {
            if (hasPreGenerated) {
              PromptGenerator.outputTextarea.value = PromptGenerator.getImagePrompt();
              PromptGenerator.outputSection.hidden = false;
            } else {
              await this.handleGeneratePrompt();
            }
          }},
          { name: null, fn: () => randomDelay(5000) },            // ~3.5s-6.5s
          { name: 'Add Prompt', fn: () => this.handleFillPrompt() },
          { name: null, fn: () => randomDelay(2000) },            // ~1.4s-2.6s
          { name: 'Create ภาพ', fn: () => this.handleCreate() },
          { name: null, fn: () => randomDelay((Settings.getImageCreateDelay() || 90) * 1000) },
          { name: 'Video Mode', fn: () => this.handleVideoMode() },
          { name: null, fn: () => randomDelay(3000) },            // ~2s-4s
          { name: 'Select Image', fn: () => this.handleSelectImage() },
          { name: null, fn: () => randomDelay(3000) },            // ~2s-4s
          { name: 'Prompt วิดีโอ', fn: async () => {
            if (hasPreGenerated) {
              PromptGenerator.outputTextarea.value = PromptGenerator.getVideoPrompt(0);
              PromptGenerator.outputSection.hidden = false;
              PromptGenerator.updateSceneStatus(0, 'used');
            } else {
              await this.handleGenerateVideoPrompt();
            }
          }},
          { name: null, fn: () => randomDelay(5000) },            // ~3.5s-6.5s
          { name: 'Add Prompt วิดีโอ', fn: () => this.handleFillPrompt() },
          { name: null, fn: () => randomDelay(2000) },            // ~1.4s-2.6s
          { name: 'Create วิดีโอ', fn: () => this.handleCreate() },
          { name: null, fn: () => randomDelay((Settings.getDownloadDelay() || 120) * 1000) },
          { name: 'Click Video', fn: () => this.handleClickVideo() },
          { name: null, fn: () => randomDelay(3000) },            // ~2s-4s
          { name: 'Add Clip', fn: async () => {
            if (hasPreGenerated) {
              await this.handleAllScenesFromList();
            } else {
              await this.handleAllScenes();
            }
          }},
          // handleAllScenes loop ตาม sceneCount, มี downloadDelay อยู่ในตัวแล้ว
          { name: 'Download + คลัง', fn: async () => {
            await this.handleDownloadAndStore();
            await randomDelay(5000);
          }},
        ];

        const totalSteps = steps.filter(s => s.name).length;
        let stepNum = 0;
        for (const step of steps) {
          if (!this.isAutomationRunning) break;
          if (step.name) {
            stepNum++;
            Helpers.showToast(`${loopPrefix}Step ${stepNum}/${totalSteps}: ${step.name}`, 'info');
          }
          await step.fn();
        }

        // ระหว่าง loop → เปิดหน้าใหม่ + กดเริ่ม + ตั้งค่า (ไม่ทำหลัง loop สุดท้าย)
        if (i < this.totalLoops - 1 && this.isAutomationRunning) {
          Helpers.showToast(`${loopPrefix}เปิดหน้าใหม่...`, 'info');
          await this.handleOpenNewFlow();
          await randomDelay(5000);
        }
      }

      if (this.isAutomationRunning) {
        Helpers.showToast(`RUN เสร็จสิ้น! (${this.totalLoops} รอบ)`, 'success');
      }

    } catch (error) {
      console.error('RUN error:', error);
      Helpers.showToast(`RUN error: ${error.message}`, 'error');
    } finally {
      Helpers._suppressNonErrorToasts = false;
      this.isAutomationRunning = false;
      this.currentLoop = 0;
      document.getElementById('automationBtn').disabled = false;
      document.getElementById('runBtn').disabled = false;
      document.getElementById('stopAutomationBtn').disabled = true;
      this.hideWebOverlay();
    }
  },

  /**
   * Start automation after checklist confirmed
   */
  async startAutomation() {
    const isPromptImportMode = typeof PromptImport !== 'undefined' && PromptImport.isEnabled;

    if (isPromptImportMode) {
      await this.routePromptImport();
      return;
    }

    const settings = await this.getSettings();
    if (!settings.apiKey) {
      Helpers.showToast('กรุณาตั้งค่า API Key ก่อน', 'error');
      Settings.openModal();
      return;
    }

    this.totalLoops = 1;
    this.currentLoop = 0;

    this.isAutomationRunning = true;
    Helpers._suppressNonErrorToasts = true;
    this.clearDownloadedUrls(); // ล้างประวัติ URL ที่ดาวน์โหลดไปแล้ว
    this.clearCsvEntries(); // ล้าง CSV entries เก่า
    document.getElementById('automationBtn').disabled = true;
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stopAutomationBtn').disabled = false;

    // ตั้งค่า product + session folder สำหรับดาวน์โหลด
    const productName = await ImageUpload.getProductName();
    const manualProductName = (productName || 'flow-story').replace(/[^a-zA-Z0-9ก-๙]/g, '_').substring(0, 50);
    this.setCurrentProduct(manualProductName, productName || 'Flow Story');
    this.initSessionFolder();

    await this.showWebOverlay();

    try {
      for (let i = 0; i < this.totalLoops; i++) {
        if (!this.isAutomationRunning) break;

        this.currentLoop = i + 1;
        this.videoSelectFailed = false;
        const loopPrefix = `[${this.currentLoop}/${this.totalLoops}] `;

        const steps = [
          ...(i === 0 ? [
            () => this.handleSetupSettings(),     // 0: ตั้งค่า Portrait + Output 1 (เฉพาะ loop แรก)
            () => randomDelay(2000),
          ] : []),
          () => this.handleUploadProduct(),       // 1: อัพภาพคน
          () => randomDelay(20000),
          () => this.handleGeneratePrompt(),       // 2: สร้าง Prompt ภาพ
          () => randomDelay(3000),
          () => this.handleFillPrompt(),            // 3: กรอก Prompt
          () => randomDelay(1000),
          () => this.handleCreate(),                // 4: สร้างภาพ
          () => randomDelay((Settings.getImageCreateDelay() || 60) * 1000),
          () => this.handleVideoMode(),             // 5: สลับโหมดวิดีโอ
          () => randomDelay(2000),
          () => this.handleSelectImage(),           // 6: เลือกภาพ
          () => randomDelay(2000),
          () => this.handleGenerateVideoPrompt(),   // 7: สร้าง Prompt วิดีโอ
          () => randomDelay(3000),
          () => this.handleFillPrompt(),            // 8: กรอก Prompt วิดีโอ
          () => randomDelay(1000),
          () => this.handleCreate(),                // 9: สร้างวิดีโอ
          () => randomDelay((Settings.getDownloadDelay() || 90) * 1000),
          () => this.handleSelectVideo(),           // 10: เลือกวิดีโอ
          () => { if (this.videoSelectFailed) return; return randomDelay(2000); },
          ...this.buildSceneSteps().map(fn => () => { if (this.videoSelectFailed) return; return fn(); }),  // 11-12: ข้ามถ้าวิดีโอล้มเหลว
          () => { if (this.videoSelectFailed) return; return this.handleExportVideo(); },           // 13: Export Video
          async () => {                             // 14: ดาวน์โหลด + เก็บใน extension
            if (this.videoSelectFailed) return;
            if (!Settings.isSkipDownload()) {
              await this.fetchAndStore();
              await this.savePageUrlToCsv();
              await randomDelay(5000);
            } else {
              await randomDelay(1000);
            }
          },
          () => this.handleOpenNewFlow(),           // 15: เปิดหน้าใหม่ + กดปุ่ม + สลับโหมดภาพ
        ];

        for (const step of steps) {
          if (!this.isAutomationRunning) break;
          await step();
        }

        if (i < this.totalLoops - 1 && this.isAutomationRunning) {
          await randomDelay(5000);
        }
      }

      if (this.isAutomationRunning) {
        Helpers.showToast(`Automation เสร็จสิ้น! (${this.totalLoops} รอบ)`, 'success');
      }

    } catch (error) {
      console.error('Automation error:', error);
      Helpers.showToast(`Automation error: ${error.message}`, 'error');
    } finally {
      Helpers._suppressNonErrorToasts = false;
      if (this.csvEntries.length > 0) {
        await this.downloadCsvFile();
      }
      this.isAutomationRunning = false;
      this.currentLoop = 0;
      document.getElementById('automationBtn').disabled = false;
      document.getElementById('runBtn').disabled = false;
      document.getElementById('stopAutomationBtn').disabled = true;
      this.hideWebOverlay();
    }
  },

  /**
   * Route to correct prompt import mode based on dropdown
   */
  async routePromptImport() {
    const mode = document.getElementById('promptImportMode')?.value || 'addclip';
    if (mode === 'single') {
      await this.handlePromptImportSingleAutomation();
    } else {
      await this.handlePromptImportAutomation();
    }
  },

  /**
   * Handle Prompt Import — Single Mode (แยกวิดีโอ)
   * ทุก row: สร้างภาพ → สร้างวิดีโอ → Click Video → Download → เปิดหน้าใหม่
   */
  async handlePromptImportSingleAutomation() {
    if (this.isAutomationRunning) return;

    const started = await PromptImport.start();
    if (!started) return;

    this.isAutomationRunning = true;
    Helpers._suppressNonErrorToasts = true;
    this.clearDownloadedUrls();
    this.clearCsvEntries();
    this.initSessionFolder();
    document.getElementById('automationBtn').disabled = true;
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stopAutomationBtn').disabled = false;

    await this.showWebOverlay();

    const totalPrompts = PromptImport.getTotalCount();
    let isFirst = true;

    try {
      while (this.isAutomationRunning) {
        const promptSet = PromptImport.getCurrentPrompt();
        if (!promptSet) break;

        const promptNum = PromptImport.getCurrentIndex() + 1;
        console.log(`[PromptImport-Single] Row ${promptNum}/${totalPrompts}:`, promptSet);

        const rowSteps = [
          // Image Mode (ข้าม row แรกถ้ามี handleOpenNewFlow จัดการอยู่แล้ว)
          () => this.handleImageMode(),
          () => randomDelay(2000),
          // Image prompt
          () => {
            PromptGenerator.outputTextarea.value = promptSet.imagePrompt;
            PromptGenerator.outputSection.hidden = false;
          },
          () => randomDelay(500),
          () => this.handleFillPrompt(),
          () => randomDelay(2000),
          () => this.handleCreate(),
          () => randomDelay((Settings.getImageCreateDelay() || 90) * 1000),
          // Video Mode + Select Image
          () => this.handleVideoMode(),
          () => randomDelay(3000),
          () => this.handleSelectImage(),
          () => randomDelay(3000),
          // Video prompt
          () => {
            PromptGenerator.outputTextarea.value = promptSet.videoPrompt;
            PromptGenerator.outputSection.hidden = false;
          },
          () => randomDelay(500),
          () => this.handleFillPrompt(),
          () => randomDelay(2000),
          () => this.handleCreate(),
          () => randomDelay((Settings.getDownloadDelay() || 120) * 1000),
          // Click Video + Download
          () => this.handleClickVideo(),
          () => randomDelay(3000),
          async () => {
            await this.handleDownloadAndStore();
            await this.savePageUrlToCsv();
            await randomDelay(5000);
          },
        ];

        for (const step of rowSteps) {
          if (!this.isAutomationRunning) break;
          await step();
        }

        isFirst = false;
        const hasMore = PromptImport.nextPrompt();
        if (!hasMore) break;

        // เปิดหน้าใหม่สำหรับ row ถัดไป
        if (this.isAutomationRunning) {
          await this.handleOpenNewFlow();
          await randomDelay(5000);
        }
      }

      if (this.isAutomationRunning) {
        Helpers.showToast(`Import Prompt (แยกวิดีโอ) เสร็จสิ้น! (${totalPrompts} ชุด)`, 'success');
      }

    } catch (error) {
      console.error('Prompt import single automation error:', error);
      Helpers.showToast(`Prompt import error: ${error.message}`, 'error');
    } finally {
      Helpers._suppressNonErrorToasts = false;
      if (this.csvEntries.length > 0) {
        await this.downloadCsvFile();
      }
      this.isAutomationRunning = false;
      PromptImport.stop();
      document.getElementById('automationBtn').disabled = false;
      document.getElementById('runBtn').disabled = false;
      document.getElementById('stopAutomationBtn').disabled = true;
      this.hideWebOverlay();
    }
  },

  /**
   * Handle Prompt Import Automation — Add Clip Mode (ต่อ Clip)
   * Uses imported prompts from CSV instead of AI-generated prompts
   *
   * Flow:
   *   Row 1 (index 0): Full flow — Image Mode → image prompt → Create ภาพ
   *                     → Video Mode → Select Image → video prompt → Create วิดีโอ → Click Video
   *   Row 2+ (index 1…N): Add Clip only — Check Scene → fill video prompt → Add Clip → wait
   *   สุดท้าย: Download + Store (ครั้งเดียว)
   */
  /**
   * โหลด CSV prompts → PromptGenerator scene list
   * แสดง scene cards ใน sidebar ก่อนรัน automation
   */
  loadCsvIntoSceneList() {
    const prompts = PromptImport.prompts;
    const count = prompts.length;

    // สร้าง scene list
    PromptGenerator.initSceneList(count);

    // เติม prompt ทุกฉาก
    prompts.forEach((p, i) => {
      if (i === 0 && p.imagePrompt) {
        PromptGenerator.setSceneImagePrompt(i, p.imagePrompt);
      }
      if (p.videoPrompt) {
        PromptGenerator.setSceneVideoPrompt(i, p.videoPrompt);
      }
      PromptGenerator.updateSceneStatus(i, 'ready');
    });

    console.log(`[PromptImport] Loaded ${count} prompts into scene list`);
  },

  async handlePromptImportAutomation() {
    if (this.isAutomationRunning) return;

    const started = await PromptImport.start();
    if (!started) return;

    // === Phase 1: โหลด CSV → Scene List (แสดงก่อนรัน) ===
    this.loadCsvIntoSceneList();
    PromptGenerator.resetRunIndex();

    const totalPrompts = PromptImport.getTotalCount();

    this.isAutomationRunning = true;
    Helpers._suppressNonErrorToasts = true;
    this.clearDownloadedUrls();
    this.clearCsvEntries();
    this.initSessionFolder();
    document.getElementById('automationBtn').disabled = true;
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stopAutomationBtn').disabled = false;

    await this.showWebOverlay();

    try {
      // === Phase 2: Row 1 — Full flow (image + video) ===
      const imagePrompt = PromptGenerator.getImagePrompt();
      const videoPrompt0 = PromptGenerator.getVideoPrompt(0);

      if (!imagePrompt && !videoPrompt0) throw new Error('No prompts available');

      console.log('[PromptImport] Row 1 (full flow)');

      const firstSteps = [
        () => this.handleImageMode(),
        () => randomDelay(2000),
        () => {
          PromptGenerator.outputTextarea.value = imagePrompt;
          PromptGenerator.outputSection.hidden = false;
        },
        () => randomDelay(500),
        () => this.handleFillPrompt(),
        () => randomDelay(2000),
        () => this.handleCreate(),
        () => randomDelay((Settings.getImageCreateDelay() || 90) * 1000),
        () => this.handleVideoMode(),
        () => randomDelay(3000),
        () => this.handleSelectImage(),
        () => randomDelay(3000),
        () => {
          PromptGenerator.outputTextarea.value = videoPrompt0;
          PromptGenerator.outputSection.hidden = false;
          PromptGenerator.updateSceneStatus(0, 'used');
        },
        () => randomDelay(500),
        () => this.handleFillPrompt(),
        () => randomDelay(2000),
        () => this.handleCreate(),
        () => randomDelay((Settings.getDownloadDelay() || 120) * 1000),
        () => this.handleClickVideo(),
        () => randomDelay(3000),
      ];

      for (const step of firstSteps) {
        if (!this.isAutomationRunning) break;
        await step();
      }

      // === Phase 3: Row 2+ — Add Clip (อ่าน video prompt จาก scene list) ===
      // pattern เดียวกับ handleAllScenesFromList: iteration แรกข้าม handleCheckScene
      // เพราะ timeline เปิดอยู่แล้วหลัง handleClickVideo
      for (let i = 1; i < totalPrompts; i++) {
        if (!this.isAutomationRunning) break;

        const videoPrompt = PromptGenerator.getVideoPrompt(i);
        if (!videoPrompt) continue;

        console.log(`[PromptImport] Row ${i + 1}/${totalPrompts} (add clip)`);

        // รอบที่ 2+ ต้อง wait + check scene (รอบแรก timeline พร้อมแล้ว)
        if (i > 1) {
          await randomDelay(10000);
          await this.handleCheckScene();
          await randomDelay(2000);
        }

        PromptGenerator.outputTextarea.value = videoPrompt;
        PromptGenerator.outputSection.hidden = false;
        PromptGenerator.updateSceneStatus(i, 'used');
        await randomDelay(1000);

        await this.handleAddClip();
        await randomDelay((Settings.getDownloadDelay() || 90) * 1000);

        PromptImport.nextPrompt(); // อัพเดท progress bar
      }

      // === Phase 4: Check last scene + Download (ครั้งเดียว) ===
      if (this.isAutomationRunning) {
        await randomDelay(5000);
        await this.handleCheckScene();
        await randomDelay(2000);
        await this.handleDownloadAndStore();
        await this.savePageUrlToCsv();
      }

      if (this.isAutomationRunning) {
        Helpers.showToast(`Import Prompt (ต่อ Clip) เสร็จสิ้น! (${totalPrompts} ฉาก)`, 'success');
      }

    } catch (error) {
      console.error('Prompt import automation error:', error);
      Helpers.showToast(`Prompt import error: ${error.message}`, 'error');
    } finally {
      Helpers._suppressNonErrorToasts = false;
      if (this.csvEntries.length > 0) {
        await this.downloadCsvFile();
      }
      this.isAutomationRunning = false;
      PromptImport.stop();
      document.getElementById('automationBtn').disabled = false;
      document.getElementById('runBtn').disabled = false;
      document.getElementById('stopAutomationBtn').disabled = true;
      this.hideWebOverlay();
    }
  },

  /**
   * บันทึก URL หน้าเว็บปัจจุบันลง CSV entries (เรียกหลัง download สำเร็จ)
   */
  async savePageUrlToCsv() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const pageUrl = tab ? tab.url : 'unknown';

      const now = new Date();
      const timestamp = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0');

      const entry = {
        timestamp,
        productId: this.currentProductId || '',
        productName: this.currentProductName || '',
        pageUrl
      };

      this.csvEntries.push(entry);

      // สะสมลง chrome.storage.local ข้ามรอบ automation
      chrome.storage.local.get(['flowCsvEntries'], (result) => {
        const stored = result.flowCsvEntries || [];
        stored.push(entry);
        chrome.storage.local.set({ flowCsvEntries: stored });
      });

      console.log('[CSV] Saved page URL:', pageUrl.substring(0, 80) + '...');
    } catch (error) {
      console.error('[CSV] Error saving page URL:', error);
    }
  },

  /**
   * ดาวน์โหลดไฟล์ CSV จาก entries ที่สะสมไว้ (เรียกตอนจบ automation)
   */
  async downloadCsvFile() {
    try {
      if (this.csvEntries.length === 0) return;

      // สร้าง CSV string พร้อม BOM สำหรับ Excel
      const header = 'timestamp,product_id,product_name,page_url';
      const rows = this.csvEntries.map(e => {
        // escape ค่าที่อาจมี comma หรือ quote
        const escapeCsv = (val) => {
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        };
        return [
          escapeCsv(e.timestamp),
          escapeCsv(e.productId),
          escapeCsv(e.productName),
          escapeCsv(e.pageUrl)
        ].join(',');
      });

      const csvContent = '\uFEFF' + header + '\n' + rows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const dataUrl = URL.createObjectURL(blob);

      // สร้างชื่อไฟล์ CSV
      const now = new Date();
      const dateStr = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

      const folder = this.sessionFolderName || this.downloadFolderName;
      const csvFilename = folder
        ? `${folder}/page_urls_${dateStr}.csv`
        : `page_urls_${dateStr}.csv`;

      await new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: dataUrl,
          filename: csvFilename,
          saveAs: false
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(downloadId);
          }
          // Revoke blob URL หลังดาวน์โหลดเริ่ม
          setTimeout(() => URL.revokeObjectURL(dataUrl), 5000);
        });
      });

      console.log(`[CSV] Downloaded CSV with ${this.csvEntries.length} entries: ${csvFilename}`);
      Helpers.showToast(`บันทึก CSV สำเร็จ (${this.csvEntries.length} รายการ)`, 'success');
    } catch (error) {
      console.error('[CSV] Error downloading CSV:', error);
      Helpers.showToast('บันทึก CSV ไม่สำเร็จ', 'error');
    }
  },

  /**
   * ล้างข้อมูล CSV entries (เรียกเมื่อเริ่ม automation ใหม่)
   */
  clearCsvEntries() {
    this.csvEntries = [];
    chrome.storage.local.remove('flowCsvEntries');
    console.log('[CSV] Cleared CSV entries');
  },

  /**
   * Handle Scene List Single Automation (แยกวิดีโอ)
   * ทุกฉาก: สร้างภาพ → สร้างวิดีโอ → Click Video → Download → เปิดหน้าใหม่
   * @param {boolean} hasPersonImage - มีภาพคนหรือไม่
   */
  async handleSceneListSingleAutomation(hasPersonImage) {
    const sceneCount = PromptGenerator.scenes.length;

    for (let i = 0; i < sceneCount; i++) {
      if (!this.isAutomationRunning) break;

      const imagePrompt = PromptGenerator.getImagePrompt(i);
      const videoPrompt = PromptGenerator.getVideoPrompt(i);
      if (!imagePrompt && !videoPrompt) continue;

      console.log(`[SceneSingle] ฉาก ${i + 1}/${sceneCount}`);

      // ฉาก 2+ → เปิดหน้าใหม่ก่อน
      if (i > 0) {
        Helpers.showToast(`เปิดหน้าใหม่สำหรับฉาก ${i + 1}...`, 'info');
        await this.handleOpenNewFlow();
        await randomDelay(5000);
      }

      const sceneSteps = [
        // Image Mode — ฉาก 1 เท่านั้น (ฉาก 2+ handleOpenNewFlow จัดการให้แล้ว)
        ...(i === 0 ? [
          { name: `[${i + 1}/${sceneCount}] Image Mode`, fn: () => this.handleImageMode() },
          { name: null, fn: () => randomDelay(3000) },
        ] : []),
        // Upload ภาพคน (ข้ามถ้าไม่มี)
        ...(hasPersonImage ? [
          { name: `[${i + 1}/${sceneCount}] Upload`, fn: () => this.handleUploadProduct() },
          { name: null, fn: () => randomDelay(45000) },
        ] : []),
        // Image Prompt
        { name: `[${i + 1}/${sceneCount}] Prompt ภาพ`, fn: () => {
          PromptGenerator.outputTextarea.value = imagePrompt;
          PromptGenerator.outputSection.hidden = false;
        }},
        { name: null, fn: () => randomDelay(5000) },
        { name: `[${i + 1}/${sceneCount}] Add Prompt`, fn: () => this.handleFillPrompt() },
        { name: null, fn: () => randomDelay(2000) },
        { name: `[${i + 1}/${sceneCount}] Create ภาพ`, fn: () => this.handleCreate() },
        { name: null, fn: () => randomDelay((Settings.getImageCreateDelay() || 90) * 1000) },
        // Video Mode + Select Image
        { name: `[${i + 1}/${sceneCount}] Video Mode`, fn: () => this.handleVideoMode() },
        { name: null, fn: () => randomDelay(3000) },
        { name: `[${i + 1}/${sceneCount}] Select Image`, fn: () => this.handleSelectImage() },
        { name: null, fn: () => randomDelay(3000) },
        // Video Prompt
        { name: `[${i + 1}/${sceneCount}] Prompt วิดีโอ`, fn: () => {
          PromptGenerator.outputTextarea.value = videoPrompt;
          PromptGenerator.outputSection.hidden = false;
          PromptGenerator.updateSceneStatus(i, 'used');
        }},
        { name: null, fn: () => randomDelay(5000) },
        { name: `[${i + 1}/${sceneCount}] Add Prompt วิดีโอ`, fn: () => this.handleFillPrompt() },
        { name: null, fn: () => randomDelay(2000) },
        { name: `[${i + 1}/${sceneCount}] Create วิดีโอ`, fn: () => this.handleCreate() },
        { name: null, fn: () => randomDelay((Settings.getDownloadDelay() || 120) * 1000) },
        // Click Video + Download
        { name: `[${i + 1}/${sceneCount}] Click Video`, fn: () => this.handleClickVideo() },
        { name: null, fn: () => randomDelay(3000) },
        { name: `[${i + 1}/${sceneCount}] Download + คลัง`, fn: async () => {
          await this.handleDownloadAndStore();
          await randomDelay(5000);
        }},
      ];

      const totalSteps = sceneSteps.filter(s => s.name).length;
      let stepNum = 0;
      for (const step of sceneSteps) {
        if (!this.isAutomationRunning) break;
        if (step.name) {
          stepNum++;
          Helpers.showToast(`Step ${stepNum}/${totalSteps}: ${step.name}`, 'info');
        }
        await step.fn();
      }
    }
  },

});

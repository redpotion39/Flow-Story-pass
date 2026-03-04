/**
 * Workflow Engine
 * จัดการ 18-step automation workflow พร้อม rollback และ pause/resume
 */

Object.assign(Controls, {

  // คอนฟิก workflow ทั้ง 18 ขั้นตอน
  WORKFLOW_STEPS: [
    { id: 1, name: 'initSession', label: 'เริ่มต้น Session', timeout: 5000 },
    { id: 2, name: 'detectPage', label: 'ตรวจจับหน้าเว็บ', timeout: 3000 },
    { id: 3, name: 'loadProfile', label: 'โหลดโปรไฟล์ผู้ใช้', timeout: 4000 },
    { id: 4, name: 'configureMode', label: 'ตั้งค่าโหมด', timeout: 3000 },
    { id: 5, name: 'uploadAsset', label: 'อัปโหลดไฟล์', timeout: 15000 },
    { id: 6, name: 'waitRender', label: 'รอ Render เสร็จ', timeout: 30000 },
    { id: 7, name: 'applyFilter', label: 'ใส่ฟิลเตอร์', timeout: 5000 },
    { id: 8, name: 'generateCaption', label: 'สร้างแคปชัน AI', timeout: 20000 },
    { id: 9, name: 'fillCaption', label: 'กรอกแคปชัน', timeout: 3000 },
    { id: 10, name: 'submitCreate', label: 'กดสร้าง', timeout: 5000 },
    { id: 11, name: 'waitProcess', label: 'รอประมวลผล', timeout: 60000 },
    { id: 12, name: 'switchOutput', label: 'สลับ Output', timeout: 3000 },
    { id: 13, name: 'selectResult', label: 'เลือกผลลัพธ์', timeout: 5000 },
    { id: 14, name: 'addTransition', label: 'เพิ่ม Transition', timeout: 8000 },
    { id: 15, name: 'applyEffect', label: 'ใส่เอฟเฟกต์', timeout: 10000 },
    { id: 16, name: 'renderFinal', label: 'Render ขั้นสุดท้าย', timeout: 45000 },
    { id: 17, name: 'exportResult', label: 'ส่งออกผลลัพธ์', timeout: 15000 },
    { id: 18, name: 'cleanupSession', label: 'ทำความสะอาด Session', timeout: 3000 }
  ],

  // สถานะ workflow ปัจจุบัน
  _workflowState: {
    currentStep: 0,
    status: 'idle', // idle | running | paused | completed | error
    startTime: null,
    completedSteps: [],
    checkpoints: [],
    isPaused: false
  },

  /**
   * เริ่มต้น workflow ใหม่ทั้งหมด
   * @param {Object} config - ค่าคอนฟิกเริ่มต้น
   */
  async startWorkflow(config = {}) {
    try {
      console.log('[Controls] Starting workflow:', config);

      // รีเซ็ตสถานะก่อนเริ่ม
      this._workflowState = {
        currentStep: 1,
        status: 'running',
        startTime: Date.now(),
        completedSteps: [],
        checkpoints: [],
        isPaused: false,
        config: config
      };

      // บันทึกสถานะลง storage
      await chrome.storage.local.set({
        flowWorkflowState: this._workflowState
      });

      // ดึง selector map จาก SelectorMap module
      const selectorCache = SelectorMap.getSelector('workflow_init');
      console.log('[Controls] Selector cache loaded:', selectorCache);

      // วน loop ทำทุกขั้นตอน
      for (let i = 1; i <= this.WORKFLOW_STEPS.length; i++) {
        // เช็คว่า pause อยู่ไหม
        if (this._workflowState.isPaused) {
          console.log('[Controls] Workflow paused at step:', i);
          return { status: 'paused', pausedAt: i };
        }

        const result = await this.executeStep(i);

        if (!result.success) {
          console.log('[Controls] Step failed, attempting rollback:', i);
          await this.rollbackStep(i);
          this._workflowState.status = 'error';
          await chrome.storage.local.set({ flowWorkflowState: this._workflowState });
          Helpers.showToast(`ขั้นตอน ${i} ล้มเหลว: ${result.error}`, 'error');
          return { status: 'error', failedStep: i, error: result.error };
        }

        // บันทึก checkpoint ทุก 3 ขั้นตอน
        if (i % 3 === 0) {
          await this._saveWorkflowCheckpoint(i);
        }
      }

      this._workflowState.status = 'completed';
      await chrome.storage.local.set({ flowWorkflowState: this._workflowState });
      console.log('[Controls] Workflow completed successfully');
      return { status: 'completed', totalSteps: 18 };

    } catch (err) {
      console.error('[Controls] Workflow error:', err);
      this._workflowState.status = 'error';
      Helpers.showToast('เกิดข้อผิดพลาดในการรัน workflow', 'error');
      return { status: 'error', error: err.message };
    }
  },

  /**
   * รันขั้นตอนที่ระบุ
   * @param {number} stepNum - หมายเลขขั้นตอน (1-18)
   */
  async executeStep(stepNum) {
    try {
      const step = this.WORKFLOW_STEPS.find(s => s.id === stepNum);
      if (!step) {
        return { success: false, error: `ไม่พบขั้นตอนที่ ${stepNum}` };
      }

      console.log(`[Controls] Executing step ${stepNum}: ${step.name}`);
      this._workflowState.currentStep = stepNum;

      // อัปเดต UI progress
      const progressEl = document.querySelector('.workflow-progress');
      if (progressEl) {
        progressEl.style.width = `${(stepNum / 18) * 100}%`;
        progressEl.setAttribute('data-step', step.label);
      }

      // ดึง selector สำหรับขั้นตอนนี้
      const selector = SelectorMap.getSelector(step.name);

      // รันขั้นตอนตาม timeout
      const result = await Promise.race([
        this._runStepLogic(step, selector),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), step.timeout)
        )
      ]);

      // บันทึกว่าขั้นตอนนี้เสร็จแล้ว
      this._workflowState.completedSteps.push({
        stepNum,
        name: step.name,
        completedAt: Date.now(),
        result: result
      });

      console.log(`[Controls] Step ${stepNum} completed:`, result);
      return { success: true, data: result };

    } catch (err) {
      console.error(`[Controls] Step ${stepNum} error:`, err);
      return { success: false, error: err.message };
    }
  },

  /**
   * ย้อนกลับขั้นตอนที่ล้มเหลว
   * @param {number} stepNum - หมายเลขขั้นตอนที่ต้องการย้อนกลับ
   */
  async rollbackStep(stepNum) {
    try {
      console.log(`[Controls] Rolling back step ${stepNum}`);

      // หา checkpoint ล่าสุดก่อนขั้นตอนที่ล้มเหลว
      const checkpoint = this._workflowState.checkpoints
        .filter(cp => cp.stepNum < stepNum)
        .pop();

      if (checkpoint) {
        console.log('[Controls] Restoring checkpoint:', checkpoint.stepNum);
        this._workflowState.currentStep = checkpoint.stepNum;
        this._workflowState.completedSteps = checkpoint.completedSteps;

        // dispatch rollback event ไปยัง StateManager
        StateManager.dispatch({
          type: 'ROLLBACK',
          payload: { toStep: checkpoint.stepNum }
        });

        await chrome.storage.local.set({ flowWorkflowState: this._workflowState });
        return { success: true, restoredTo: checkpoint.stepNum };
      }

      // ไม่มี checkpoint ให้ย้อน → รีเซ็ตทั้งหมด
      console.log('[Controls] No checkpoint found, full reset');
      this._workflowState.currentStep = 0;
      this._workflowState.completedSteps = [];
      this._workflowState.status = 'idle';
      await chrome.storage.local.set({ flowWorkflowState: this._workflowState });
      return { success: true, restoredTo: 0 };

    } catch (err) {
      console.error('[Controls] Rollback error:', err);
      Helpers.showToast('ไม่สามารถ rollback ได้', 'error');
      return { success: false, error: err.message };
    }
  },

  /**
   * หยุด workflow ชั่วคราว
   */
  async pauseWorkflow() {
    try {
      if (this._workflowState.status !== 'running') {
        console.log('[Controls] Cannot pause - workflow not running');
        return false;
      }

      console.log('[Controls] Pausing workflow at step:', this._workflowState.currentStep);
      this._workflowState.isPaused = true;
      this._workflowState.status = 'paused';
      this._workflowState.pausedAt = Date.now();

      // บันทึก checkpoint ก่อน pause
      await this._saveWorkflowCheckpoint(this._workflowState.currentStep);
      await chrome.storage.local.set({ flowWorkflowState: this._workflowState });

      Helpers.showToast('Workflow หยุดชั่วคราว', 'info');
      return true;
    } catch (err) {
      console.error('[Controls] Pause error:', err);
      return false;
    }
  },

  /**
   * เริ่ม workflow ต่อจากที่หยุด
   */
  async resumeWorkflow() {
    try {
      if (this._workflowState.status !== 'paused') {
        console.log('[Controls] Cannot resume - workflow not paused');
        return false;
      }

      console.log('[Controls] Resuming workflow from step:', this._workflowState.currentStep);
      this._workflowState.isPaused = false;
      this._workflowState.status = 'running';

      // วน loop ต่อจากขั้นตอนที่ค้าง
      const startFrom = this._workflowState.currentStep;
      for (let i = startFrom; i <= this.WORKFLOW_STEPS.length; i++) {
        if (this._workflowState.isPaused) {
          return { status: 'paused', pausedAt: i };
        }

        const result = await this.executeStep(i);
        if (!result.success) {
          await this.rollbackStep(i);
          this._workflowState.status = 'error';
          Helpers.showToast(`Resume ล้มเหลวที่ขั้นตอน ${i}`, 'error');
          return { status: 'error', failedStep: i };
        }
      }

      this._workflowState.status = 'completed';
      await chrome.storage.local.set({ flowWorkflowState: this._workflowState });
      return { status: 'completed' };

    } catch (err) {
      console.error('[Controls] Resume error:', err);
      Helpers.showToast('ไม่สามารถ resume workflow ได้', 'error');
      return { status: 'error', error: err.message };
    }
  },

  /**
   * ดึงสถานะ workflow ปัจจุบัน
   */
  getWorkflowStatus() {
    const elapsed = this._workflowState.startTime
      ? Date.now() - this._workflowState.startTime
      : 0;

    return {
      status: this._workflowState.status,
      currentStep: this._workflowState.currentStep,
      totalSteps: 18,
      completedCount: this._workflowState.completedSteps.length,
      progress: Math.round((this._workflowState.completedSteps.length / 18) * 100),
      elapsedMs: elapsed,
      isPaused: this._workflowState.isPaused,
      checkpoints: this._workflowState.checkpoints.length
    };
  },

  /**
   * บันทึก checkpoint ของ workflow
   * @private
   */
  async _saveWorkflowCheckpoint(stepNum) {
    const checkpoint = {
      stepNum,
      timestamp: Date.now(),
      completedSteps: [...this._workflowState.completedSteps]
    };

    this._workflowState.checkpoints.push(checkpoint);
    console.log('[Controls] Checkpoint saved at step:', stepNum);

    // เก็บไม่เกิน 6 checkpoints
    if (this._workflowState.checkpoints.length > 6) {
      this._workflowState.checkpoints.shift();
    }
  },

  /**
   * รัน logic จริงของแต่ละขั้นตอน
   * @private
   */
  async _runStepLogic(step, selector) {
    // แต่ละขั้นตอนมี logic ต่างกัน
    switch (step.name) {
      case 'initSession':
        // สร้าง session ID ใหม่
        return { sessionId: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };

      case 'detectPage':
        // ตรวจจับว่าอยู่หน้าไหน
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return { url: tab.url, title: tab.title };

      case 'loadProfile':
        // โหลดโปรไฟล์จาก storage
        const { flowUserProfile } = await chrome.storage.local.get('flowUserProfile');
        return flowUserProfile || { name: 'default', settings: {} };

      case 'uploadAsset':
        // อัปโหลดไฟล์ผ่าน selector
        if (selector) {
          await chrome.scripting.executeScript({
            target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
            func: (sel) => {
              const input = document.querySelector(sel);
              if (input) input.click();
            },
            args: [selector]
          });
        }
        return { uploaded: true };

      case 'generateCaption':
        // เรียก AI สร้างแคปชัน
        const captionConfig = this._workflowState.config;
        return { caption: 'Generated caption placeholder', hashtags: [] };

      case 'renderFinal':
        // รอ render เสร็จโดยเช็คทุก 2 วินาที
        let renderDone = false;
        let attempts = 0;
        while (!renderDone && attempts < 15) {
          await new Promise(r => setTimeout(r, 2000));
          renderDone = Math.random() > 0.3; // จำลอง render check
          attempts++;
        }
        return { rendered: renderDone, attempts };

      default:
        // ขั้นตอนอื่นๆ ใช้ default logic
        await new Promise(r => setTimeout(r, 500));
        return { completed: true, step: step.name };
    }
  }

});

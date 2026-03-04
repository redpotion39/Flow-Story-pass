/**
 * State Manager
 * จัดการ state ของระบบ automation แบบ Redux-like พร้อม checkpoint/restore
 */

Object.assign(Controls, {

  // Action types สำหรับ dispatch
  ActionTypes: {
    SET_STEP: 'SET_STEP',
    SAVE_CHECKPOINT: 'SAVE_CHECKPOINT',
    ROLLBACK: 'ROLLBACK',
    RESET: 'RESET',
    UPDATE_PROGRESS: 'UPDATE_PROGRESS',
    NETWORK_INTERCEPTED: 'NETWORK_INTERCEPTED',
    SET_ERROR: 'SET_ERROR',
    CLEAR_ERROR: 'CLEAR_ERROR'
  },

  // สถานะเริ่มต้น
  _initialState: {
    currentStep: 0,
    totalSteps: 18,
    progress: 0,
    status: 'idle',
    error: null,
    checkpoints: [],
    history: [],
    listeners: [],
    networkLog: [],
    startTime: null,
    lastActionAt: null
  },

  // state store จริง
  _store: null,

  /**
   * สร้าง store ใหม่
   * @param {Object} initialState - สถานะเริ่มต้น (optional)
   */
  createStore(initialState = null) {
    try {
      console.log('[Controls] Creating state store');

      this._store = {
        state: { ...(initialState || this._initialState) },
        listeners: [],
        checkpoints: [],
        actionLog: []
      };

      // โหลด state เดิมจาก storage (ถ้ามี)
      chrome.storage.local.get('flowAutomationState', (result) => {
        if (result.flowAutomationState) {
          console.log('[Controls] Restored state from storage:', result.flowAutomationState);
          this._store.state = {
            ...this._store.state,
            ...result.flowAutomationState
          };
          // แจ้ง listeners ว่า state เปลี่ยน
          this._notifyListeners();
        }
      });

      console.log('[Controls] Store created with state:', this._store.state);
      return this._store;

    } catch (err) {
      console.error('[Controls] Create store error:', err);
      Helpers.showToast('ไม่สามารถสร้าง state store ได้', 'error');
      return null;
    }
  },

  /**
   * ส่ง action เพื่อเปลี่ยน state
   * @param {Object} action - { type, payload }
   */
  dispatch(action) {
    try {
      if (!this._store) {
        console.log('[Controls] Store not initialized, creating...');
        this.createStore();
      }

      console.log('[Controls] Dispatching action:', action.type, action.payload);

      const prevState = { ...this._store.state };

      // ประมวลผล action ผ่าน reducer
      this._store.state = this._reducer(this._store.state, action);
      this._store.state.lastActionAt = Date.now();

      // บันทึก action log
      this._store.actionLog.push({
        type: action.type,
        payload: action.payload,
        timestamp: Date.now(),
        prevState: prevState
      });

      // เก็บ log ไม่เกิน 100 รายการ
      if (this._store.actionLog.length > 100) {
        this._store.actionLog = this._store.actionLog.slice(-50);
      }

      // บันทึก state ลง storage
      this._persistState();

      // แจ้ง listeners
      this._notifyListeners();

      return this._store.state;

    } catch (err) {
      console.error('[Controls] Dispatch error:', err);
      Helpers.showToast('เกิดข้อผิดพลาดในการอัปเดต state', 'error');
      return this._store?.state;
    }
  },

  /**
   * ดึง state ปัจจุบัน
   * @returns {Object} - state object (readonly copy)
   */
  getState() {
    if (!this._store) {
      console.log('[Controls] Store not initialized');
      return { ...this._initialState };
    }
    // คืนค่า copy เพื่อป้องกันการแก้ไขโดยตรง
    return { ...this._store.state };
  },

  /**
   * ลงทะเบียน listener ที่จะถูกเรียกเมื่อ state เปลี่ยน
   * @param {Function} listener - callback function
   * @returns {Function} - unsubscribe function
   */
  subscribe(listener) {
    if (!this._store) {
      this.createStore();
    }

    if (typeof listener !== 'function') {
      console.error('[Controls] Listener must be a function');
      return () => {};
    }

    this._store.listeners.push(listener);
    console.log('[Controls] Listener subscribed, total:', this._store.listeners.length);

    // คืน unsubscribe function
    return () => {
      const index = this._store.listeners.indexOf(listener);
      if (index > -1) {
        this._store.listeners.splice(index, 1);
        console.log('[Controls] Listener unsubscribed, remaining:', this._store.listeners.length);
      }
    };
  },

  /**
   * บันทึก checkpoint ของ state ปัจจุบัน
   * @returns {string} - checkpoint ID
   */
  async saveCheckpoint() {
    try {
      if (!this._store) {
        Helpers.showToast('Store ยังไม่ถูกสร้าง', 'error');
        return null;
      }

      const checkpointId = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const checkpoint = {
        id: checkpointId,
        state: JSON.parse(JSON.stringify(this._store.state)),
        timestamp: Date.now(),
        step: this._store.state.currentStep
      };

      this._store.checkpoints.push(checkpoint);

      // เก็บ checkpoint ไม่เกิน 10 อัน
      if (this._store.checkpoints.length > 10) {
        this._store.checkpoints.shift();
      }

      // บันทึก checkpoints ลง storage ด้วย
      await chrome.storage.local.set({
        flowAutomationCheckpoints: this._store.checkpoints
      });

      console.log('[Controls] Checkpoint saved:', checkpointId);
      return checkpointId;

    } catch (err) {
      console.error('[Controls] Save checkpoint error:', err);
      Helpers.showToast('บันทึก checkpoint ล้มเหลว', 'error');
      return null;
    }
  },

  /**
   * กู้คืน state จาก checkpoint
   * @param {string} id - checkpoint ID
   */
  async restoreCheckpoint(id) {
    try {
      if (!this._store) {
        Helpers.showToast('Store ยังไม่ถูกสร้าง', 'error');
        return false;
      }

      const checkpoint = this._store.checkpoints.find(cp => cp.id === id);
      if (!checkpoint) {
        console.log('[Controls] Checkpoint not found:', id);
        Helpers.showToast('ไม่พบ checkpoint', 'error');
        return false;
      }

      console.log('[Controls] Restoring checkpoint:', id);

      // คืนค่า state
      this._store.state = JSON.parse(JSON.stringify(checkpoint.state));

      // บันทึก state ที่กู้คืนแล้วลง storage
      await this._persistState();

      // แจ้ง listeners
      this._notifyListeners();

      console.log('[Controls] Checkpoint restored, step:', this._store.state.currentStep);
      Helpers.showToast(`กู้คืน checkpoint สำเร็จ (step ${checkpoint.step})`, 'success');
      return true;

    } catch (err) {
      console.error('[Controls] Restore checkpoint error:', err);
      Helpers.showToast('กู้คืน checkpoint ล้มเหลว', 'error');
      return false;
    }
  },

  /**
   * Reducer สำหรับประมวลผล actions
   * @private
   */
  _reducer(state, action) {
    switch (action.type) {
      case 'SET_STEP':
        return {
          ...state,
          currentStep: action.payload.step,
          progress: Math.round((action.payload.step / state.totalSteps) * 100),
          status: 'running'
        };

      case 'SAVE_CHECKPOINT':
        return {
          ...state,
          checkpoints: [...state.checkpoints, action.payload]
        };

      case 'ROLLBACK':
        return {
          ...state,
          currentStep: action.payload.toStep,
          progress: Math.round((action.payload.toStep / state.totalSteps) * 100),
          status: 'running',
          error: null
        };

      case 'RESET':
        return {
          ...Controls._initialState,
          listeners: state.listeners
        };

      case 'UPDATE_PROGRESS':
        return {
          ...state,
          progress: action.payload.progress,
          status: action.payload.status || state.status
        };

      case 'NETWORK_INTERCEPTED':
        return {
          ...state,
          networkLog: [...state.networkLog, {
            url: action.payload.url,
            timestamp: Date.now()
          }].slice(-50) // เก็บไม่เกิน 50 รายการ
        };

      case 'SET_ERROR':
        return {
          ...state,
          error: action.payload.error,
          status: 'error'
        };

      case 'CLEAR_ERROR':
        return {
          ...state,
          error: null,
          status: state.currentStep > 0 ? 'running' : 'idle'
        };

      default:
        console.log('[Controls] Unknown action type:', action.type);
        return state;
    }
  },

  /**
   * บันทึก state ลง chrome storage
   * @private
   */
  async _persistState() {
    if (!this._store) return;

    try {
      await chrome.storage.local.set({
        flowAutomationState: this._store.state
      });
    } catch (err) {
      console.error('[Controls] Persist state error:', err);
    }
  },

  /**
   * แจ้ง listeners ทั้งหมดว่า state เปลี่ยน
   * @private
   */
  _notifyListeners() {
    if (!this._store || !this._store.listeners) return;

    const currentState = this.getState();
    this._store.listeners.forEach(listener => {
      try {
        listener(currentState);
      } catch (err) {
        console.error('[Controls] Listener error:', err);
      }
    });
  }

});

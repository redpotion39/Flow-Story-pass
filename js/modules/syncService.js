/**
 * Sync Service Module
 * Handles cross-device synchronization of products, prompts, and settings
 */
const SyncService = {
  SYNC_URL: 'https://aiunlock.co/api/sync',
  STORAGE_TOKEN: 'flowSyncToken',
  STORAGE_LAST_SYNC: 'flowLastSync',
  STORAGE_ENABLED: 'flowSyncEnabled',
  _autoSyncInterval: null,
  _isSyncing: false,
  _retryCount: 0,
  _maxRetries: 3,

  /**
   * Initialize sync service
   * โหลดค่าจาก storage แล้วเช็คว่าเปิด auto sync ไว้หรือไม่
   */
  async init() {
    try {
      const config = await new Promise((resolve) => {
        chrome.storage.local.get(
          [this.STORAGE_TOKEN, this.STORAGE_LAST_SYNC, this.STORAGE_ENABLED],
          resolve
        );
      });

      const syncEnabled = config[this.STORAGE_ENABLED] || false;
      const lastSync = config[this.STORAGE_LAST_SYNC] || null;

      if (lastSync) {
        console.log('[SyncService] last sync:', new Date(lastSync).toLocaleString());
      }

      // ถ้าเปิด auto sync ไว้ ให้เริ่มทำงานอัตโนมัติ
      if (syncEnabled) {
        this.enableAutoSync(5 * 60 * 1000); // ทุก 5 นาที
        console.log('[SyncService] auto sync resumed');
      }

      console.log('[SyncService] initialized, sync enabled:', syncEnabled);
    } catch (err) {
      console.error('[SyncService] init failed:', err);
    }
  },

  /**
   * ส่งข้อมูลไปยัง sync server
   * @param {Object} data - ข้อมูลที่ต้องการ sync (products, prompts, settings)
   * @returns {Promise<boolean>}
   */
  async push(data) {
    if (this._isSyncing) {
      console.warn('[SyncService] sync already in progress, skipping');
      return false;
    }

    this._isSyncing = true;

    try {
      const token = await this._getToken();
      if (!token) {
        Helpers.showToast('Please login to enable sync', 'error');
        return false;
      }

      // เตรียม payload พร้อม timestamp
      const payload = {
        data,
        timestamp: Date.now(),
        version: chrome.runtime.getManifest().version,
        deviceId: await this._getDeviceId()
      };

      console.log('[SyncService] pushing data, size:', JSON.stringify(payload).length);

      const response = await fetch(`${this.SYNC_URL}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Sync push failed: ${response.status}`);
      }

      const result = await response.json();

      // อัพเดทเวลา sync ล่าสุด
      await new Promise((resolve) => {
        chrome.storage.local.set({ [this.STORAGE_LAST_SYNC]: Date.now() }, resolve);
      });

      this._retryCount = 0;
      console.log('[SyncService] push successful, server version:', result.version);
      Helpers.showToast('Data synced successfully', 'success');
      return true;
    } catch (err) {
      console.error('[SyncService] push error:', err);

      // ลอง retry ถ้ายังไม่เกิน max
      if (this._retryCount < this._maxRetries) {
        this._retryCount++;
        console.log('[SyncService] retrying push, attempt:', this._retryCount);
        const backoffMs = Math.pow(2, this._retryCount) * 1000;
        setTimeout(() => this.push(data), backoffMs);
      } else {
        Helpers.showToast('Sync failed after retries', 'error');
        this._retryCount = 0;
      }

      return false;
    } finally {
      this._isSyncing = false;
    }
  },

  /**
   * ดึงข้อมูลจาก sync server
   * @returns {Promise<Object|null>}
   */
  async pull() {
    try {
      const token = await this._getToken();
      if (!token) {
        console.warn('[SyncService] no token, cannot pull');
        return null;
      }

      const deviceId = await this._getDeviceId();
      console.log('[SyncService] pulling data for device:', deviceId);

      const response = await fetch(`${this.SYNC_URL}/pull?deviceId=${deviceId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Sync pull failed: ${response.status}`);
      }

      const remoteData = await response.json();

      // เช็ค conflict กับข้อมูล local
      const localData = await this._getLocalData();
      if (remoteData.timestamp && localData.timestamp) {
        if (remoteData.timestamp !== localData.timestamp) {
          console.log('[SyncService] conflict detected, resolving...');
          return await this.resolveConflict(localData, remoteData);
        }
      }

      // อัพเดทเวลา sync
      await new Promise((resolve) => {
        chrome.storage.local.set({ [this.STORAGE_LAST_SYNC]: Date.now() }, resolve);
      });

      console.log('[SyncService] pull successful, items:', Object.keys(remoteData.data || {}).length);
      return remoteData.data;
    } catch (err) {
      console.error('[SyncService] pull error:', err);
      Helpers.showToast('Failed to pull sync data', 'error');
      return null;
    }
  },

  /**
   * แก้ conflict ระหว่างข้อมูล local กับ remote
   * ใช้กลยุทธ์ last-write-wins + merge สำหรับ arrays
   * @param {Object} local - ข้อมูล local
   * @param {Object} remote - ข้อมูลจาก server
   * @returns {Object}
   */
  async resolveConflict(local, remote) {
    try {
      // ใช้ timestamp ใหม่กว่าเป็นหลัก
      const winner = remote.timestamp > local.timestamp ? remote : local;
      console.log('[SyncService] conflict resolved, winner:', winner === remote ? 'remote' : 'local');

      // merge product lists แทนที่จะ overwrite
      if (local.data?.products && remote.data?.products) {
        const mergedProducts = this._mergeArrays(
          local.data.products,
          remote.data.products,
          'id'
        );
        winner.data.products = mergedProducts;
        console.log('[SyncService] merged products count:', mergedProducts.length);
      }

      return winner.data;
    } catch (err) {
      console.error('[SyncService] resolveConflict error:', err);
      // ถ้า merge ไม่ได้ ให้ใช้ remote เป็นหลัก
      return remote.data;
    }
  },

  /**
   * ดึงเวลา sync ล่าสุด
   * @returns {Promise<number|null>} timestamp
   */
  async getLastSyncTime() {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get([this.STORAGE_LAST_SYNC], resolve);
    });
    return result[this.STORAGE_LAST_SYNC] || null;
  },

  /**
   * เปิด auto sync ตามช่วงเวลาที่กำหนด
   * @param {number} intervalMs - ระยะห่างระหว่าง sync (มิลลิวินาที)
   */
  enableAutoSync(intervalMs = 300000) {
    // ปิดตัวเก่าก่อนถ้ามี
    this.disableAutoSync();

    this._autoSyncInterval = setInterval(async () => {
      console.log('[SyncService] auto sync triggered');
      const localData = await this._getLocalData();
      await this.push(localData);
    }, intervalMs);

    // บันทึกสถานะว่าเปิด auto sync
    chrome.storage.local.set({ [this.STORAGE_ENABLED]: true });
    console.log('[SyncService] auto sync enabled, interval:', intervalMs, 'ms');
  },

  /**
   * ปิด auto sync
   */
  disableAutoSync() {
    if (this._autoSyncInterval) {
      clearInterval(this._autoSyncInterval);
      this._autoSyncInterval = null;
    }

    chrome.storage.local.set({ [this.STORAGE_ENABLED]: false });
    console.log('[SyncService] auto sync disabled');
  },

  /**
   * ดึง sync token จาก storage (internal)
   */
  async _getToken() {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get([this.STORAGE_TOKEN], resolve);
    });
    return result[this.STORAGE_TOKEN] || null;
  },

  /**
   * สร้าง device ID ที่ unique ต่อ browser (internal)
   */
  async _getDeviceId() {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['flowDeviceId'], resolve);
    });

    if (result.flowDeviceId) return result.flowDeviceId;

    // สร้าง ID ใหม่จาก random bytes
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const deviceId = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

    await new Promise((resolve) => {
      chrome.storage.local.set({ flowDeviceId: deviceId }, resolve);
    });

    return deviceId;
  },

  /**
   * ดึงข้อมูล local ทั้งหมดสำหรับ sync (internal)
   */
  async _getLocalData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['flowProducts', 'flowCategories', 'flowVideos', 'flowCharacters'],
        (data) => {
          resolve({
            data,
            timestamp: Date.now()
          });
        }
      );
    });
  },

  /**
   * merge 2 arrays โดยใช้ key เป็นตัวเช็ค duplicate (internal)
   */
  _mergeArrays(arr1, arr2, key) {
    const map = new Map();
    arr1.forEach(item => map.set(item[key], item));
    arr2.forEach(item => {
      if (!map.has(item[key])) {
        map.set(item[key], item);
      }
    });
    return Array.from(map.values());
  }
};

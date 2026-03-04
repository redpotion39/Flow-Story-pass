/**
 * Video Storage Module
 * Uses IndexedDB to store video files (larger than chrome.storage.local limit)
 */
const VideoStorage = {
  dbName: 'FlowAIVideoDB',
  dbVersion: 1,
  storeName: 'videos',
  db: null,

  /**
   * Initialize IndexedDB
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  },

  /**
   * Ensure DB is initialized
   */
  async ensureDB() {
    if (!this.db) {
      await this.init();
    }
    return this.db;
  },

  /**
   * Save video file to IndexedDB
   */
  async save(id, file) {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const data = {
        id: id,
        file: file,
        savedAt: Date.now()
      };

      const request = store.put(data);

      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Get video file from IndexedDB
   */
  async get(id) {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result ? request.result.file : null);
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Delete video file from IndexedDB
   */
  async delete(id) {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Check if video exists
   */
  async exists(id) {
    const file = await this.get(id);
    return file !== null;
  },

  /**
   * Get all video IDs
   */
  async getAllIds() {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Clear all videos
   */
  async clearAll() {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Generate thumbnail from video file
   */
  async generateThumbnail(file) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration / 2);
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 240;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw >= vh) {
          canvas.width = maxDim;
          canvas.height = Math.round(maxDim * (vh / vw));
        } else {
          canvas.height = maxDim;
          canvas.width = Math.round(maxDim * (vw / vh));
        }
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
        URL.revokeObjectURL(video.src);
        resolve({
          thumbnail,
          duration: video.duration
        });
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve({ thumbnail: null, duration: 0 });
      };

      video.src = URL.createObjectURL(file);
    });
  },

  /**
   * Export all videos as base64 for backup
   */
  async exportAll() {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = async () => {
        const entries = request.result || [];
        const exported = [];

        for (const entry of entries) {
          try {
            const base64 = await this._blobToBase64(entry.file);
            exported.push({
              id: entry.id,
              base64: base64,
              fileName: entry.file?.name || 'video.mp4',
              fileType: entry.file?.type || 'video/mp4',
              savedAt: entry.savedAt
            });
          } catch (e) {
            console.warn('Could not export video:', entry.id, e);
          }
        }

        resolve(exported);
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Import videos from backup data
   */
  async importAll(videoDataArray) {
    if (!Array.isArray(videoDataArray) || videoDataArray.length === 0) return 0;

    const db = await this.ensureDB();
    let count = 0;

    for (const entry of videoDataArray) {
      try {
        const blob = this._base64ToBlob(entry.base64, entry.fileType || 'video/mp4');
        const file = new File([blob], entry.fileName || 'video.mp4', { type: entry.fileType || 'video/mp4' });

        await new Promise((resolve, reject) => {
          const transaction = db.transaction([this.storeName], 'readwrite');
          const store = transaction.objectStore(this.storeName);
          const request = store.put({
            id: entry.id,
            file: file,
            savedAt: entry.savedAt || Date.now()
          });
          request.onsuccess = () => { count++; resolve(); };
          request.onerror = () => reject(request.error);
        });
      } catch (e) {
        console.warn('Could not import video:', entry.id, e);
      }
    }

    return count;
  },

  /**
   * Convert Blob/File to base64 string
   */
  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  /**
   * Convert base64 data URL to Blob
   */
  _base64ToBlob(base64, type) {
    const parts = base64.split(',');
    const byteString = atob(parts[1] || parts[0]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type });
  },

  /**
   * Format file size
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * Format duration
   */
  formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
};

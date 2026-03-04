/**
 * Migration Manager Module
 * Handles version-to-version data migrations and schema updates
 */
const MigrationManager = {
  STORAGE_KEY: 'flowMigrationVersion',
  _currentVersion: '6.0',
  _appliedMigrations: [],

  /**
   * รายการ migration ทั้งหมดเรียงตามลำดับ version
   */
  _migrations: [
    { from: '5.0', to: '5.1', method: 'migrate_5_0_to_5_1' },
    { from: '5.1', to: '6.0', method: 'migrate_5_1_to_6_0' }
  ],

  /**
   * Initialize migration manager
   * เช็คว่ามี migration ที่ต้องรันหรือไม่
   */
  async init() {
    try {
      const currentVersion = await this.getMigrationVersion();
      console.log('[MigrationManager] current data version:', currentVersion);

      if (currentVersion !== this._currentVersion) {
        console.log('[MigrationManager] migration needed:', currentVersion, '->', this._currentVersion);
        await this.runMigrations();
      } else {
        console.log('[MigrationManager] data is up to date');
      }
    } catch (err) {
      console.error('[MigrationManager] init failed:', err);
      Helpers.showToast('Migration check failed', 'error');
    }
  },

  /**
   * รัน migrations ทั้งหมดที่ยังไม่ได้ทำ
   * ทำทีละ step ตามลำดับ version
   */
  async runMigrations() {
    try {
      const currentVersion = await this.getMigrationVersion();
      let version = currentVersion || '5.0';

      console.log('[MigrationManager] starting migrations from version:', version);

      for (const migration of this._migrations) {
        if (this._compareVersions(version, migration.from) <= 0) {
          console.log(`[MigrationManager] running migration: ${migration.from} -> ${migration.to}`);

          try {
            // เรียก method ที่กำหนดไว้ในแต่ละ migration
            await this[migration.method]();
            version = migration.to;

            // บันทึกว่า migration นี้เสร็จแล้ว
            this._appliedMigrations.push({
              from: migration.from,
              to: migration.to,
              appliedAt: Date.now()
            });

            // อัพเดท version ใน storage ทุกครั้งที่ทำสำเร็จ
            await this._setMigrationVersion(version);
            console.log(`[MigrationManager] migration ${migration.to} applied successfully`);
          } catch (migrationErr) {
            console.error(`[MigrationManager] migration ${migration.to} failed:`, migrationErr);
            Helpers.showToast(`Migration to v${migration.to} failed`, 'error');
            // หยุดทำต่อถ้า migration ไหนพัง
            return false;
          }
        }
      }

      console.log('[MigrationManager] all migrations complete, version:', version);
      Helpers.showToast('Data migration complete', 'success');
      return true;
    } catch (err) {
      console.error('[MigrationManager] runMigrations error:', err);
      return false;
    }
  },

  /**
   * ดึง version ปัจจุบันจาก storage
   * @returns {Promise<string|null>}
   */
  async getMigrationVersion() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.STORAGE_KEY], (result) => {
        resolve(result[this.STORAGE_KEY] || null);
      });
    });
  },

  /**
   * Migration จาก v5.0 ไป v5.1
   * อัพเดท selector format และ product schema
   */
  async migrate_5_0_to_5_1() {
    console.log('[MigrationManager] migrate_5_0_to_5_1: updating selectors...');

    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['flowProducts', 'flowCategories'], resolve);
    });

    const products = result.flowProducts || [];
    const categories = result.flowCategories || [];

    // อัพเดท product schema: เพิ่ม field ใหม่
    const updatedProducts = products.map(product => ({
      ...product,
      // เพิ่ม field ที่ v5.1 ต้องการ
      thumbnailBase64: product.thumbnailBase64 || product.image || null,
      sourceUrl: product.sourceUrl || product.url || '',
      syncedAt: product.syncedAt || Date.now(),
      // อัพเดท selector จาก class-based เป็น data-attribute
      _selectorV51: true
    }));

    // อัพเดท category schema: เพิ่ม sort order
    const updatedCategories = categories.map((cat, index) => ({
      ...cat,
      sortOrder: cat.sortOrder || index,
      isDefault: cat.isDefault || (cat.name === 'Uncategorized')
    }));

    await new Promise((resolve) => {
      chrome.storage.local.set({
        flowProducts: updatedProducts,
        flowCategories: updatedCategories
      }, resolve);
    });

    console.log('[MigrationManager] migrate_5_0_to_5_1: updated', updatedProducts.length, 'products');
  },

  /**
   * Migration จาก v5.1 ไป v6.0
   * เปลี่ยนจาก CSS selectors เป็น icon-based selectors (Radix UI)
   */
  async migrate_5_1_to_6_0() {
    console.log('[MigrationManager] migrate_5_1_to_6_0: updating to icon-based selectors...');

    const result = await new Promise((resolve) => {
      chrome.storage.local.get(
        ['flowProducts', 'flowVideos', 'flowCharacters', 'flowAutomationConfig'],
        resolve
      );
    });

    // อัพเดท video metadata: เพิ่ม duration และ resolution
    const videos = result.flowVideos || [];
    const updatedVideos = videos.map(video => ({
      ...video,
      resolution: video.resolution || '720p',
      durationSec: video.durationSec || 0,
      // ลบ selector เก่าที่ใช้ radix ID
      _legacySelector: undefined,
      _selectorMethod: 'icon-based'
    }));

    // อัพเดท automation config: เปลี่ยน selector strategy
    const config = result.flowAutomationConfig || {};
    const updatedConfig = {
      ...config,
      selectorStrategy: 'icon-based',
      // เปลี่ยนจาก CSS selector เป็น icon name
      modeButtonSelector: 'crop_9_16',
      videoTabSelector: 'videocam',
      portraitSelector: 'crop_portrait',
      // เพิ่ม retry config
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 2000,
      // เพิ่ม scene detection config
      sceneDetection: {
        enabled: true,
        method: 'auto',
        maxScenes: config.sceneCount || 4
      }
    };

    // อัพเดท character data: เพิ่ม gender field
    const characters = result.flowCharacters || [];
    const updatedCharacters = characters.map(char => ({
      ...char,
      gender: char.gender || 'female',
      voiceId: char.voiceId || null,
      _migratedToV6: true
    }));

    await new Promise((resolve) => {
      chrome.storage.local.set({
        flowVideos: updatedVideos,
        flowAutomationConfig: updatedConfig,
        flowCharacters: updatedCharacters
      }, resolve);
    });

    console.log('[MigrationManager] migrate_5_1_to_6_0: updated', updatedVideos.length, 'videos,', updatedCharacters.length, 'characters');
  },

  /**
   * Rollback migration กลับไป version ที่ต้องการ
   * @param {string} targetVersion - version ที่ต้องการ rollback ไป
   */
  async rollbackMigration(targetVersion) {
    try {
      console.log('[MigrationManager] rolling back to version:', targetVersion);

      // เช็คว่า version ที่ต้องการมีอยู่จริง
      const validVersions = ['5.0', '5.1', '6.0'];
      if (!validVersions.includes(targetVersion)) {
        console.error('[MigrationManager] invalid rollback version:', targetVersion);
        Helpers.showToast('Invalid rollback version', 'error');
        return false;
      }

      // อัพเดท version กลับ
      await this._setMigrationVersion(targetVersion);

      // ลบ migration records หลัง target version
      this._appliedMigrations = this._appliedMigrations.filter(m => {
        return this._compareVersions(m.to, targetVersion) <= 0;
      });

      console.log('[MigrationManager] rolled back to:', targetVersion);
      Helpers.showToast(`Rolled back to v${targetVersion}`, 'info');
      return true;
    } catch (err) {
      console.error('[MigrationManager] rollback error:', err);
      Helpers.showToast('Rollback failed', 'error');
      return false;
    }
  },

  /**
   * ดึงรายการ migrations ที่ applied แล้ว
   * @returns {Array}
   */
  getAppliedMigrations() {
    return [...this._appliedMigrations];
  },

  /**
   * บันทึก version ลง storage (internal)
   */
  async _setMigrationVersion(version) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: version }, resolve);
    });
  },

  /**
   * เปรียบเทียบ version strings (internal)
   * @returns {number} -1, 0, 1
   */
  _compareVersions(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA < numB) return -1;
      if (numA > numB) return 1;
    }
    return 0;
  }
};

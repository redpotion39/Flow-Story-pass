/**
 * UGC Section Module
 * Handles UGC (User Generated Content) character settings
 * Section is enabled when no person image is uploaded
 */
const UGCSection = {
  section: null,
  badge: null,
  genderSelect: null,
  ageRangeSelect: null,

  /**
   * Initialize UGC section
   */
  init() {
    this.section = document.getElementById('ugcSection');
    this.badge = document.getElementById('ugcBadge');
    this.genderSelect = document.getElementById('gender');
    this.ageRangeSelect = document.getElementById('ageRange');

    this.updateState();
  },

  /**
   * Update section state based on person image
   * ถ้ามีภาพคน = ซ่อน section, ถ้าไม่มี = แสดง section
   */
  updateState() {
    const hasPersonImage = ImageUpload.hasPersonImage();

    if (hasPersonImage) {
      this.hide();
    } else {
      this.show();
    }
  },

  /**
   * Show UGC section (when no person image)
   */
  show() {
    this.section.hidden = false;
    this.badge.textContent = 'Active';
    this.badge.classList.remove('inactive');
  },

  /**
   * Hide UGC section (when has person image)
   */
  hide() {
    this.section.hidden = true;
    this.badge.textContent = 'Inactive';
    this.badge.classList.add('inactive');
  },

  /**
   * Get UGC settings
   * @returns {{gender: string, ageRange: string}}
   */
  getSettings() {
    return {
      gender: this.genderSelect.value,
      ageRange: this.ageRangeSelect.value
    };
  },

  /**
   * Check if UGC is active
   * @returns {boolean}
   */
  isActive() {
    return !ImageUpload.hasPersonImage();
  },

  /**
   * Reset UGC settings
   */
  reset() {
    this.genderSelect.value = '';
    this.ageRangeSelect.value = '';
  }
};

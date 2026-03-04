/**
 * Image Utils Module
 * Handles image resizing and processing
 */
const ImageUtils = {
  MAX_SIZE: 1000,

  /**
   * Resize image if larger than MAX_SIZE
   * @param {string} base64Image - Base64 encoded image
   * @returns {Promise<string>} - Resized base64 image
   */
  async resizeImage(base64Image) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;

        // Check if resize needed
        if (width <= this.MAX_SIZE && height <= this.MAX_SIZE) {
          resolve(base64Image);
          return;
        }

        // Calculate new dimensions
        let newWidth, newHeight;
        if (width > height) {
          newWidth = this.MAX_SIZE;
          newHeight = Math.round((height / width) * this.MAX_SIZE);
        } else {
          newHeight = this.MAX_SIZE;
          newWidth = Math.round((width / height) * this.MAX_SIZE);
        }

        // Create canvas and resize
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        // Get resized image
        const resizedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        resolve(resizedBase64);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = base64Image;
    });
  },

  /**
   * Extract base64 data from data URL
   * @param {string} dataUrl - Data URL
   * @returns {string} - Base64 data without prefix
   */
  getBase64Data(dataUrl) {
    return dataUrl.split(',')[1];
  },

  /**
   * Get MIME type from data URL
   * @param {string} dataUrl - Data URL
   * @returns {string} - MIME type
   */
  getMimeType(dataUrl) {
    const match = dataUrl.match(/data:([^;]+);/);
    return match ? match[1] : 'image/jpeg';
  }
};

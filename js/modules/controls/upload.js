/**
 * Controls Upload Module
 * Handles uploading product and person images to web pages
 */

Object.assign(Controls, {

  /**
   * Handle Upload Product button - อัพโหลดภาพคน/ตัวละครไปยังหน้าเว็บ
   */
  async handleUploadProduct() {
    const personImage = await ImageUpload.getPersonImage();

    if (!personImage) {
      console.log('[Upload] ไม่มีภาพคน — ข้าม');
      Helpers.showToast('ไม่มีภาพ — ข้ามขั้นตอนอัพโหลด', 'info');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await this.uploadPersonToWeb(tab, personImage);
  },

  /**
   * Upload image to web page (reusable for product/character)
   */
  async uploadImageToWeb(imageBase64) {
    if (!imageBase64) {
      throw new Error('ไม่มีรูปภาพ');
    }

    const selectors = await loadWasmSelectors();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!this.canScriptTab(tab)) {
      throw new Error('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน');
    }

    // Step 1: Click add button (robust: หาจาก icon text "add")
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => {
        // Strategy 1: ใช้ selector ตรง
        let icon = document.querySelector(sel);
        if (icon && icon.textContent.trim() === 'add') {
          icon.closest('button')?.click() || icon.click();
          return 'selector';
        }
        // Strategy 2: หา i.google-symbols ที่มี text "add"
        const icons = document.querySelectorAll('i.google-symbols');
        for (const i of icons) {
          if (i.textContent.trim() === 'add') {
            i.closest('button')?.click() || i.click();
            return 'google-symbols';
          }
        }
        // Strategy 3: หา icon ใดก็ได้ที่มี text "add" ใน button
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
          const i = button.querySelector('i');
          if (i && i.textContent.trim() === 'add') {
            button.click();
            return 'button-scan';
          }
        }
        console.log('[Upload] ไม่พบปุ่ม add');
        return false;
      },
      args: [selectors.addButton]
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Upload file directly (retry สูงสุด 5 ครั้ง รอ dialog render)
    let uploadResult = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (base64Image, fileInputSel) => {
          const byteString = atob(base64Image.split(',')[1]);
          const mimeType = base64Image.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([ab], { type: mimeType });
          const file = new File([blob], 'uploaded-image.png', { type: mimeType });

          // หา file input หลาย strategy
          const fileInput = document.querySelector(fileInputSel) ||
                           document.querySelector('[role="dialog"] input[type="file"]') ||
                           document.querySelector('[id^="radix-"] input[type="file"]') ||
                           document.querySelector('input[type="file"][accept*="image"]') ||
                           document.querySelector('input[type="file"]');

          if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true }));
            return 'input';
          }
          return false;
        },
        args: [imageBase64, selectors.fileInput]
      });

      if (results && results[0] && results[0].result) {
        uploadResult = true;
        console.log(`[Upload] File input found on attempt ${attempt + 1}`);
        break;
      }
      console.log(`[Upload] File input not found, retry ${attempt + 1}/5...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    if (uploadResult) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Click confirm
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (confirmSel) => {
          const confirmBtn = document.querySelector(confirmSel);
          if (confirmBtn) {
            confirmBtn.click();
            return true;
          }
          const buttons = document.querySelectorAll('[id^="radix-"] button, [role="dialog"] button');
          for (const btn of buttons) {
            const text = btn.textContent.toLowerCase();
            if (text.includes('use') || text.includes('apply') || text.includes('confirm') || text.includes('select')) {
              btn.click();
              return true;
            }
          }
          return false;
        },
        args: [selectors.confirmButton]
      });

      Helpers.showToast('อัพโหลดภาพแล้ว', 'success');
    } else {
      throw new Error('ไม่พบช่องอัพโหลด');
    }
  },

  /**
   * Upload person image to web (WASM selectors)
   */
  async uploadPersonToWeb(tab, personImage) {
    const selectors = await loadWasmSelectors();

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel) => {
          // Strategy 1: ใช้ selector ตรง
          let icon = document.querySelector(sel);
          if (icon && icon.textContent.trim() === 'add') {
            icon.closest('button')?.click() || icon.click();
            return 'selector';
          }
          // Strategy 2: หา i.google-symbols ที่มี text "add"
          const icons = document.querySelectorAll('i.google-symbols');
          for (const i of icons) {
            if (i.textContent.trim() === 'add') {
              i.closest('button')?.click() || i.click();
              return 'google-symbols';
            }
          }
          // Strategy 3: หา icon ใดก็ได้ที่มี text "add" ใน button
          const allButtons = document.querySelectorAll('button');
          for (const button of allButtons) {
            const i = button.querySelector('i');
            if (i && i.textContent.trim() === 'add') {
              button.click();
              return 'button-scan';
            }
          }
          console.log('[Upload Person] ไม่พบปุ่ม add');
          return false;
        },
        args: [selectors.addButton]
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Retry หา file input สูงสุด 5 ครั้ง
      let personUploadResult = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (base64Image, fileInputSel) => {
            const byteString = atob(base64Image.split(',')[1]);
            const mimeType = base64Image.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeType });
            const file = new File([blob], 'person-image.png', { type: mimeType });

            const fileInput = document.querySelector(fileInputSel) ||
                             document.querySelector('[role="dialog"] input[type="file"]') ||
                             document.querySelector('[id^="radix-"] input[type="file"]') ||
                             document.querySelector('input[type="file"][accept*="image"]') ||
                             document.querySelector('input[type="file"]');

            if (fileInput) {
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              fileInput.files = dataTransfer.files;
              fileInput.dispatchEvent(new Event('change', { bubbles: true }));
              fileInput.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
            return false;
          },
          args: [personImage, selectors.fileInput]
        });

        if (results && results[0] && results[0].result) {
          personUploadResult = true;
          console.log(`[Upload Person] File input found on attempt ${attempt + 1}`);
          break;
        }
        console.log(`[Upload Person] File input not found, retry ${attempt + 1}/5...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      if (personUploadResult) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (confirmSel) => {
            const confirmBtn = document.querySelector(confirmSel);
            if (confirmBtn) {
              confirmBtn.click();
              return true;
            }
            const buttons = document.querySelectorAll('[id^="radix-"] button');
            for (const btn of buttons) {
              const text = btn.textContent.toLowerCase();
              if (text.includes('use') || text.includes('apply') || text.includes('confirm') || text.includes('select')) {
                btn.click();
                return true;
              }
            }
            return false;
          },
          args: [selectors.confirmButton]
        });

        Helpers.showToast('อัพโหลดภาพคนแล้ว', 'success');
      }
    } catch (error) {
      console.error('Upload person error:', error);
      Helpers.showToast('อัพโหลดภาพคนไม่สำเร็จ', 'error');
    }
  },

  /**
   * Handle Upload Character button
   */
  handleUploadCharacter() {
    document.getElementById('personImageInput').click();
  },

});

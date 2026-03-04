/**
 * Controls Download Module
 * Handles video downloading, naming, and fallback methods
 */

Object.assign(Controls, {

  /**
   * Handle Download button - ดาวน์โหลดวิดีโอพร้อมตั้งชื่อเอง
   * @param {string} customFilename - ชื่อไฟล์ที่ต้องการ (ไม่ต้องใส่ .mp4)
   */
  async handleDownload(customFilename = null) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return { success: false, reason: 'invalid_tab' };
      }

      // Step 1: กดปุ่ม download บนหน้าเว็บ ด้วย CDP (isTrusted: true)
      const posResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const icons = document.querySelectorAll('#__next i.google-symbols, #__next span.google-symbols');
          for (const icon of icons) {
            if (icon.textContent.trim() === 'download') {
              const btn = icon.closest('button') || icon.closest('a');
              if (btn) {
                const r = btn.getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'icon-btn' };
              }
              // icon ไม่ได้อยู่ใน button → คลิก icon ตรงๆ
              const r = icon.getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'icon-direct' };
            }
          }
          return null;
        }
      });

      const pos = posResult?.[0]?.result;
      if (pos) {
        const debuggee = { tabId: tab.id };
        await chrome.debugger.attach(debuggee, '1.3');
        try {
          await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1
          });
          await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1
          });
        } finally {
          try { await chrome.debugger.detach(debuggee); } catch (e) { /* ignore */ }
        }
        Helpers.showToast('กดปุ่ม Download แล้ว — รอเมนู 720p...', 'info');

        // Step 2: รอเมนูเปิด แล้วกด 720p
        await delay(1500);

        const menuPos = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // หา menuitem ที่มี "720p" ใน Radix dropdown menu
            const items = document.querySelectorAll('[role="menuitem"], [data-radix-collection-item]');
            for (const item of items) {
              if (item.textContent.includes('720p')) {
                const r = item.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                  return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'menuitem-720p' };
                }
              }
            }
            return null;
          }
        });

        const mPos = menuPos?.[0]?.result;
        if (mPos) {
          const debuggee2 = { tabId: tab.id };
          await chrome.debugger.attach(debuggee2, '1.3');
          try {
            await chrome.debugger.sendCommand(debuggee2, 'Input.dispatchMouseEvent', {
              type: 'mousePressed', x: mPos.x, y: mPos.y, button: 'left', clickCount: 1
            });
            await chrome.debugger.sendCommand(debuggee2, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased', x: mPos.x, y: mPos.y, button: 'left', clickCount: 1
            });
          } finally {
            try { await chrome.debugger.detach(debuggee2); } catch (e) { /* ignore */ }
          }
          Helpers.showToast('กดดาวน์โหลด 720p แล้ว', 'success');
        } else {
          Helpers.showToast('ไม่พบตัวเลือก 720p — เมนูอาจยังไม่เปิด', 'error');
        }
        return { success: true, method: 'cdp_click_720p' };
      }

      // Fallback: หา URL ดาวน์โหลดเอง (กรณีไม่มีปุ่ม download บนหน้าเว็บ)
      let videoUrl = this.lastExportUrl;

      if (!videoUrl) {
        videoUrl = await this.findExportDownloadLink(tab);
      }

      if (!videoUrl) {
        videoUrl = await this.fetchVideoUrl(tab);
      }

      if (!videoUrl) {
        const capturedUrl = await this.clickAndCaptureDownloadUrl(tab);
        if (capturedUrl) {
                    this.lastExportUrl = null;
          Helpers.showToast('ดาวน์โหลดแล้ว + บันทึกเข้าคลัง', 'success');
          return { success: true, method: 'click_and_store' };
        }
      }

      if (videoUrl) {
        const filename = this.generateDownloadFilename(customFilename);
        await this.downloadVideoWithName(videoUrl, filename);
        this.lastExportUrl = null;
        Helpers.showToast(`กำลังดาวน์โหลด: ${filename}`, 'success');
        return { success: true, filename };
      } else {
        Helpers.showToast('ไม่พบปุ่ม/ลิงก์ดาวน์โหลด', 'warning');
        return { success: false, reason: 'no_url' };
      }
    } catch (error) {
      console.error('Download error:', error);
      Helpers.showToast('ดาวน์โหลดไม่สำเร็จ', 'error');
      return { success: false, reason: 'error', error: error.message };
    }
  },

  /**
   * กดปุ่ม Download + 720p (ได้วิดีโอรวมทั้งหมด) แล้วเก็บเข้าคลังสินค้า
   *
   * กลยุทธ์: ใช้ chrome.debugger เซสชั่นเดียว
   *   1. Patch revokeObjectURL กัน blob URL ถูกลบ
   *   2. CDP click: Download button + 720p
   *   3. รอ chrome.downloads.onCreated (สัญญาณว่า server สร้างเสร็จ)
   *   4. อ่าน blob จาก URL ที่ยังไม่ถูก revoke
   *   5. เก็บเข้าคลัง
   */
  async handleDownloadAndStore() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return { success: false, reason: 'invalid_tab' };
      }

      // 1. หาตำแหน่งปุ่ม Download
      const posResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const icons = document.querySelectorAll('#__next i.google-symbols, #__next span.google-symbols');
          for (const icon of icons) {
            if (icon.textContent.trim() === 'download') {
              const btn = icon.closest('button') || icon.closest('a');
              if (btn) {
                const r = btn.getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
              }
              const r = icon.getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
          return null;
        }
      });

      const pos = posResult?.[0]?.result;
      if (!pos) {
        Helpers.showToast('ไม่พบปุ่ม Download', 'error');
        return { success: false, reason: 'no_download_btn' };
      }

      // 2. Attach debugger (เซสชั่นเดียวสำหรับทุกอย่าง)
      const debuggee = { tabId: tab.id };
      await chrome.debugger.attach(debuggee, '1.3');

      // 3. Patch revokeObjectURL กัน blob URL ถูกลบ
      await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
        expression: `(() => {
          window.__flowDeferredRevokes = [];
          const origRevoke = URL.revokeObjectURL;
          URL.revokeObjectURL = function(url) {
            if (url && url.startsWith('blob:')) {
              window.__flowDeferredRevokes.push(url);
              console.log('[Flow] Deferred revoke:', url);
              return;
            }
            return origRevoke.call(URL, url);
          };
          window.__flowOrigRevoke = origRevoke;
        })()`
      });

      // 4. ตั้ง downloads.onCreated listener รอ server สร้างวิดีโอเสร็จ
      const downloadStartPromise = new Promise((resolve) => {
        let resolved = false;
        const listener = (downloadItem) => {
          if (!resolved) {
            resolved = true;
            chrome.downloads.onCreated.removeListener(listener);
            resolve(downloadItem.url);
          }
        };
        chrome.downloads.onCreated.addListener(listener);
        // Timeout 120 วินาที (server อาจใช้เวลานานในการสร้างวิดีโอรวม)
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            chrome.downloads.onCreated.removeListener(listener);
            resolve(null);
          }
        }, 120000);
      });

      try {
        // 5. CDP click: Download button
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1
        });
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1
        });
        Helpers.showToast('กดปุ่ม Download — รอเมนู 720p...', 'info');
        await delay(1500);

        // 6a. หา + hover "Full Video" submenu ก่อน (เว็บใหม่เป็น submenu)
        const fullVideoPos = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const items = document.querySelectorAll('[role="menuitem"], [data-radix-collection-item]');
            for (const item of items) {
              if (item.textContent.includes('Full Video')) {
                const r = item.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                }
              }
            }
            return null;
          }
        });

        const fvPos = fullVideoPos?.[0]?.result;
        if (fvPos) {
          // Hover เข้า "Full Video" เพื่อเปิด submenu
          await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: fvPos.x, y: fvPos.y
          });
          await delay(500);
          // Click เพื่อเปิด submenu (บางกรณี hover อย่างเดียวไม่พอ)
          await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x: fvPos.x, y: fvPos.y, button: 'left', clickCount: 1
          });
          await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: fvPos.x, y: fvPos.y, button: 'left', clickCount: 1
          });
          Helpers.showToast('เปิดเมนู Full Video — รอ 720p...', 'info');
          await delay(1000);
        }

        // 6b. หา + CDP click: 720p menuitem (ใน submenu ของ Full Video)
        const menuPos = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const items = document.querySelectorAll('[role="menuitem"], [data-radix-collection-item]');
            for (const item of items) {
              if (item.textContent.includes('720p')) {
                const r = item.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                }
              }
            }
            return null;
          }
        });

        const mPos = menuPos?.[0]?.result;
        if (!mPos) {
          Helpers.showToast('ไม่พบตัวเลือก 720p', 'error');
          return { success: false, reason: 'no_720p' };
        }

        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: mPos.x, y: mPos.y, button: 'left', clickCount: 1
        });
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: mPos.x, y: mPos.y, button: 'left', clickCount: 1
        });
        Helpers.showToast('กด 720p — รอ server สร้างวิดีโอรวม...', 'info');

        // 7. รอ download event (สัญญาณว่า server เสร็จ + blob พร้อม)
        const blobUrl = await downloadStartPromise;

        if (!blobUrl) {
          Helpers.showToast('Timeout — ไม่มี download event (120 วินาที)', 'warning');
          return { success: true, method: 'download_only' };
        }

        console.log('[DownloadAndStore] Download started, URL:', blobUrl.substring(0, 80));

        // 8. อ่าน blob จาก page context (blob URL ยังไม่ถูก revoke เพราะเรา patch ไว้)
        if (blobUrl.startsWith('blob:')) {
          Helpers.showToast('จับวิดีโอแล้ว — กำลังเก็บเข้าคลัง...', 'info');

          const readResult = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
            expression: `(async () => {
              try {
                const blobUrl = '${blobUrl.replace(/'/g, "\\'")}';
                const response = await fetch(blobUrl);
                const blob = await response.blob();
                console.log('[Flow] Read blob OK:', blob.size, 'bytes');
                return new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.onerror = () => resolve(null);
                  reader.readAsDataURL(blob);
                });
              } catch (e) {
                console.warn('[Flow] Blob read failed:', e.message);
                return null;
              }
            })()`,
            awaitPromise: true,
            returnByValue: true
          });

          const dataUrl = readResult?.result?.value;
          if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const filename = this.generateDownloadFilename();
            console.log('[DownloadAndStore] Got blob:', blob.size, 'bytes');
            Helpers.showToast('ดาวน์โหลด 720p + บันทึกเข้าคลังแล้ว', 'success');
            return { success: true, method: 'download_and_store' };
          }
        }

        // URL ไม่ใช่ blob → ลอง fetch ตรง
        if (blobUrl && !blobUrl.startsWith('blob:')) {
          const filename = this.generateDownloadFilename();
          Helpers.showToast('ดาวน์โหลด 720p + บันทึกเข้าคลังแล้ว', 'success');
          return { success: true, method: 'download_and_store' };
        }

        Helpers.showToast('ดาวน์โหลด 720p แล้ว แต่เก็บคลังไม่ได้', 'warning');
        return { success: true, method: 'download_only' };

      } finally {
        // 9. Cleanup: restore revokeObjectURL + revoke deferred URLs + detach debugger
        try {
          await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
            expression: `(() => {
              if (window.__flowOrigRevoke) {
                URL.revokeObjectURL = window.__flowOrigRevoke;
                (window.__flowDeferredRevokes || []).forEach(u => URL.revokeObjectURL(u));
                delete window.__flowOrigRevoke;
                delete window.__flowDeferredRevokes;
              }
            })()`
          });
        } catch (e) { /* ignore */ }
        try { await chrome.debugger.detach(debuggee); } catch (e) { /* ignore */ }
      }
    } catch (error) {
      console.error('[DownloadAndStore] Error:', error);
      Helpers.showToast('ดาวน์โหลดไม่สำเร็จ: ' + error.message, 'error');
      return { success: false, reason: 'error', error: error.message };
    }
  },

  /**
   * หาลิงก์ดาวน์โหลดที่โผล่บนหน้าเว็บหลัง export เสร็จ (อ่าน href เท่านั้น ไม่คลิก)
   */
  async findExportDownloadLink(tab) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Strategy 1: หา <a> ที่มี href ไป storage.googleapis.com
          const links = document.querySelectorAll('#__next section a, #__next a[href*="storage"], #__next a[download]');
          for (const link of links) {
            if (link.href && (link.href.includes('storage.googleapis.com') || link.hasAttribute('download'))) {
              return link.href;
            }
          }

          // Strategy 2: หา <a> ใน section ol li (ตาม selector จริงของเว็บ)
          const sectionLink = document.querySelector('#__next section ol li a');
          if (sectionLink && sectionLink.href && sectionLink.href !== '' && !sectionLink.href.endsWith('#')) {
            return sectionLink.href;
          }

          // Strategy 3: หา <a> ใดก็ได้ที่มี href ที่ดูเหมือน video URL
          const allLinks = document.querySelectorAll('#__next a[href]');
          for (const link of allLinks) {
            if (link.href && (
              link.href.includes('storage.googleapis.com') ||
              link.href.includes('ai-sandbox') ||
              link.href.includes('videofx') ||
              link.href.match(/\.(mp4|webm|mov)/i)
            )) {
              return link.href;
            }
          }

          // Strategy 4: หา <a> ที่มี text "download" (case insensitive)
          const allAnchors = document.querySelectorAll('#__next a');
          for (const a of allAnchors) {
            const text = a.textContent.toLowerCase().trim();
            if (text === 'download' || text.includes('download')) {
              if (a.href && a.href !== '' && !a.href.endsWith('#') && a.href !== window.location.href) {
                return a.href;
              }
            }
          }

          return null;
        }
      });

      if (results && results[0] && results[0].result) {
        console.log('[Download] Found export URL from href:', results[0].result.substring(0, 100) + '...');
        return results[0].result;
      }
      return null;
    } catch (error) {
      console.error('[Download] Error finding export link:', error);
      return null;
    }
  },

  /**
   * คลิกลิงก์ดาวน์โหลดบนหน้าเว็บ แล้วดัก URL จริงจาก chrome.downloads.onCreated
   * ใช้เมื่อ <a> ไม่มี href — browser จะโหลดไฟล์ให้เลย (ชื่อ default)
   * คืน URL จริง หรือ null ถ้าไม่เจอ
   */
  async clickAndCaptureDownloadUrl(tab) {
    return new Promise((resolve) => {
      let resolved = false;

      const listener = (downloadItem) => {
        if (!resolved) {
          resolved = true;
          chrome.downloads.onCreated.removeListener(listener);
          // ปล่อยให้ browser โหลดตามปกติ (ไม่ cancel)
          console.log('[Download] Captured URL from click:', downloadItem.url.substring(0, 100) + '...');
          resolve(downloadItem.url);
        }
      };
      chrome.downloads.onCreated.addListener(listener);

      // คลิกลิงก์ดาวน์โหลดบนหน้าเว็บ
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Strategy 1: หา <a> ใน section ol li
          const sectionLink = document.querySelector('#__next section ol li a');
          if (sectionLink) { sectionLink.click(); return 'section-li'; }

          // Strategy 2: หา <a> ที่มี text "download"
          const allLinks = document.querySelectorAll('#__next a');
          for (const link of allLinks) {
            const text = link.textContent.trim().toLowerCase();
            if (text === 'download' || text.includes('download')) {
              link.click(); return 'download-text';
            }
          }

          // Strategy 3: หา <a> ที่มี download icon
          for (const link of allLinks) {
            const icon = link.querySelector('i, span');
            if (icon && (icon.textContent.trim() === 'download' || icon.textContent.trim() === 'file_download')) {
              link.click(); return 'download-icon';
            }
          }

          // Strategy 4: หา button ที่มี text/icon "download" (บางเว็บใช้ button แทน a)
          const allBtns = document.querySelectorAll('#__next button');
          for (const btn of allBtns) {
            const text = btn.textContent.trim().toLowerCase();
            if (text === 'download' || text.includes('download')) {
              btn.click(); return 'download-btn';
            }
          }

          console.log('[Download] ไม่พบลิงก์ดาวน์โหลดที่คลิกได้');
          return false;
        }
      });

      // Timeout 15 วินาที (เพิ่มจาก 10)
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.downloads.onCreated.removeListener(listener);
          console.warn('[Download] Timeout waiting for download event');
          resolve(null);
        }
      }, 15000);
    });
  },

  /**
   * ดึง Video ID จาก URL (ใช้สำหรับเช็คซ้ำ)
   */
  extractVideoId(url) {
    try {
      // URL format: https://storage.googleapis.com/ai-sandbox-videofx/video/UUID?...
      const match = url.match(/\/video\/([a-f0-9-]+)/i) ||
                    url.match(/\/image\/([a-f0-9-]+)/i);
      if (match) {
        return match[1];
      }
      // Fallback: ใช้ path ก่อน query string
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      // ถ้า parse ไม่ได้ ใช้ 100 ตัวแรกของ URL
      return url.substring(0, 100);
    }
  },

  /**
   * ล้างรายการ URL ที่ดาวน์โหลดแล้ว (เรียกตอนเริ่ม automation ใหม่)
   */
  clearDownloadedUrls() {
    this.downloadedUrls.clear();
    console.log('[Download] Cleared downloaded URLs history');
  },

  /**
   * ดึง URL วิดีโอจากหน้าเว็บ
   */
  async fetchVideoUrl(tab) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // วิธี 1: หา video element ที่กำลังเล่น
          const videos = document.querySelectorAll('video');
          for (const video of videos) {
            if (video.src && video.src.includes('storage.googleapis.com')) {
              return video.src;
            }
            // เช็ค source element
            const source = video.querySelector('source');
            if (source && source.src && source.src.includes('storage.googleapis.com')) {
              return source.src;
            }
          }

          // วิธี 2: หาจาก video ที่ selected/active
          const selectedVideo = document.querySelector('video[src*="ai-sandbox-videofx"]');
          if (selectedVideo) {
            return selectedVideo.src;
          }

          // วิธี 3: หาจาก blob URL แล้ว trace กลับ
          for (const video of videos) {
            if (video.src && !video.src.startsWith('blob:')) {
              return video.src;
            }
          }

          return null;
        }
      });

      if (results && results[0] && results[0].result) {
        console.log('[Download] Found video URL:', results[0].result.substring(0, 100) + '...');
        return results[0].result;
      }

      return null;
    } catch (error) {
      console.error('[Download] Error fetching video URL:', error);
      return null;
    }
  },

  /**
   * สร้างโฟลเดอร์ session สำหรับ automation run
   * เรียกครั้งเดียวตอนเริ่ม automation → ทุกไฟล์จะลงโฟลเดอร์เดียวกัน
   * รูปแบบ: FlowStory_YYYY-MM-DD_HH-mm-ss
   */
  initSessionFolder() {
    const now = new Date();
    const dateStr = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') + '-' +
      String(now.getMinutes()).padStart(2, '0') + '-' +
      String(now.getSeconds()).padStart(2, '0');

    this.sessionFolderName = `FlowStory_${dateStr}`;
    console.log('[Download] Session folder:', this.sessionFolderName);
  },

  /**
   * สร้างชื่อไฟล์สำหรับดาวน์โหลด
   * รูปแบบ: sessionFolder/scene_01_HHmmss.mp4
   */
  generateDownloadFilename() {
    // สร้าง timestamp สั้นๆ สำหรับแยกไฟล์ในโฟลเดอร์เดียวกัน
    const now = new Date();
    const timeStr = String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    const productId = this.currentProductId || 'video';
    const filename = `${productId}_${timeStr}.mp4`;

    // ใช้ session folder (วันเวลาตอนเริ่ม automation)
    if (this.sessionFolderName) {
      return `${this.sessionFolderName}/${filename}`;
    }

    // fallback: ใช้ downloadFolderName เดิม (กรณีกดดาวน์โหลดเดี่ยว)
    if (this.downloadFolderName) {
      return `${this.downloadFolderName}/${filename}`;
    }

    return filename;
  },

  /**
   * ดาวน์โหลดวิดีโอพร้อมตั้งชื่อ
   */
  async downloadVideoWithName(videoUrl, filename) {
    return new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: videoUrl,
        filename: filename,
        saveAs: false // ดาวน์โหลดอัตโนมัติไม่ต้องถาม
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('[Download] Error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('[Download] Started download:', downloadId, filename);
          resolve(downloadId);
        }
      });
    });
  },

  /**
   * Set current character info for download naming
   * @param {string} productId - Character ID (ใช้ตั้งชื่อไฟล์ ไม่มีภาษาไทย)
   * @param {string} productName - Character name (ใช้ตั้งชื่อโฟลเดอร์ ภาษาไทยได้)
   */
  setCurrentProduct(productId, productName = '') {
    this.currentProductId = productId || '';
    this.currentProductName = productName || '';

    // ตั้งชื่อโฟลเดอร์จากชื่อตัวละคร (ภาษาไทยได้)
    if (productName) {
      const safeName = productName
        .trim()
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 80);
      this.downloadFolderName = safeName;
    } else {
      this.downloadFolderName = '';
    }

    console.log('[Download] Character set:', this.currentProductId, '| Folder:', this.downloadFolderName);
  },

  /**
   * Fetch video and store both to disk (chrome.downloads) AND extension (IndexedDB)
   * ใช้ URL จาก handleExportVideo() (this.lastExportUrl) หรือ fallback
   */
  async fetchAndStore() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return { success: false, reason: 'invalid_tab' };
      }

      // 1. หา URL: ใช้จาก lastExportUrl (จาก handleExportVideo) หรือ fallback
      // 1. หา URL: ใช้จาก lastExportUrl → href บนหน้าเว็บ → <video> element
      let videoUrl = this.lastExportUrl;
      if (!videoUrl) {
        videoUrl = await this.findExportDownloadLink(tab);
      }
      if (!videoUrl) {
        videoUrl = await this.fetchVideoUrl(tab);
      }

      // 2a. มี URL จาก href → โหลดด้วย chrome.downloads (custom filename)
      if (videoUrl) {
        const urlKey = this.extractVideoId(videoUrl);
        if (this.downloadedUrls.has(urlKey)) {
          console.log('[FetchAndStore] Duplicate video detected, skipping:', urlKey);
          Helpers.showToast('วิดีโอซ้ำ - ข้ามการดาวน์โหลด', 'warning');
          return { success: false, reason: 'duplicate' };
        }

        const filename = this.generateDownloadFilename();
        await this.downloadVideoWithName(videoUrl, filename);
        console.log('[FetchAndStore] Downloaded to disk:', filename);
        this.downloadedUrls.add(urlKey);
        this.lastExportUrl = null;
        Helpers.showToast(`ดาวน์โหลด + บันทึก: ${filename.split('/').pop()}`, 'success');
        return { success: true, filename };
      }

      // 2b. ไม่เจอ href → คลิกลิงก์ (browser โหลดให้) + ดัก URL
      const capturedUrl = await this.clickAndCaptureDownloadUrl(tab);
      if (capturedUrl) {
        const urlKey = this.extractVideoId(capturedUrl);
        if (this.downloadedUrls.has(urlKey)) {
          console.log('[FetchAndStore] Duplicate video detected, skipping');
          return { success: false, reason: 'duplicate' };
        }
                this.downloadedUrls.add(urlKey);
        this.lastExportUrl = null;
        Helpers.showToast('ดาวน์โหลดแล้ว + บันทึกเข้าคลัง', 'success');
        return { success: true, method: 'click_and_store' };
      }

      Helpers.showToast('ไม่พบลิงก์ดาวน์โหลด', 'warning');
      return { success: false, reason: 'no_url' };

    } catch (error) {
      console.error('[FetchAndStore] Error:', error);
      Helpers.showToast('ดาวน์โหลดไม่สำเร็จ', 'error');
      return { success: false, reason: 'error', error: error.message };
    }
  },

  /**
   * Fallback download method (original click-based)
   */
  async handleDownloadFallback() {
    const selectors = await loadWasmSelectors();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Step 1: Click download button
      const step1 = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (iconSel, iconText) => {
          const icons = document.querySelectorAll(iconSel);
          for (const icon of icons) {
            if (icon.textContent.trim() === iconText) {
              const btn = icon.closest('button');
              if (btn) {
                btn.click();
                return true;
              }
            }
          }
          return false;
        },
        args: [selectors.downloadIcon, selectors.downloadIconText]
      });

      if (!step1 || !step1[0] || !step1[0].result) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 600));

      // Step 2: Select 720p
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (menuItemSel) => {
          const menus = document.querySelectorAll('[role="menu"], [data-radix-menu-content], [data-state="open"]');
          for (const menu of menus) {
            const items = menu.querySelectorAll(menuItemSel);
            for (const item of items) {
              if (item.textContent.includes('720p') || item.textContent.includes('Original size')) {
                item.click();
                return 'menu';
              }
            }
          }

          const popups = document.querySelectorAll('[data-radix-popper-content-wrapper], [role="dialog"], [role="listbox"]');
          for (const popup of popups) {
            const items = popup.querySelectorAll('*');
            for (const item of items) {
              if (item.textContent.trim().includes('720p')) {
                item.click();
                return 'popup';
              }
            }
          }

          const allDivs = document.querySelectorAll('div');
          for (const div of allDivs) {
            const style = window.getComputedStyle(div);
            const zIndex = parseInt(style.zIndex) || 0;
            if (zIndex > 10 && div.textContent.includes('720p')) {
              const clickable = div.querySelector('[role="menuitem"]') || div;
              if (clickable.textContent.includes('720p')) {
                clickable.click();
                return 'overlay';
              }
            }
          }

          return false;
        },
        args: [selectors.menuItem]
      });

      if (results && results[0] && results[0].result) {
        Helpers.showToast('กำลังดาวน์โหลด 720p', 'success');
      }
    } catch (error) {
      console.error('Download fallback error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด', 'error');
    }
  },

});

/**
 * Controls Web Actions Module
 * Handles web page interactions: create, mode switching, select, scenes, settings
 */

Object.assign(Controls, {

  /**
   * Handle Create button — หาจาก icon arrow_forward
   */
  async handleCreate() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      // หาพิกัดปุ่ม Create (arrow_forward)
      const posResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const icons = document.querySelectorAll('#__next i.google-symbols, #__next span.google-symbols');
          for (const icon of icons) {
            if (icon.textContent.trim() === 'arrow_forward') {
              const btn = icon.closest('button');
              if (btn) {
                const r = btn.getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'arrow_forward' };
              }
            }
          }
          return null;
        }
      });

      const pos = posResult?.[0]?.result;
      if (!pos) {
        Helpers.showToast('ไม่พบปุ่มสร้าง (arrow_forward)', 'error');
        return;
      }

      // CDP mouse click (isTrusted: true)
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

      Helpers.showToast('กดสร้างแล้ว', 'success');
    } catch (error) {
      console.error('Create button error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด', 'error');
    }
  },

  /**
   * Handle Video Mode button (WASM selectors)
   */
  async handleVideoMode() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      // Step 1: เปิดเมนู — หาปุ่มที่มี icon crop_9_16 หรือ crop_16_9 (ใช้ CDP mouse)
      const step1Pos = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const icons = document.querySelectorAll('i.google-symbols');
          for (const icon of icons) {
            const t = icon.textContent.trim();
            if (t === 'crop_9_16' || t === 'crop_16_9') {
              const btn = icon.closest('button');
              if (btn) {
                const r = btn.getBoundingClientRect();
                return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, icon: t, text: btn.textContent.trim().substring(0, 40) };
              }
            }
          }
          return { found: false };
        }
      });

      const pos1 = step1Pos?.[0]?.result;
      console.log('[VideoMode] Step 1:', pos1);

      if (!pos1?.found) {
        Helpers.showToast('ไม่พบปุ่มเมนูโหมด', 'error');
        return;
      }

      // CDP mouse click เพื่อเปิด popup (isTrusted: true)
      const debuggee = { tabId: tab.id };
      await chrome.debugger.attach(debuggee, '1.3');
      try {
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: pos1.x, y: pos1.y, button: 'left', clickCount: 1
        });
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: pos1.x, y: pos1.y, button: 'left', clickCount: 1
        });
      } finally {
        try { await chrome.debugger.detach(debuggee); } catch (e) { /* ignore */ }
      }

      // Step 2: รอ popup render แล้วกด Video — retry สูงสุด 8 รอบ
      let found = false;
      for (let i = 0; i < 8 && !found; i++) {
        await new Promise(resolve => setTimeout(resolve, i === 0 ? 1000 : 500));

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const clickBtn = (btn) => {
              btn.focus();
              btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
              btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
              btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              btn.click();
            };

            // Strategy 1: หา button ที่ id ลงท้ายด้วย -trigger-VIDEO (ไม่ใช่ VIDEO_REFERENCES / VIDEO_FRAMES)
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
              if (btn.id && btn.id.endsWith('-trigger-VIDEO')) {
                clickBtn(btn);
                return { clicked: true, method: 'id-trigger-VIDEO', id: btn.id };
              }
            }

            // Strategy 2: หา role="tab" ที่มี text "Video" (ไม่ใช่ Ingredients/Frames)
            const tabs = document.querySelectorAll('[role="tab"]');
            for (const tab of tabs) {
              const text = tab.textContent.trim();
              if (text === 'Video' || text.endsWith('Video')) {
                // เช็คว่าไม่ใช่ sub-tab (Ingredients/Frames)
                if (!text.includes('Ingredient') && !text.includes('Frame')) {
                  clickBtn(tab.closest('button') || tab);
                  return { clicked: true, method: 'role-tab-text', text };
                }
              }
            }

            // Strategy 3: หา class flow_tab_slider_trigger ที่มี text "Video" พอดี
            const triggers = document.querySelectorAll('.flow_tab_slider_trigger');
            for (const t of triggers) {
              const text = t.textContent.trim();
              if (text === 'Video' || text.endsWith('Video')) {
                if (!text.includes('Ingredient') && !text.includes('Frame')) {
                  clickBtn(t);
                  return { clicked: true, method: 'flow_tab_class', text };
                }
              }
            }

            // Strategy 4: หา icon videocam (วิธีเดิม)
            const icons = document.querySelectorAll('i.google-symbols');
            for (const icon of icons) {
              if (icon.textContent.trim() === 'videocam') {
                const btn = icon.closest('button');
                if (btn) {
                  clickBtn(btn);
                  return { clicked: true, method: 'videocam-icon', id: btn.id };
                }
              }
            }

            // Debug
            const dbgIcons = [...document.querySelectorAll('i.google-symbols')].map(i => i.textContent.trim());
            const dbgTabs = [...document.querySelectorAll('[role="tab"]')].map(t => `${t.id?.split('-').pop() || '?'}="${t.textContent.trim().substring(0, 20)}"`);
            return { clicked: false, icons: dbgIcons.slice(0, 10), tabs: dbgTabs };
          }
        });

        const result = results?.[0]?.result;
        console.log(`[VideoMode] Step 2 attempt ${i}:`, result);

        if (result?.clicked) {
          found = true;
        }
      }

      if (!found) {
        Helpers.showToast('ไม่พบปุ่ม Video Mode', 'error');
        return;
      }

      // Step 2.4: กดเลือก Aspect Ratio (Portrait/Landscape) ตามค่า Settings
      const targetRatio = Settings.getAspectRatio();
      const targetLabel = targetRatio === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT';
      const targetText = targetRatio === 'landscape' ? 'Landscape' : 'Portrait';
      await new Promise(resolve => setTimeout(resolve, 500));

      const ratioResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [targetLabel, targetText],
        func: (label, text) => {
          const clickBtn = (btn) => {
            btn.focus();
            btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            btn.click();
          };

          const allButtons = document.querySelectorAll('button');
          for (const btn of allButtons) {
            if (btn.id && btn.id.includes('trigger-' + label)) {
              if (btn.getAttribute('data-state') === 'active') {
                return { clicked: false, alreadyActive: true, method: 'id' };
              }
              clickBtn(btn);
              return { clicked: true, method: 'id-trigger-' + label };
            }
          }

          const tabs = document.querySelectorAll('[role="tab"]');
          for (const tab of tabs) {
            const t = tab.textContent.trim();
            if (t === text || t.includes(text)) {
              if (tab.getAttribute('data-state') === 'active') {
                return { clicked: false, alreadyActive: true, method: 'tab-text' };
              }
              clickBtn(tab.closest('button') || tab);
              return { clicked: true, method: 'role-tab-' + text };
            }
          }

          const triggers = document.querySelectorAll('.flow_tab_slider_trigger');
          for (const t of triggers) {
            if (t.textContent.includes(text)) {
              if (t.getAttribute('data-state') === 'active') {
                return { clicked: false, alreadyActive: true, method: 'class' };
              }
              clickBtn(t);
              return { clicked: true, method: 'flow_tab_' + text };
            }
          }

          return { clicked: false, alreadyActive: false };
        }
      });

      const pResult = ratioResult?.[0]?.result;
      console.log(`[VideoMode] Step 2.4 ${targetText}:`, pResult);

      // Step 2.5: เลือก x1 — หา flow_tab_slider_trigger ที่มี text "x1"
      await new Promise(resolve => setTimeout(resolve, 500));
      const x1Result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const clickBtn = (btn) => {
            btn.focus();
            btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            btn.click();
          };

          // หา flow_tab_slider_trigger ที่มี text "x1"
          const triggers = document.querySelectorAll('.flow_tab_slider_trigger');
          for (const t of triggers) {
            if (t.textContent.trim() === 'x1') {
              if (t.dataset.state === 'active' || t.getAttribute('aria-selected') === 'true') {
                return { clicked: true, method: 'already-active' };
              }
              clickBtn(t);
              return { clicked: true, method: 'flow_tab_x1', text: t.textContent.trim() };
            }
          }

          // Debug
          const dbgTriggers = [...triggers].map(t => `${t.dataset.state}="${t.textContent.trim()}"`);
          return { clicked: false, triggers: dbgTriggers };
        }
      });
      console.log('[VideoMode] Step 2.5 x1:', x1Result?.[0]?.result);

      // Step 2.6: เลือก video model จาก dropdown (ใช้ CDP mouse)
      const videoModelName = Settings.getWebVideoModel();
      console.log('[VideoMode] Step 2.6 target model:', videoModelName);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2.6a: หาพิกัด dropdown button
      const vDropPos = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [videoModelName],
        func: (targetModel) => {
          // หา model dropdown button (มี arrow_drop_down icon)
          const menuBtns = document.querySelectorAll('button[aria-haspopup="menu"]');
          for (const btn of menuBtns) {
            const hasArrow = btn.querySelector('i.google-symbols');
            if (hasArrow && hasArrow.textContent.trim() === 'arrow_drop_down') {
              // เช็คว่าเป็นโมเดลที่ต้องการอยู่แล้วหรือยัง (exact match — ลบ icon text ออก)
              const btnText = btn.textContent.replace('arrow_drop_down', '').trim();
              if (btnText === targetModel) {
                return { alreadySelected: true, text: btnText };
              }
              const r = btn.getBoundingClientRect();
              return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, text: btnText };
            }
          }

          return { found: false };
        }
      });

      const vDropResult = vDropPos?.[0]?.result;
      console.log('[VideoMode] Step 2.6a dropdown:', vDropResult);

      if (vDropResult?.alreadySelected) {
        console.log(`[VideoMode] ${videoModelName} already selected`);
      } else if (vDropResult?.found) {
        // CDP click เปิด dropdown
        const dbg2 = { tabId: tab.id };
        await chrome.debugger.attach(dbg2, '1.3');
        try {
          await chrome.debugger.sendCommand(dbg2, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x: vDropResult.x, y: vDropResult.y, button: 'left', clickCount: 1
          });
          await chrome.debugger.sendCommand(dbg2, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: vDropResult.x, y: vDropResult.y, button: 'left', clickCount: 1
          });
        } finally {
          try { await chrome.debugger.detach(dbg2); } catch (e) { /* ignore */ }
        }

        // 2.6b: รอ menu render แล้วหาพิกัด model item → CDP click
        let vModelFound = false;
        for (let i = 0; i < 6 && !vModelFound; i++) {
          await new Promise(resolve => setTimeout(resolve, i === 0 ? 800 : 400));

          const posResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [videoModelName],
            func: (targetModel) => {
              const items = document.querySelectorAll('[role="menuitem"]');
              for (const item of items) {
                if (item.textContent.includes(targetModel)) {
                  const r = item.getBoundingClientRect();
                  return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, text: item.textContent.trim().substring(0, 40) };
                }
              }

              const dbgItems = [...items].map(i => i.textContent.trim().substring(0, 40));
              return { found: false, items: dbgItems };
            }
          });

          const pos = posResult?.[0]?.result;
          console.log(`[VideoMode] Step 2.6b ${videoModelName} attempt ${i}:`, pos);

          if (pos?.found) {
            // CDP click เลือก model
            const dbg3 = { tabId: tab.id };
            await chrome.debugger.attach(dbg3, '1.3');
            try {
              await chrome.debugger.sendCommand(dbg3, 'Input.dispatchMouseEvent', {
                type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1
              });
              await chrome.debugger.sendCommand(dbg3, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1
              });
            } finally {
              try { await chrome.debugger.detach(dbg3); } catch (e) { /* ignore */ }
            }
            vModelFound = true;
          }
        }

        if (!vModelFound) {
          console.warn(`[VideoMode] ไม่พบ ${videoModelName} ใน dropdown`);
        }
      }

      // Step 3: รอ sub-tab render แล้วกด Ingredients (ป้องกัน default เป็น Frames)
      let ingredientsFound = false;
      for (let i = 0; i < 6 && !ingredientsFound; i++) {
        await new Promise(resolve => setTimeout(resolve, i === 0 ? 1000 : 500));

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const clickBtn = (btn) => {
              btn.focus();
              btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
              btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
              btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              btn.click();
            };

            // Strategy 1: หา button ที่ id มี trigger-VIDEO_REFERENCES
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
              if (btn.id && btn.id.includes('trigger-VIDEO_REFERENCES')) {
                // เช็คว่า active อยู่แล้วหรือยัง
                if (btn.dataset.state === 'active' || btn.getAttribute('aria-selected') === 'true') {
                  return { clicked: true, method: 'already-active', id: btn.id };
                }
                clickBtn(btn);
                return { clicked: true, method: 'id-VIDEO_REFERENCES', id: btn.id };
              }
            }

            // Strategy 2: หา role="tab" ที่มี text "Ingredients"
            const tabs = document.querySelectorAll('[role="tab"]');
            for (const tab of tabs) {
              if (tab.textContent.trim().includes('Ingredient')) {
                if (tab.dataset.state === 'active' || tab.getAttribute('aria-selected') === 'true') {
                  return { clicked: true, method: 'already-active', text: tab.textContent.trim() };
                }
                clickBtn(tab.closest('button') || tab);
                return { clicked: true, method: 'tab-text-Ingredients', text: tab.textContent.trim() };
              }
            }

            // Strategy 3: หา class flow_tab_slider_trigger ที่มี "Ingredients"
            const triggers = document.querySelectorAll('.flow_tab_slider_trigger');
            for (const t of triggers) {
              if (t.textContent.includes('Ingredient')) {
                if (t.dataset.state === 'active' || t.getAttribute('aria-selected') === 'true') {
                  return { clicked: true, method: 'already-active' };
                }
                clickBtn(t);
                return { clicked: true, method: 'flow_tab_Ingredients' };
              }
            }

            // Debug
            const dbgTabs = [...document.querySelectorAll('[role="tab"]')].map(t => `${t.dataset.state}="${t.textContent.trim().substring(0, 20)}"`);
            return { clicked: false, tabs: dbgTabs };
          }
        });

        const result = results?.[0]?.result;
        console.log(`[VideoMode] Step 3 Ingredients attempt ${i}:`, result);

        if (result?.clicked) {
          ingredientsFound = true;
        }
      }

      if (ingredientsFound) {
        Helpers.showToast('เปลี่ยนเป็น Video Mode + Ingredients แล้ว', 'success');
      } else {
        Helpers.showToast('เปลี่ยนเป็น Video Mode แล้ว (ไม่พบ Ingredients)', 'warning');
      }
    } catch (error) {
      console.error('Video mode error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
    }
  },

  /**
   * Handle Image Mode button (WASM selectors)
   */
  async handleImageMode(modelName) {
    try {
      // ถ้าไม่ส่ง parameter → อ่านจาก Settings
      if (!modelName) {
        modelName = Settings.getWebModel();
      }
      console.log('[ImageMode] modelName:', modelName);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      // Step 1: เปิดเมนู — หาปุ่มที่มี icon crop_9_16 หรือ crop_16_9 (ใช้ CDP mouse)
      const step1Pos = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const icons = document.querySelectorAll('i.google-symbols');
          for (const icon of icons) {
            const t = icon.textContent.trim();
            if (t === 'crop_9_16' || t === 'crop_16_9') {
              const btn = icon.closest('button');
              if (btn) {
                const r = btn.getBoundingClientRect();
                return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, icon: t, text: btn.textContent.trim().substring(0, 40) };
              }
            }
          }
          return { found: false };
        }
      });

      const pos1 = step1Pos?.[0]?.result;
      console.log('[ImageMode] Step 1 open menu:', pos1);

      if (!pos1?.found) {
        Helpers.showToast('ไม่พบปุ่มเมนูโหมด (crop_9_16)', 'error');
        return;
      }

      // CDP mouse click เพื่อเปิด popup (isTrusted: true)
      const debuggee = { tabId: tab.id };
      await chrome.debugger.attach(debuggee, '1.3');
      try {
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: pos1.x, y: pos1.y, button: 'left', clickCount: 1
        });
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: pos1.x, y: pos1.y, button: 'left', clickCount: 1
        });
      } finally {
        try { await chrome.debugger.detach(debuggee); } catch (e) { /* ignore */ }
      }

      // Step 2: รอ popup render แล้วกด Image — retry สูงสุด 8 รอบ
      let found = false;
      for (let i = 0; i < 8 && !found; i++) {
        await new Promise(resolve => setTimeout(resolve, i === 0 ? 1000 : 500));

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const clickBtn = (btn) => {
              btn.focus();
              btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
              btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
              btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              btn.click();
            };

            // Strategy 1: หา button ที่ id มี trigger-IMAGE (เสถียรที่สุด)
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
              if (btn.id && btn.id.includes('trigger-IMAGE')) {
                clickBtn(btn);
                return { clicked: true, method: 'id-trigger-IMAGE', id: btn.id };
              }
            }

            // Strategy 2: หา role="tab" ที่มี text "Image"
            const tabs = document.querySelectorAll('[role="tab"]');
            for (const tab of tabs) {
              const text = tab.textContent.trim();
              if (text === 'Image' || text.startsWith('image') || text.endsWith('Image')) {
                clickBtn(tab.closest('button') || tab);
                return { clicked: true, method: 'role-tab-text', text };
              }
            }

            // Strategy 3: หา class flow_tab_slider_trigger ที่มี text "Image"
            const triggers = document.querySelectorAll('.flow_tab_slider_trigger');
            for (const t of triggers) {
              if (t.textContent.includes('Image')) {
                clickBtn(t);
                return { clicked: true, method: 'flow_tab_class', text: t.textContent.trim() };
              }
            }

            // Strategy 4: หา icon "image" ใน i.google-symbols (วิธีเดิม)
            const icons = document.querySelectorAll('i.google-symbols');
            for (const icon of icons) {
              if (icon.textContent.trim() === 'image') {
                const btn = icon.closest('button');
                if (btn) {
                  clickBtn(btn);
                  return { clicked: true, method: 'image-icon', id: btn.id };
                }
              }
            }

            // Debug: log สิ่งที่เจอ
            const dbgIcons = [...document.querySelectorAll('i.google-symbols')].map(i => i.textContent.trim());
            const dbgTabs = [...document.querySelectorAll('[role="tab"]')].map(t => t.textContent.trim().substring(0, 20));
            const dbgTriggers = [...document.querySelectorAll('.flow_tab_slider_trigger')].map(t => t.textContent.trim().substring(0, 20));
            return { clicked: false, icons: dbgIcons.slice(0, 10), tabs: dbgTabs, triggers: dbgTriggers };
          }
        });

        const result = results?.[0]?.result;
        console.log(`[ImageMode] Step 2 attempt ${i}:`, JSON.stringify(result));

        if (result?.clicked) {
          found = true;
        }
      }

      if (!found) {
        Helpers.showToast('ไม่พบปุ่ม Image Mode', 'error');
        return;
      }

      // Step 2.5: กดเลือก Aspect Ratio (Portrait/Landscape) ตามค่า Settings
      const targetRatio = Settings.getAspectRatio();
      const targetLabel = targetRatio === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT';
      const targetText = targetRatio === 'landscape' ? 'Landscape' : 'Portrait';
      await new Promise(resolve => setTimeout(resolve, 500));

      const ratioResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [targetLabel, targetText],
        func: (label, text) => {
          const clickBtn = (btn) => {
            btn.focus();
            btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            btn.click();
          };

          const allButtons = document.querySelectorAll('button');
          for (const btn of allButtons) {
            if (btn.id && btn.id.includes('trigger-' + label)) {
              if (btn.getAttribute('data-state') === 'active') {
                return { clicked: false, alreadyActive: true, method: 'id' };
              }
              clickBtn(btn);
              return { clicked: true, method: 'id-trigger-' + label };
            }
          }

          const tabs = document.querySelectorAll('[role="tab"]');
          for (const tab of tabs) {
            const t = tab.textContent.trim();
            if (t === text || t.includes(text)) {
              if (tab.getAttribute('data-state') === 'active') {
                return { clicked: false, alreadyActive: true, method: 'tab-text' };
              }
              clickBtn(tab.closest('button') || tab);
              return { clicked: true, method: 'role-tab-' + text };
            }
          }

          const triggers = document.querySelectorAll('.flow_tab_slider_trigger');
          for (const t of triggers) {
            if (t.textContent.includes(text)) {
              if (t.getAttribute('data-state') === 'active') {
                return { clicked: false, alreadyActive: true, method: 'class' };
              }
              clickBtn(t);
              return { clicked: true, method: 'flow_tab_' + text };
            }
          }

          return { clicked: false, alreadyActive: false };
        }
      });

      const pResult = ratioResult?.[0]?.result;
      console.log(`[ImageMode] Step 2.5 ${targetText}:`, pResult);

      // Step 3: เลือกโมเดลจาก model dropdown
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 3a: เปิด dropdown — หาปุ่มที่มี aria-haspopup="menu" และ arrow_drop_down icon
      const dropdownOpened = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [modelName],
        func: (targetModel) => {
          const clickBtn = (btn) => {
            btn.focus();
            btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            btn.click();
          };

          // เช็คว่าเป็นโมเดลที่ต้องการอยู่แล้วหรือยัง
          const menuBtns = document.querySelectorAll('button[aria-haspopup="menu"]');
          for (const btn of menuBtns) {
            if (btn.textContent.includes(targetModel)) {
              return { opened: false, alreadySelected: true };
            }
          }

          // หา model dropdown button (มี arrow_drop_down icon)
          for (const btn of menuBtns) {
            const hasArrow = btn.querySelector('i.google-symbols');
            if (hasArrow && hasArrow.textContent.trim() === 'arrow_drop_down') {
              clickBtn(btn);
              return { opened: true, text: btn.textContent.trim().substring(0, 40) };
            }
          }

          return { opened: false };
        }
      });

      const dropResult = dropdownOpened?.[0]?.result;
      console.log('[ImageMode] Step 3a dropdown:', dropResult);

      if (dropResult?.alreadySelected) {
        Helpers.showToast(`เปลี่ยนเป็น Image Mode + ${modelName} แล้ว`, 'success');
        return;
      }

      if (dropResult?.opened) {
        // 3b: รอ menu render แล้วกดโมเดลที่ต้องการ — retry สูงสุด 6 ครั้ง
        let modelFound = false;
        for (let i = 0; i < 6 && !modelFound; i++) {
          await new Promise(resolve => setTimeout(resolve, i === 0 ? 800 : 400));

          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [modelName],
            func: (targetModel) => {
              const clickItem = (el) => {
                el.focus();
                el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                el.click();
              };

              // หา menu item ที่มีชื่อโมเดลที่ต้องการ
              const items = document.querySelectorAll('[role="menuitem"], [role="option"], [data-radix-collection-item]');
              for (const item of items) {
                if (item.textContent.includes(targetModel)) {
                  clickItem(item);
                  return { clicked: true, text: item.textContent.trim().substring(0, 40) };
                }
              }

              // Debug: log menu items ที่เจอ
              const dbgItems = [...items].map(i => i.textContent.trim().substring(0, 30));
              return { clicked: false, items: dbgItems.slice(0, 10) };
            }
          });

          const result = results?.[0]?.result;
          console.log(`[ImageMode] Step 3b ${modelName} attempt ${i}:`, result);

          if (result?.clicked) {
            modelFound = true;
          }
        }

        if (modelFound) {
          Helpers.showToast(`เปลี่ยนเป็น Image Mode + ${modelName} แล้ว`, 'success');
        } else {
          Helpers.showToast(`เปลี่ยนเป็น Image Mode แล้ว (ไม่พบ ${modelName})`, 'warning');
        }
      } else {
        Helpers.showToast('เปลี่ยนเป็น Image Mode แล้ว', 'success');
      }
    } catch (error) {
      console.error('Image mode error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
    }
  },

  /**
   * Handle Select Image button — hover/right-click บนภาพแล้วกด Animate (motion_blur icon)
   */
  async handleSelectImage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      // Step 1: หาภาพแล้ว hover + contextmenu เพื่อเปิดเมนู Radix
      const step1 = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // หาภาพที่สร้างขึ้นในหน้าเว็บ (ข้าม icon/avatar เล็กๆ)
          const images = document.querySelectorAll('#__next img');
          let targetImg = null;

          for (const img of images) {
            if (img.offsetWidth > 100 && img.offsetHeight > 100) {
              targetImg = img;
              break;
            }
          }

          if (!targetImg) return { found: false, imgCount: images.length };

          // หา container ที่ครอบภาพ (Radix trigger อาจอยู่ที่ parent)
          const target = targetImg.closest('[data-radix-context-menu-trigger]')
            || targetImg.closest('button')
            || targetImg.parentElement
            || targetImg;

          const rect = target.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const evtInit = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 };
          const rightClickInit = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 2 };

          // ลองหลายวิธีให้เมนูเปิด:
          // 1) Pointer events (Radix ใช้ pointer events)
          target.dispatchEvent(new PointerEvent('pointerenter', evtInit));
          target.dispatchEvent(new PointerEvent('pointerover', evtInit));
          target.dispatchEvent(new PointerEvent('pointermove', evtInit));
          // 2) Mouse events
          target.dispatchEvent(new MouseEvent('mouseenter', evtInit));
          target.dispatchEvent(new MouseEvent('mouseover', evtInit));
          target.dispatchEvent(new MouseEvent('mousemove', evtInit));
          // 3) Context menu (คลิกขวา — Radix ContextMenu trigger)
          target.dispatchEvent(new PointerEvent('pointerdown', rightClickInit));
          target.dispatchEvent(new MouseEvent('contextmenu', rightClickInit));

          return { found: true, tag: target.tagName, w: target.offsetWidth, h: target.offsetHeight };
        }
      });

      console.log('[SelectImage] Step 1 hover+contextmenu:', step1?.[0]?.result);

      if (!step1?.[0]?.result?.found) {
        Helpers.showToast('ไม่พบภาพที่สร้าง', 'error');
        return;
      }

      // Step 2: รอเมนูขึ้น แล้วกดปุ่ม motion_blur (Animate) — retry สูงสุด 8 ครั้ง
      let found = false;
      for (let i = 0; i < 8 && !found; i++) {
        await new Promise(resolve => setTimeout(resolve, i === 0 ? 1200 : 600));

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (attempt) => {
            // หา icon motion_blur แล้วกดปุ่มแม่
            const icons = document.querySelectorAll('i.google-symbols');
            for (const icon of icons) {
              if (icon.textContent.trim() === 'motion_blur') {
                const btn = icon.closest('button') || icon.closest('[role="menuitem"]');
                if (btn) {
                  btn.focus();
                  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                  btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                  btn.click();
                  return { clicked: true, text: btn.textContent.trim().substring(0, 30) };
                }
              }
            }

            // Fallback: หา menuitem ที่มีข้อความ "Animate"
            const menuItems = document.querySelectorAll('[role="menuitem"], [data-radix-collection-item]');
            for (const item of menuItems) {
              const text = item.textContent.trim();
              if (text.startsWith('Animate') || text === 'Animate') {
                const btn = item.closest('button') || item;
                btn.focus();
                btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                btn.click();
                return { clicked: true, text: text.substring(0, 30), method: 'text-fallback' };
              }
            }

            // ถ้ายังไม่เจอ ลอง re-trigger hover/contextmenu อีกรอบ (ทุก 2 attempts)
            if (attempt % 2 === 1) {
              const images = document.querySelectorAll('#__next img');
              for (const img of images) {
                if (img.offsetWidth > 100 && img.offsetHeight > 100) {
                  const t = img.closest('[data-radix-context-menu-trigger]') || img.parentElement || img;
                  const r = t.getBoundingClientRect();
                  const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
                  t.dispatchEvent(new PointerEvent('pointerenter', opts));
                  t.dispatchEvent(new PointerEvent('pointermove', opts));
                  t.dispatchEvent(new MouseEvent('mouseover', opts));
                  t.dispatchEvent(new MouseEvent('contextmenu', { ...opts, button: 2 }));
                  break;
                }
              }
            }

            // Debug: log สิ่งที่เจอ
            const allIcons = [...icons].map(i => i.textContent.trim()).filter(t => t);
            const radixMenus = document.querySelectorAll('[data-radix-popper-content-wrapper], [role="menu"]');
            return { clicked: false, icons: allIcons.slice(0, 15), menus: radixMenus.length };
          },
          args: [i]
        });

        const result = results?.[0]?.result;
        console.log(`[SelectImage] Step 2 attempt ${i}:`, result);

        if (result?.clicked) {
          found = true;
          Helpers.showToast('กดเลือกภาพแล้ว (Animate)', 'success');
        }
      }

      if (!found) {
        Helpers.showToast('ไม่พบปุ่ม Animate (motion_blur)', 'error');
      }
    } catch (error) {
      console.error('Select image error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด', 'error');
    }
  },

  /**
   * Handle Click Video — คลิกตรงที่วิดีโอ/ภาพที่สร้างขึ้น
   */
  async handleClickVideo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // หา video หรือ img ที่ใหญ่กว่า 100px (ตัวเดียวกับที่ hover ใน Select Video/Image)
          const media = document.querySelectorAll('#__next video, #__next img');
          for (const el of media) {
            if (el.offsetWidth > 100 && el.offsetHeight > 100) {
              const rect = el.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };

              el.dispatchEvent(new PointerEvent('pointerdown', opts));
              el.dispatchEvent(new MouseEvent('mousedown', opts));
              el.dispatchEvent(new PointerEvent('pointerup', opts));
              el.dispatchEvent(new MouseEvent('mouseup', opts));
              el.click();

              return { clicked: true, tag: el.tagName, w: el.offsetWidth, h: el.offsetHeight, src: (el.src || '').substring(0, 60) };
            }
          }
          return { clicked: false, mediaCount: media.length };
        }
      });

      const result = results?.[0]?.result;
      console.log('[ClickVideo]', result);

      if (result?.clicked) {
        Helpers.showToast(`คลิก ${result.tag} แล้ว (${result.w}x${result.h})`, 'success');
      } else {
        Helpers.showToast('ไม่พบวิดีโอ/ภาพ', 'error');
      }
    } catch (error) {
      console.error('Click video error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด', 'error');
    }
  },

  /**
   * Handle Select Video — hover บนวิดีโอแล้วกด Add to Scene (play_movies icon)
   */
  async handleSelectVideo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      // Step 1: หาวิดีโอแล้ว hover + contextmenu เพื่อเปิดเมนู
      const step1 = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // หาวิดีโอหรือภาพที่สร้างขึ้น (ข้าม icon เล็กๆ)
          const media = document.querySelectorAll('#__next video, #__next img');
          let targetEl = null;

          for (const el of media) {
            if (el.offsetWidth > 100 && el.offsetHeight > 100) {
              targetEl = el;
              break;
            }
          }

          if (!targetEl) return { found: false, mediaCount: media.length };

          // หา container (Radix trigger อาจอยู่ที่ parent)
          const target = targetEl.closest('[data-radix-context-menu-trigger]')
            || targetEl.closest('button')
            || targetEl.parentElement
            || targetEl;

          const rect = target.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const evtInit = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 };
          const rightClickInit = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 2 };

          // Pointer events + Mouse events + Context menu
          target.dispatchEvent(new PointerEvent('pointerenter', evtInit));
          target.dispatchEvent(new PointerEvent('pointerover', evtInit));
          target.dispatchEvent(new PointerEvent('pointermove', evtInit));
          target.dispatchEvent(new MouseEvent('mouseenter', evtInit));
          target.dispatchEvent(new MouseEvent('mouseover', evtInit));
          target.dispatchEvent(new MouseEvent('mousemove', evtInit));
          target.dispatchEvent(new PointerEvent('pointerdown', rightClickInit));
          target.dispatchEvent(new MouseEvent('contextmenu', rightClickInit));

          return { found: true, tag: target.tagName, w: target.offsetWidth, h: target.offsetHeight };
        }
      });

      console.log('[SelectVideo] Step 1 hover+contextmenu:', step1?.[0]?.result);

      if (!step1?.[0]?.result?.found) {
        Helpers.showToast('ไม่พบวิดีโอที่สร้าง — ข้ามไปสร้างใหม่', 'warning');
        this.videoSelectFailed = true;
        return;
      }

      // Step 2: รอเมนูขึ้น แล้วกดปุ่ม play_movies (Add to Scene) — retry สูงสุด 8 ครั้ง
      let found = false;
      for (let i = 0; i < 8 && !found; i++) {
        await new Promise(resolve => setTimeout(resolve, i === 0 ? 1200 : 600));

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (attempt) => {
            const clickBtn = (btn) => {
              btn.focus();
              btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
              btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
              btn.click();
            };

            // Strategy 1: หา icon play_movies
            const icons = document.querySelectorAll('i.google-symbols');
            for (const icon of icons) {
              if (icon.textContent.trim() === 'play_movies') {
                const btn = icon.closest('button') || icon.closest('[role="menuitem"]');
                if (btn) {
                  clickBtn(btn);
                  return { clicked: true, text: btn.textContent.trim().substring(0, 30), method: 'play_movies-icon' };
                }
              }
            }

            // Strategy 2: หา menuitem ที่มีข้อความ "Add to Scene"
            const menuItems = document.querySelectorAll('[role="menuitem"], [data-radix-collection-item]');
            for (const item of menuItems) {
              const text = item.textContent.trim();
              if (text.includes('Add to Scene') || text.includes('add to scene')) {
                const btn = item.closest('button') || item;
                clickBtn(btn);
                return { clicked: true, text: text.substring(0, 30), method: 'text-fallback' };
              }
            }

            // ถ้ายังไม่เจอ ลอง re-trigger hover/contextmenu (ทุก 2 attempts)
            if (attempt % 2 === 1) {
              const media = document.querySelectorAll('#__next video, #__next img');
              for (const el of media) {
                if (el.offsetWidth > 100 && el.offsetHeight > 100) {
                  const t = el.closest('[data-radix-context-menu-trigger]') || el.parentElement || el;
                  const r = t.getBoundingClientRect();
                  const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
                  t.dispatchEvent(new PointerEvent('pointerenter', opts));
                  t.dispatchEvent(new PointerEvent('pointermove', opts));
                  t.dispatchEvent(new MouseEvent('mouseover', opts));
                  t.dispatchEvent(new MouseEvent('contextmenu', { ...opts, button: 2 }));
                  break;
                }
              }
            }

            // Debug
            const allIcons = [...icons].map(i => i.textContent.trim()).filter(t => t);
            const radixMenus = document.querySelectorAll('[data-radix-popper-content-wrapper], [role="menu"]');
            return { clicked: false, icons: allIcons.slice(0, 15), menus: radixMenus.length };
          },
          args: [i]
        });

        const result = results?.[0]?.result;
        console.log(`[SelectVideo] Step 2 attempt ${i}:`, result);

        if (result?.clicked) {
          found = true;
          Helpers.showToast('กดเลือกวิดีโอแล้ว (Add to Scene)', 'success');
          this.videoSelectFailed = false;
        }
      }

      if (!found) {
        Helpers.showToast('ไม่พบปุ่ม Add to Scene — ข้ามไปสร้างใหม่', 'warning');
        this.videoSelectFailed = true;
      }
    } catch (error) {
      console.error('Select video error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด — ข้ามไปสร้างใหม่', 'error');
      this.videoSelectFailed = true;
    }
  },

  /**
   * Handle Switch Image Mode button (WASM selectors)
   */
  async handleSwitchImageMode() {
    const selectors = await loadWasmSelectors();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel) => {
          const btn = document.querySelector(sel);
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        },
        args: [selectors.switchImage]
      });

      if (results && results[0] && results[0].result) {
        Helpers.showToast('สลับโหมดภาพแล้ว', 'success');
      } else {
        Helpers.showToast('ไม่พบปุ่มสลับโหมด', 'error');
      }
    } catch (error) {
      console.error('Switch image mode error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด', 'error');
    }
  },

  /**
   * Handle Check Scene - เช็คจำนวนฉากแล้วกดฉากสุดท้าย
   */
  async handleCheckScene() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // หา scene จาก timeline track ข้างใน AddClip container
          const addBtn = document.getElementById('PINHOLE_ADD_CLIP_CARD_ID');
          if (!addBtn || !addBtn.parentElement) return { found: false };

          const container = addBtn.parentElement;
          const nonAddChildren = Array.from(container.children).filter(el => el.id !== 'PINHOLE_ADD_CLIP_CARD_ID');
          if (nonAddChildren.length === 0) return { found: true, count: 0, clicked: false };

          // ลองหาฉากใน track.children ก่อน (กรณีมีหลายฉาก)
          const track = nonAddChildren[0];
          const trackChildren = Array.from(track.children);
          let scenes = trackChildren.filter(el => (el.textContent || '').includes('Timeline Video Thumbnail'));

          // Fallback: ถ้าไม่เจอ Thumbnail แต่เจอ scrubber ("Drag to change")
          // แปลว่ามีฉากเดียวที่ถูกเลือกอยู่แล้ว (ไม่แสดง Thumbnail แต่แสดง scrubber แทน)
          if (scenes.length === 0) {
            const hasScrubber = trackChildren.some(el => (el.textContent || '').includes('Drag to change'));
            if (hasScrubber) {
              return { found: true, count: 1, clicked: false, alreadySelected: true };
            }
            return { found: true, count: 0, clicked: false };
          }

          const lastScene = scenes[scenes.length - 1];

          // เช็คว่าฉากสุดท้ายถูกเลือกอยู่แล้วหรือไม่
          // scrubber ("Drag to change") จะอยู่หลังฉากที่ถูกเลือก
          const parentOfScene = lastScene.parentElement;
          const siblings = Array.from(parentOfScene.children);
          const lastSceneIdx = siblings.indexOf(lastScene);
          const nextSibling = siblings[lastSceneIdx + 1];
          const isAlreadySelected = nextSibling && (nextSibling.textContent || '').includes('Drag to change');

          if (isAlreadySelected) {
            return { found: true, count: scenes.length, clicked: false, alreadySelected: true };
          }

          lastScene.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          lastScene.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          lastScene.click();
          return { found: true, count: scenes.length, clicked: true };
        }
      });

      if (results && results[0] && results[0].result) {
        const r = results[0].result;
        if (!r.found) {
          Helpers.showToast('ไม่พบ PINHOLE_ADD_CLIP_CARD_ID', 'error');
        } else if (r.alreadySelected) {
          Helpers.showToast(`พบ ${r.count} ฉาก — ฉากสุดท้ายถูกเลือกอยู่แล้ว`, 'success');
        } else if (r.clicked) {
          Helpers.showToast(`พบ ${r.count} ฉาก — กดฉากสุดท้ายแล้ว`, 'success');
        } else {
          Helpers.showToast('ไม่มีฉากให้กด', 'warning');
        }
      }
    } catch (error) {
      console.error('Check scene error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด', 'error');
    }
  },

  /**
   * Handle Add Clip (Extend) — ใส่ prompt ก่อน แล้วกดปุ่ม Extend (keyboard_double_arrow_right)
   */
  async handleAddClip() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      // Step 1: ดึง prompt จาก PromptGenerator
      const prompt = PromptGenerator.getPrompt();
      if (!prompt) {
        Helpers.showToast('กรุณาสร้าง prompt ก่อน', 'error');
        return;
      }

      // Step 2: Focus Slate editor ("What happens next?")
      const focusResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const editorEl = document.querySelector('div[data-slate-editor="true"]');
          if (!editorEl) return { success: false };
          editorEl.focus();
          return { success: true };
        }
      });

      if (!focusResult?.[0]?.result?.success) {
        Helpers.showToast('ไม่พบช่อง prompt (Slate editor)', 'error');
        return;
      }

      // Step 3: CDP — ใส่ prompt ผ่าน Input.insertText
      const debuggee = { tabId: tab.id };
      await chrome.debugger.attach(debuggee, '1.3');

      try {
        await delay(200);

        // Ctrl+A เลือก content เดิม
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
          type: 'rawKeyDown', key: 'a', code: 'KeyA',
          windowsVirtualKeyCode: 65, modifiers: 2
        });
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
          type: 'keyUp', key: 'a', code: 'KeyA',
          windowsVirtualKeyCode: 65, modifiers: 2
        });
        await delay(100);

        // ลบ \n → space (Enter = กดสร้าง ห้ามส่ง)
        const cleanPrompt = prompt.replace(/\n+/g, ' ').trim();

        // พิมพ์ prompt
        await chrome.debugger.sendCommand(debuggee, 'Input.insertText', {
          text: cleanPrompt
        });

        await delay(300);
      } finally {
        try { await chrome.debugger.detach(debuggee); } catch (e) { /* ignore */ }
      }

      Helpers.showToast('ใส่ prompt แล้ว กำลังกด Extend...', 'info');
      await randomDelay(1000);

      // Step 4: กดปุ่ม Extend ด้วย CDP mouse click (isTrusted: true)
      const extendPos = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // หา Extend button แล้ว return พิกัด
          const icons = document.querySelectorAll('#__next i.google-symbols, #__next span.google-symbols');
          for (const icon of icons) {
            if (icon.textContent.trim() === 'keyboard_double_arrow_right') {
              const btn = icon.closest('button');
              if (btn) { const r = btn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'icon' }; }
            }
          }
          const extendBtn = document.querySelector('#__next button[title="Extend"]');
          if (extendBtn) { const r = extendBtn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'title' }; }
          const allBtns = document.querySelectorAll('#__next button');
          for (const btn of allBtns) {
            if (btn.textContent.trim().includes('Extend')) {
              const r = btn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'text' };
            }
          }
          return null;
        }
      });

      const extPos = extendPos?.[0]?.result;
      if (!extPos) {
        Helpers.showToast('ไม่พบปุ่ม Extend', 'error');
        return;
      }

      // CDP click ปุ่ม Extend
      const debuggee2 = { tabId: tab.id };
      await chrome.debugger.attach(debuggee2, '1.3');
      try {
        await chrome.debugger.sendCommand(debuggee2, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: extPos.x, y: extPos.y, button: 'left', clickCount: 1
        });
        await chrome.debugger.sendCommand(debuggee2, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: extPos.x, y: extPos.y, button: 'left', clickCount: 1
        });
      } finally {
        try { await chrome.debugger.detach(debuggee2); } catch (e) { /* ignore */ }
      }

      Helpers.showToast(`กด Extend สำเร็จ [${extPos.method}] — เลือกโมเดล...`, 'info');

      // Note: Extend popup ไม่มี Aspect Ratio tabs — ratio ถูกตั้งไว้แล้วจาก handleVideoMode()

      // Step 4.5: เลือก video model จาก dropdown (CDP mouse)
      const clipModelName = Settings.getWebVideoModel();
      console.log('[AddClip] Step 4.5 target model:', clipModelName);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const clipDropPos = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [clipModelName],
        func: (targetModel) => {
          const menuBtns = document.querySelectorAll('button[aria-haspopup="menu"]');
          for (const btn of menuBtns) {
            const hasArrow = btn.querySelector('i.google-symbols');
            if (hasArrow && hasArrow.textContent.trim() === 'arrow_drop_down') {
              const btnText = btn.textContent.replace('arrow_drop_down', '').trim();
              if (btnText === targetModel) {
                return { alreadySelected: true, text: btnText };
              }
              const r = btn.getBoundingClientRect();
              return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, text: btnText };
            }
          }
          return { found: false };
        }
      });

      const clipDropResult = clipDropPos?.[0]?.result;
      console.log('[AddClip] Step 4.5a dropdown:', clipDropResult);

      if (clipDropResult?.alreadySelected) {
        console.log(`[AddClip] ${clipModelName} already selected`);
      } else if (clipDropResult?.found) {
        // CDP click เปิด dropdown
        const dbgDrop = { tabId: tab.id };
        await chrome.debugger.attach(dbgDrop, '1.3');
        try {
          await chrome.debugger.sendCommand(dbgDrop, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x: clipDropResult.x, y: clipDropResult.y, button: 'left', clickCount: 1
          });
          await chrome.debugger.sendCommand(dbgDrop, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: clipDropResult.x, y: clipDropResult.y, button: 'left', clickCount: 1
          });
        } finally {
          try { await chrome.debugger.detach(dbgDrop); } catch (e) { /* ignore */ }
        }

        // หาพิกัด model item → CDP click
        let clipModelFound = false;
        for (let i = 0; i < 6 && !clipModelFound; i++) {
          await new Promise(resolve => setTimeout(resolve, i === 0 ? 800 : 400));

          const posResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [clipModelName],
            func: (targetModel) => {
              const items = document.querySelectorAll('[role="menuitem"]');
              for (const item of items) {
                if (item.textContent.includes(targetModel)) {
                  const r = item.getBoundingClientRect();
                  return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, text: item.textContent.trim().substring(0, 40) };
                }
              }
              const dbgItems = [...items].map(i => i.textContent.trim().substring(0, 40));
              return { found: false, items: dbgItems };
            }
          });

          const pos = posResult?.[0]?.result;
          console.log(`[AddClip] Step 4.5b ${clipModelName} attempt ${i}:`, pos);

          if (pos?.found) {
            const dbgItem = { tabId: tab.id };
            await chrome.debugger.attach(dbgItem, '1.3');
            try {
              await chrome.debugger.sendCommand(dbgItem, 'Input.dispatchMouseEvent', {
                type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1
              });
              await chrome.debugger.sendCommand(dbgItem, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1
              });
            } finally {
              try { await chrome.debugger.detach(dbgItem); } catch (e) { /* ignore */ }
            }
            clipModelFound = true;
          }
        }

        if (clipModelFound) {
          Helpers.showToast(`เลือก ${clipModelName} แล้ว — รอกด Create...`, 'info');
        } else {
          console.warn(`[AddClip] ไม่พบ ${clipModelName} ใน dropdown`);
        }
      }

      // Step 5: รอแล้วกด Create (arrow_forward) ด้วย CDP mouse click
      await randomDelay(2000);

      const createPos = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Strategy 1: หา arrow_forward icon ใกล้ Slate editor
          const slateEditor = document.querySelector('div[data-slate-editor="true"]');
          if (slateEditor) {
            let container = slateEditor.parentElement;
            for (let level = 0; level < 6; level++) {
              if (!container) break;
              const icons = container.querySelectorAll('i.google-symbols, span.google-symbols');
              for (const icon of icons) {
                if (icon.textContent.trim() === 'arrow_forward') {
                  const btn = icon.closest('button');
                  if (btn) { const r = btn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'slate-arrow_forward-L' + level }; }
                }
              }
              container = container.parentElement;
            }
          }
          // Strategy 2: หา arrow_forward ทั้งหน้า
          const icons = document.querySelectorAll('#__next i.google-symbols, #__next span.google-symbols');
          for (const icon of icons) {
            if (icon.textContent.trim() === 'arrow_forward') {
              const btn = icon.closest('button');
              if (btn) { const r = btn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'global-arrow_forward' }; }
            }
          }
          return null;
        }
      });

      const crPos = createPos?.[0]?.result;
      if (!crPos) {
        Helpers.showToast('กด Extend แล้ว แต่ไม่พบปุ่ม Create', 'error');
        return;
      }

      // CDP click ปุ่ม Create
      const debuggee3 = { tabId: tab.id };
      await chrome.debugger.attach(debuggee3, '1.3');
      try {
        await chrome.debugger.sendCommand(debuggee3, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: crPos.x, y: crPos.y, button: 'left', clickCount: 1
        });
        await chrome.debugger.sendCommand(debuggee3, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: crPos.x, y: crPos.y, button: 'left', clickCount: 1
        });
      } finally {
        try { await chrome.debugger.detach(debuggee3); } catch (e) { /* ignore */ }
      }

      Helpers.showToast(`Add Clip สำเร็จ — Extend + Create [${crPos.method}]`, 'success');
    } catch (error) {
      console.error('Add clip error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
    }
  },

  /**
   * CDP click helper — คลิกด้วย CDP (isTrusted: true)
   * @param {number} clickCount - 1 = single click, 2 = double click
   */
  async cdpClick(tabId, x, y, clickCount = 1) {
    const debuggee = { tabId };
    await chrome.debugger.attach(debuggee, '1.3');
    try {
      for (let i = 1; i <= clickCount; i++) {
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button: 'left', clickCount: i
        });
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button: 'left', clickCount: i
        });
      }
    } finally {
      try { await chrome.debugger.detach(debuggee); } catch (e) { /* ignore */ }
    }
  },

  /**
   * CDP Escape helper — กด Escape ปิด dialog/popup
   */
  async cdpEscape(tabId) {
    const debuggee = { tabId };
    await chrome.debugger.attach(debuggee, '1.3');
    try {
      await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
        type: 'rawKeyDown', key: 'Escape', code: 'Escape',
        windowsVirtualKeyCode: 27
      });
      await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Escape', code: 'Escape',
        windowsVirtualKeyCode: 27
      });
    } finally {
      try { await chrome.debugger.detach(debuggee); } catch (e) { /* ignore */ }
    }
  },

  /**
   * Handle Add Item — กด + (add_2) แล้วเลือก uploaded-image + person-image (ถ้ามี)
   */
  async handleAddItem() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      // === Round 1: กด + แล้วเลือก uploaded-image.png ===

      // Step 1: หาปุ่ม + (icon add_2)
      const addPos = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const icons = document.querySelectorAll('#__next i.google-symbols, #__next span.google-symbols');
          for (const icon of icons) {
            if (icon.textContent.trim() === 'add_2') {
              const btn = icon.closest('button');
              if (btn) {
                const r = btn.getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
              }
            }
          }
          return null;
        }
      });

      const aPos = addPos?.[0]?.result;
      if (!aPos) {
        Helpers.showToast('ไม่พบปุ่ม + (add_2)', 'error');
        return;
      }

      // CDP click ปุ่ม +
      await this.cdpClick(tab.id, aPos.x, aPos.y);
      Helpers.showToast('กด + แล้ว — รอเมนู...', 'info');
      await delay(1500);

      // Step 2: เลือก uploaded-image.png — คลิกที่ img โดยตรง
      const imgPos = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Strategy 1: หา img[alt="uploaded-image.png"]
          const imgs = document.querySelectorAll('img[alt="uploaded-image.png"]');
          for (const img of imgs) {
            const r = img.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'img-alt' };
            }
          }
          // Strategy 2: หา div text "uploaded-image.png" (leaf node)
          const allDivs = document.querySelectorAll('div');
          for (const div of allDivs) {
            if (div.textContent.trim() === 'uploaded-image.png' && div.childElementCount === 0 && div.offsetParent !== null) {
              const r = div.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'text-div' };
              }
            }
          }
          return null;
        }
      });

      const iPos = imgPos?.[0]?.result;
      if (!iPos) {
        Helpers.showToast('ไม่พบ uploaded-image.png ในเมนู', 'error');
        return;
      }

      await this.cdpClick(tab.id, iPos.x, iPos.y);
      await delay(500);

      // ปิด dialog ด้วย Escape
      await this.cdpEscape(tab.id);
      Helpers.showToast('เลือก uploaded-image.png แล้ว', 'success');

      // === Round 2: เช็ค person image ===
      const hasPersonImage = await ImageUpload.hasPersonImage();
      Helpers.showToast(`เช็คตัวละคร: ${hasPersonImage ? 'มี → กด + ต่อ' : 'ไม่มี → จบ'}`, 'info');
      if (!hasPersonImage) {
        return;
      }

      // มีตัวละคร → รอ dialog ปิด แล้วกด + อีกครั้ง
      await delay(2000);

      // Step 3: หาปุ่ม + อีกครั้ง (พิกัดอาจเปลี่ยน)
      const addPos2 = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const icons = document.querySelectorAll('#__next i.google-symbols, #__next span.google-symbols');
          for (const icon of icons) {
            if (icon.textContent.trim() === 'add_2') {
              const btn = icon.closest('button');
              if (btn) {
                const r = btn.getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
              }
            }
          }
          return null;
        }
      });

      const aPos2 = addPos2?.[0]?.result;
      if (!aPos2) {
        Helpers.showToast('ไม่พบปุ่ม + สำหรับ person-image', 'error');
        return;
      }

      await this.cdpClick(tab.id, aPos2.x, aPos2.y);
      Helpers.showToast(`กด + อีกครั้ง (${aPos2.x.toFixed(0)},${aPos2.y.toFixed(0)}) — รอเมนู...`, 'info');
      await delay(2000);

      // Step 4: เลือก person-image.png — คลิกที่ img โดยตรง
      const personPos = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Strategy 1: หา img[alt="person-image.png"]
          const imgs = document.querySelectorAll('img[alt="person-image.png"]');
          for (const img of imgs) {
            const r = img.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'img-alt' };
            }
          }
          // Strategy 2: หา div ที่มีข้อความ person-image.png
          const allDivs = document.querySelectorAll('div');
          for (const div of allDivs) {
            if (div.textContent.trim() === 'person-image.png' && div.childElementCount === 0 && div.offsetParent !== null) {
              const r = div.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                return { x: r.x + r.width / 2, y: r.y + r.height / 2, method: 'text-div' };
              }
            }
          }
          return null;
        }
      });

      const pPos = personPos?.[0]?.result;
      if (!pPos) {
        Helpers.showToast('ไม่พบ person-image.png ในเมนู', 'error');
        return;
      }
      Helpers.showToast(`เจอ person-image [${pPos.method}] (${pPos.x.toFixed(0)},${pPos.y.toFixed(0)}) — กำลังกด...`, 'info');

      await this.cdpClick(tab.id, pPos.x, pPos.y);
      await delay(500);

      // ปิด dialog ด้วย Escape
      await this.cdpEscape(tab.id);
      Helpers.showToast('Add Item สำเร็จ (สินค้า + ตัวละคร)', 'success');

    } catch (error) {
      console.error('Add item error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
    }
  },

  /**
   * Handle Export Video button click
   */
  async handleExportVideo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        Helpers.showToast('กรุณาเปิดหน้าเว็บที่ต้องการใช้งานก่อน', 'error');
        return;
      }

      // กดปุ่ม Export (robust — หาจาก icon หรือ text)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Strategy 1: หาปุ่มที่มี icon "download" หรือ "export"
          const allBtns = document.querySelectorAll('#__next button');
          for (const b of allBtns) {
            const icon = b.querySelector('i, span.material-symbols-outlined, span.google-symbols');
            if (icon && (icon.textContent.trim() === 'download' || icon.textContent.trim() === 'file_download')) {
              b.click(); return true;
            }
          }
          // Strategy 2: หาจาก text "Export"
          for (const b of allBtns) {
            if (b.textContent.trim().toLowerCase().includes('export')) {
              b.click(); return true;
            }
          }
          // Strategy 3: fallback — original partial class
          const fallback = document.querySelector('#__next button[class*="sc-91e0914f"]');
          if (fallback) { fallback.click(); return true; }
          return false;
        }
      });

      Helpers.showToast('กด Export Video แล้ว รอสร้าง...', 'success');

      // รอเวลา export ตาม settings
      await randomDelay((Settings.getExportDelay() || 120) * 1000);

      // ดึง URL ดาวน์โหลด — ลอง href ก่อน
      let exportUrl = await this.findExportDownloadLink(tab);

      if (exportUrl) {
        // มี href → เก็บ URL ไว้
        this.lastExportUrl = exportUrl;
        console.log('[Export] Found URL from href:', exportUrl.substring(0, 100) + '...');

        if (!this.isAutomationRunning) {
          // กดปุ่มทดสอบ → โหลดให้เลย
          await this.downloadVideoWithName(exportUrl, this.generateDownloadFilename());
          Helpers.showToast('กดดาวน์โหลด Export แล้ว', 'success');
        } else {
          Helpers.showToast('พบลิงก์ Export แล้ว', 'success');
        }
      } else {
        // ไม่มี href → คลิกลิงก์ (browser โหลดให้เลย) + ดัก URL
        exportUrl = await this.clickAndCaptureDownloadUrl(tab);
        if (exportUrl) {
          this.lastExportUrl = exportUrl;
          console.log('[Export] Captured URL from click:', exportUrl.substring(0, 100) + '...');
          // browser โหลดให้แล้ว ไม่ต้องโหลดซ้ำ
          Helpers.showToast('กดดาวน์โหลด Export แล้ว', 'success');
        } else {
          this.lastExportUrl = null;
          Helpers.showToast('ไม่พบลิงก์ดาวน์โหลด Export', 'error');
        }
      }
    } catch (error) {
      console.error('Export video error:', error);
      Helpers.showToast('เกิดข้อผิดพลาด', 'error');
    }
  },

  /**
   * Build steps for scene creation based on sceneCount setting
   * sceneCount=2 → 1 iteration (Add Clip + Next Scene)
   * sceneCount=3 → 2 iterations, etc.
   */
  buildSceneSteps() {
    const sceneCount = Settings.getSceneCount() || 2;
    const iterations = sceneCount - 1; // ฉากแรกคือวิดีโอจาก step 9
    const steps = [];

    // Reset scene counter
    this._currentSceneIndex = 0;
    this._totalSceneIterations = iterations;

    for (let i = 0; i < iterations; i++) {
      const sceneIndex = i;
      steps.push(
        () => randomDelay(10000),
        () => this.handleCheckScene(),
        () => randomDelay(2000),
        () => { this._currentSceneIndex = sceneIndex; return this.handleNextSceneFlow(); },
      );
    }

    // กดฉากสุดท้ายก่อน Export (ต้องทำเสมอ แม้ 1 ฉาก)
    steps.push(
      () => randomDelay(iterations > 0 ? 5000 : 10000),
      () => this.handleCheckScene(),
      () => randomDelay(2000),
    );

    return steps;
  },

  /**
   * Step 12: Generate next scene prompt → Add Clip (fill prompt + Extend + Create) → wait
   */
  async handleNextSceneFlow() {
    await this.handleGenerateNextScene();
    await randomDelay(3000);
    await this.handleAddClip(); // fill prompt + กด Extend + กด Create
    await randomDelay((Settings.getDownloadDelay() || 90) * 1000);
  },

  /**
   * Run all scene iterations based on sceneCount setting (for RUN/Import flows)
   * sceneCount=1 → ไม่ extend, sceneCount=2 → 1 iteration, sceneCount=3 → 2 iterations, etc.
   */
  async handleAllScenes() {
    const sceneCount = Settings.getSceneCount() || 2;
    const iterations = sceneCount - 1;

    this._currentSceneIndex = 0;
    this._totalSceneIterations = iterations;

    for (let i = 0; i < iterations; i++) {
      if (!this.isAutomationRunning) break;
      this._currentSceneIndex = i;

      if (i > 0) {
        await randomDelay(10000);
        await this.handleCheckScene();
        await randomDelay(2000);
      }

      await this.handleNextSceneFlow();
    }
  },

  /**
   * Run all scene iterations using pre-generated scene list (no AI calls)
   * ฉาก 1 ถูกใช้ไปแล้วใน step ก่อนหน้า → เริ่มจากฉาก 2
   */
  async handleAllScenesFromList() {
    const sceneCount = Settings.getSceneCount() || 2;
    const iterations = sceneCount - 1;

    this._currentSceneIndex = 0;
    this._totalSceneIterations = iterations;

    for (let i = 0; i < iterations; i++) {
      if (!this.isAutomationRunning) break;
      this._currentSceneIndex = i;

      if (i > 0) {
        await randomDelay(10000);
        await this.handleCheckScene();
        await randomDelay(2000);
      }

      // ดึง video prompt ฉากที่ i+1 (ฉาก 1 = index 0 ถูกใช้ไปแล้ว)
      const videoPrompt = PromptGenerator.getVideoPrompt(i + 1);
      PromptGenerator.outputTextarea.value = videoPrompt;
      PromptGenerator.updateSceneStatus(i + 1, 'used');

      // Fill prompt + Extend + Create (ไม่ต้อง AI call)
      await randomDelay(1000);
      await this.handleAddClip();
      await randomDelay((Settings.getDownloadDelay() || 90) * 1000);
    }
  },

  /**
   * Handle Setup Settings - ตั้งค่า Portrait + Output 1 ก่อนเริ่มทำงาน
   */
  async handleSetupSettings() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!this.canScriptTab(tab)) return;

      // เลือก Create Image
      await this.handleImageMode();
    } catch (error) {
      console.error('Setup settings error:', error);
    }
  },

  /**
   * Helper: หาและกดปุ่ม Settings (ใช้ร่วมกันทุกที่)
   */
  async clickSettingsButton(tabId) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const allBtns = document.querySelectorAll('#__next button');

        // Strategy 1: หา child element ใดก็ได้ (ไม่จำกัด tag) ที่มี text "tune"
        for (const b of allBtns) {
          const leaves = b.querySelectorAll('*');
          for (const leaf of leaves) {
            if (leaf.children.length === 0 && leaf.textContent.trim() === 'tune') {
              b.click();
              console.log('[Settings] Found via leaf text "tune"');
              return 'tune';
            }
          }
        }

        // Strategy 2: aria-label
        const ariaBtn = document.querySelector('button[aria-label*="etting" i], button[aria-label*="tune" i], button[aria-label*="adjust" i]');
        if (ariaBtn) {
          ariaBtn.click();
          console.log('[Settings] Found via aria-label');
          return 'aria';
        }

        // Strategy 3: หาปุ่มที่มี SVG icon ของ tune (3 แถบแนวนอนมี dot)
        for (const b of allBtns) {
          const svg = b.querySelector('svg');
          if (svg) {
            const rects = svg.querySelectorAll('line, rect, path');
            // tune icon มี path หลายเส้น — เช็คจาก viewBox หรือ size
            if (rects.length >= 3 && b.offsetWidth < 50 && b.offsetHeight < 50) {
              // เช็คเพิ่มว่าไม่ใช่ปุ่มใหญ่
              const text = b.textContent.trim().toLowerCase();
              if (!text || text.length <= 4) {
                b.click();
                console.log('[Settings] Found via SVG icon button');
                return 'svg';
              }
            }
          }
        }

        // Strategy 4: หาปุ่มข้าง "x2", "x4" (ปุ่ม output count)
        for (const b of allBtns) {
          const text = b.textContent.trim();
          if (/^x\d$/.test(text) || /^×\d$/.test(text)) {
            // ปุ่ม output count → ปุ่มถัดไปน่าจะเป็น Settings
            const next = b.nextElementSibling;
            if (next && next.tagName === 'BUTTON') {
              next.click();
              console.log('[Settings] Found next to output count button');
              return 'next-to-x';
            }
          }
        }

        // Strategy 5: fallback partial class
        const fallback = document.querySelector('#__next button[class*="sc-1cd6eb7a"]');
        if (fallback) {
          fallback.click();
          console.log('[Settings] Found via fallback class');
          return 'fallback';
        }

        // Debug: log ปุ่มทั้งหมดเพื่อ debug
        const debug = [];
        for (const b of allBtns) {
          const leaves = b.querySelectorAll('*');
          const leafTexts = [];
          for (const l of leaves) {
            if (l.children.length === 0 && l.textContent.trim()) {
              leafTexts.push(`${l.tagName}.${l.className}="${l.textContent.trim().substring(0, 20)}"`);
            }
          }
          if (leafTexts.length > 0) {
            debug.push(`btn[${b.className.substring(0, 30)}]: ${leafTexts.join(', ')}`);
          }
        }
        console.log('[Settings] NOT FOUND. All buttons:', debug);
        return false;
      }
    });
    return results && results[0] && results[0].result;
  },

  /**
   * Helper: ตั้งค่า Portrait + Output 1 (ใช้ร่วมกันทั้ง handleSetupSettings และ handleOpenNewFlow)
   * มี retry ถ้า Settings ไม่เปิด
   */
  async applyPortraitAndOutput1(tabId) {
    // --- กดปุ่ม Settings (retry สูงสุด 3 ครั้ง) ---
    let settingsOpened = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const clicked = await this.clickSettingsButton(tabId);
      console.log(`[Settings] attempt ${attempt + 1}: clicked=${clicked}`);
      await randomDelay(2000);

      // ตรวจว่า Settings panel เปิดจริง — ดูว่ามี combobox Aspect Ratio หรือ Outputs ไหม
      const hasPanel = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const comboboxes = document.querySelectorAll('[role="combobox"]');
          for (const cb of comboboxes) {
            const text = cb.textContent.toLowerCase();
            if (text.includes('aspect') || text.includes('ratio') || text.includes('output') || text.includes('landscape') || text.includes('portrait') || text.includes('square')) {
              return true;
            }
          }
          return false;
        }
      });

      if (hasPanel && hasPanel[0] && hasPanel[0].result) {
        settingsOpened = true;
        console.log('[Settings] Panel opened successfully');
        break;
      }
      console.log('[Settings] Panel not found, retrying...');
      await randomDelay(2000);
    }

    if (!settingsOpened) {
      console.error('[Settings] Failed to open Settings panel after 3 attempts');
      return;
    }

    // --- เปิด Aspect Ratio → เลือก Portrait ---
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const comboboxes = document.querySelectorAll('[role="combobox"]');
        for (const cb of comboboxes) {
          const text = cb.textContent.toLowerCase();
          if (text.includes('aspect') || text.includes('ratio') || text.includes('landscape') || text.includes('portrait') || text.includes('square')) {
            cb.focus();
            cb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            return true;
          }
        }
        return false;
      }
    });

    await randomDelay(1500);

    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const items = document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [data-radix-collection-item]');
        for (const item of items) {
          if (item.textContent.includes('Portrait')) {
            item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            item.click();
            return true;
          }
        }
        return false;
      }
    });

    await randomDelay(2000);

    // --- เปิด Outputs per prompt → เลือก 1 ---
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const comboboxes = document.querySelectorAll('[role="combobox"]');
        for (const cb of comboboxes) {
          const text = cb.textContent.toLowerCase();
          if (text.includes('output') || text.includes('per prompt')) {
            cb.focus();
            cb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            return true;
          }
        }
        return false;
      }
    });

    await randomDelay(1500);

    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const items = document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [data-radix-collection-item]');
        for (const item of items) {
          if (item.textContent.trim() === '1') {
            item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            item.click();
            return true;
          }
        }
        return false;
      }
    });

    await randomDelay(2000);

    // --- ปิด Settings ---
    await this.clickSettingsButton(tabId);
    await randomDelay(2000);
  },

  /**
   * Handle Open New Flow - เปิดหน้า Flow ใหม่แล้วกดปุ่มเริ่ม
   */
  async handleOpenNewFlow() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      await chrome.tabs.update(tab.id, { url: 'https://labs.google/fx/tools/flow' });

      // รอหน้าโหลดเสร็จ
      await new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });

      await randomDelay(12000);

      // กดปุ่ม New Project (icon add_2) — retry สูงสุด 5 ครั้ง เผื่อเว็บโหลดช้า
      let startClicked = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Strategy 1: หา icon add_2 แล้วกดปุ่มที่ครอบอยู่
            const icons = document.querySelectorAll('#__next i.google-symbols, #__next span.google-symbols');
            for (const icon of icons) {
              if (icon.textContent.trim() === 'add_2') {
                const btn = icon.closest('button') || icon.closest('a');
                if (btn) {
                  btn.focus();
                  btn.click();
                  return 'add_2-btn';
                }
                // icon ไม่ได้อยู่ใน button → คลิก icon ตรงๆ
                icon.click();
                return 'add_2-direct';
              }
            }
            // Strategy 2: หา button ที่มี text เริ่มต้น (กรณีหน้าเว็บเปลี่ยน layout)
            const allBtns = document.querySelectorAll('#__next button');
            for (const b of allBtns) {
              const text = b.textContent.trim().toLowerCase();
              if (text === 'start' || text.includes('get started') || text.includes('new')) {
                b.click(); return 'text-btn';
              }
            }
            return false;
          }
        });

        if (results && results[0] && results[0].result) {
          startClicked = true;
          console.log(`[OpenNewFlow] New Project clicked via ${results[0].result} (attempt ${attempt + 1})`);
          break;
        }
        console.log(`[OpenNewFlow] add_2 button not found, retrying... (attempt ${attempt + 1})`);
        await randomDelay(5000);
      }

      // รอ app render หลังกด New Project
      await randomDelay(startClicked ? 5000 : 3000);

      // เลือก Create Image
      await this.handleImageMode();

      // แสดง overlay ใหม่ (เพราะ navigate ไปหน้าใหม่ทำให้ overlay เก่าหาย)
      if (this.isAutomationRunning) {
        await this.showWebOverlay();
      }
    } catch (error) {
      console.error('Open new flow error:', error);
      Helpers.showToast('เปิดหน้าใหม่ไม่สำเร็จ', 'error');
    }
  },

  /**
   * Handle Add Prompt to Slate editor (debug button)
   * ใช้ Chrome Debugger Protocol (CDP) Input.insertText เพื่อพิมพ์เหมือนคนพิมพ์จริง
   * Slate.js จะ track trusted beforeinput events → อัพเดท internal state + DOM ถูกต้อง
   */
  async handleAddPromptToSlate() {
    const prompt = PromptGenerator.getPrompt();
    if (!prompt) {
      Helpers.showToast('กรุณาสร้าง prompt ก่อน', 'error');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!this.canScriptTab(tab)) {
        await Helpers.copyToClipboard(prompt);
        Helpers.showToast('คัดลอก prompt แล้ว (ไม่สามารถ inject ได้)', 'info');
        return;
      }

      // Step 1: Focus Slate editor ผ่าน content script
      const focusResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const editorEl = document.querySelector('div[data-slate-editor="true"]');
          if (!editorEl) return { success: false };
          editorEl.focus();
          return { success: true };
        }
      });

      if (!focusResult?.[0]?.result?.success) {
        await Helpers.copyToClipboard(prompt);
        Helpers.showToast('ไม่พบ Slate editor — คัดลอก prompt แล้ว', 'info');
        return;
      }

      // Step 2: Attach debugger + พิมพ์ทีละบรรทัด
      const debuggee = { tabId: tab.id };
      await chrome.debugger.attach(debuggee, '1.3');

      try {
        await delay(200);

        // Ctrl+A เพื่อเลือก content เดิมทั้งหมด (ถ้ามี)
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
          type: 'rawKeyDown', key: 'a', code: 'KeyA',
          windowsVirtualKeyCode: 65, modifiers: 2 // Ctrl
        });
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
          type: 'keyUp', key: 'a', code: 'KeyA',
          windowsVirtualKeyCode: 65, modifiers: 2
        });
        await delay(100);

        // ลบ \n ออก (รวมเป็น text เดียว คั่นด้วย space)
        // เพราะ Enter key ใน editor นี้ = กดสร้าง → ห้ามส่ง Enter
        const cleanPrompt = prompt.replace(/\n+/g, ' ').trim();

        // พิมพ์ prompt ทั้งก้อนทีเดียวผ่าน Input.insertText
        await chrome.debugger.sendCommand(debuggee, 'Input.insertText', {
          text: cleanPrompt
        });

        Helpers.showToast('กรอก prompt ลง Slate แล้ว', 'success');
      } finally {
        try { await chrome.debugger.detach(debuggee); } catch (e) { /* ignore */ }
      }

    } catch (error) {
      console.error('Add prompt to slate error:', error);
      await Helpers.copyToClipboard(prompt);
      Helpers.showToast('คัดลอก prompt แล้ว (fallback)', 'info');
    }
  },

});

// TikTok Unlocked - Content Script

// Config for random delays (milliseconds)
const CONFIG = {
  delays: {
    // Step 1 -> Step 2: หลังคลิกปุ่มปักตะกร้า รอ modal เปิด
    step1ToStep2: { min: 800, max: 1200 },
    // Step 2 -> Step 3: หลังคลิกยืนยัน รอหน้ากรอก Product ID
    step2ToStep3: { min: 1200, max: 1800 },
    // Step 3 -> Step 4: หลังกรอก Product ID รอก่อนกดค้นหา
    step3ToStep4: { min: 500, max: 800 },
    // Step 4 -> Step 5: หลังกดค้นหา รอผลลัพธ์โหลด
    step4ToStep5: { min: 2000, max: 3000 },
    // Step 5 -> Step 6: หลังเลือกสินค้า รอก่อนกด Next
    step5ToStep6: { min: 800, max: 1200 },
    // Step 6 -> Step 7: หลังกด Next รอหน้ากรอกชื่อตะกร้า
    step6ToStep7: { min: 1500, max: 2000 },
    // Step 7 -> Step 8: หลังกรอกชื่อตะกร้า รอก่อนกดยืนยัน
    step7ToStep8: { min: 800, max: 1200 }
  },
  captionDelays: {
    afterFocus: { min: 80, max: 150 }
  }
};

// Random delay function
function getRandomDelay(delayConfig) {
  const { min, max } = delayConfig;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomSleep(delayConfig) {
  const delay = getRandomDelay(delayConfig);
  console.log(`[TikTok Unlocked] Waiting ${delay}ms...`);
  return new Promise(r => setTimeout(r, delay));
}

(() => {
  console.log('[TikTok Unlocked] Content script loaded');

  // Listen for messages from sidebar
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[TikTok Unlocked] Message received:', message.action);

    const action = message.action;

    if (action === 'scanProducts') {
      scanAllProducts()
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (action === 'getProductsForWarehouse') {
      const minStock = message.minStock || 0; // รับค่า minimum stock
      getProductsForWarehouse(minStock)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (action === 'uploadToTikTok') {
      uploadToTikTok(message.files)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (action === 'fillCaption') {
      console.log('[TikTok Unlocked] fillCaption action received');
      fillCaption(message.caption)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (action === 'checkUploadPage') {
      const isUploadPage = checkIfUploadPage();
      sendResponse({ isUploadPage, url: window.location.href });
      return true;
    }

    if (action === 'pinCart') {
      pinCart(message.productId, message.cartName)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (action === 'schedulePost') {
      schedulePost(message.scheduleTime, message.postInterval)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (action === 'resetScheduleIndex') {
      resetScheduleIndex();
      sendResponse({ success: true });
      return true;
    }

    if (action === 'getClipCount') {
      const count = getClipCount();
      sendResponse({ count: count });
      return true;
    }

    if (action === 'ping') {
      sendResponse({ status: 'ok' });
      return true;
    }

    sendResponse({ error: 'Unknown action: ' + action });
    return true;
  });

  // Check if current page is TikTok upload page
  function checkIfUploadPage() {
    const url = window.location.href;
    return url.includes('/creator') ||
           url.includes('/upload') ||
           url.includes('studio.tiktok.com');
  }

  // Find the upload input element on TikTok
  function findUploadInput() {
    // TikTok upload selectors
    const selectors = [
      'input[type="file"]',
      'input[accept*="video"]',
      '[data-e2e="upload-input"]',
      '.upload-input input',
      '.before-upload-new-stage input[type="file"]',
      '.upload-card input[type="file"]'
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input) {
        console.log('[TikTok Unlocked] Found upload input:', selector);
        return input;
      }
    }

    // Try to find hidden file inputs
    const allInputs = document.querySelectorAll('input[type="file"]');
    if (allInputs.length > 0) {
      console.log('[TikTok Unlocked] Found file input from all inputs');
      return allInputs[0];
    }

    return null;
  }

  // Upload files to TikTok
  async function uploadToTikTok(filesData) {
    console.log('[TikTok Unlocked] Starting upload to TikTok...');

    // Check if on upload page
    if (!checkIfUploadPage()) {
      return {
        success: false,
        error: 'กรุณาไปที่หน้าอัพโหลด TikTok ก่อน (tiktok.com/creator หรือ studio.tiktok.com)'
      };
    }

    // Find upload input
    const uploadInput = findUploadInput();
    if (!uploadInput) {
      // Try clicking upload area to reveal input
      const uploadArea = document.querySelector(
        '.upload-card, [class*="upload"], [data-e2e="upload-card"]'
      );
      if (uploadArea) {
        uploadArea.click();
        await new Promise(r => setTimeout(r, 500));
      }

      const retryInput = findUploadInput();
      if (!retryInput) {
        return {
          success: false,
          error: 'ไม่พบช่องอัพโหลดไฟล์ กรุณาตรวจสอบว่าอยู่ในหน้าอัพโหลดวิดีโอ'
        };
      }
    }

    try {
      // Convert base64 files back to File objects
      const files = await Promise.all(filesData.map(async (fileData) => {
        const response = await fetch(fileData.dataUrl);
        const blob = await response.blob();
        return new File([blob], fileData.name, { type: fileData.type });
      }));

      // Create DataTransfer to set files
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));

      // Set files to input
      const input = findUploadInput();
      if (input) {
        input.files = dataTransfer.files;

        // Trigger change event
        const changeEvent = new Event('change', { bubbles: true });
        input.dispatchEvent(changeEvent);

        // Also trigger input event
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);

        console.log('[TikTok Unlocked] Files uploaded successfully!');
        return {
          success: true,
          message: `อัพโหลด ${files.length} ไฟล์ไปยัง TikTok สำเร็จ!`
        };
      }

      return {
        success: false,
        error: 'ไม่สามารถส่งไฟล์ได้'
      };

    } catch (error) {
      console.error('[TikTok Unlocked] Upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Fill caption on TikTok upload page
  async function fillCaption(caption) {
    console.log('[TikTok Unlocked] Filling caption:', caption);

    // Try multiple selectors for DraftJS editor
    const selectors = [
      // DraftJS block element
      '.public-DraftStyleDefault-block',
      '.public-DraftEditor-content [data-offset-key]',
      '.public-DraftEditor-content',
      '.DraftEditor-editorContainer [contenteditable="true"]',
      '[data-contents="true"]',
      '.caption-editor [contenteditable="true"]',
      '.caption-markup-container [contenteditable="true"]'
    ];

    let editorElement = null;

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('[TikTok Unlocked] Found caption editor with selector:', selector);
        editorElement = element;
        break;
      }
    }

    if (!editorElement) {
      console.log('[TikTok Unlocked] Caption editor not found with any selector');
      return {
        success: false,
        error: 'ไม่พบช่องกรอกแคปชั่น'
      };
    }

    try {
      // Find the contenteditable parent for DraftJS
      const contentEditable = editorElement.closest('[contenteditable="true"]') ||
                              editorElement.querySelector('[contenteditable="true"]') ||
                              editorElement;

      console.log('[TikTok Unlocked] Using contentEditable:', contentEditable);

      // Focus and click
      contentEditable.focus();
      await new Promise(r => setTimeout(r, 100));

      // Select all existing content
      document.execCommand('selectAll', false, null);
      await new Promise(r => setTimeout(r, 50));

      // Insert new text
      document.execCommand('insertText', false, caption);

      // Dispatch input event for React/DraftJS to detect change
      contentEditable.dispatchEvent(new Event('input', { bubbles: true }));
      contentEditable.dispatchEvent(new Event('change', { bubbles: true }));

      return {
        success: true,
        message: 'กรอกแคปชั่นสำเร็จ'
      };

    } catch (error) {
      console.error('[TikTok Unlocked] Fill caption error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Pin cart button
  async function pinCart(productId, cartName) {
    console.log('[TikTok Unlocked] Starting pin cart process with Product ID:', productId, 'Cart Name:', cartName);

    // Step 1: Click the first button to open modal
    // Find button with "Add" text and Plus icon
    let cartBtn = null;

    // Try multiple selectors
    const selectors = [
      // Button with Add text
      'button.Button__root[data-icon-only="false"]',
      'button.Button__root--type-neutral',
      '.anchor-tag-container button',
      '.anchor-entry-container button'
    ];

    for (const selector of selectors) {
      const buttons = document.querySelectorAll(selector);
      for (const btn of buttons) {
        const btnText = btn.textContent.trim();
        // Check if button contains "Add" text
        if (btnText.includes('Add') || btnText.includes('เพิ่ม')) {
          // Verify it has Plus icon
          const hasPlus = btn.querySelector('[data-icon="Plus"]') || btn.querySelector('[data-icon="plus"]');
          if (hasPlus) {
            cartBtn = btn;
            console.log('[TikTok Unlocked] Found Add button with selector:', selector);
            break;
          }
        }
      }
      if (cartBtn) break;
    }

    // Fallback: find any button with Plus icon and Add text
    if (!cartBtn) {
      const allButtons = document.querySelectorAll('button.Button__root');
      for (const btn of allButtons) {
        if (btn.textContent.includes('Add') && btn.querySelector('[data-icon="Plus"]')) {
          cartBtn = btn;
          console.log('[TikTok Unlocked] Found Add button via fallback');
          break;
        }
      }
    }

    if (!cartBtn) {
      return {
        success: false,
        error: 'ไม่พบปุ่มปักตะกร้า (Add button)'
      };
    }

    try {
      // ========== Step 1: Click Add button ==========
      console.log('⭐ [TikTok Unlocked] Step 1: กำลังกดปุ่ม Add...');
      cartBtn.click();
      console.log('✅ [TikTok Unlocked] Step 1: กดปุ่ม Add สำเร็จ');

      // ========== Step 2: Wait for modal and click confirm ==========
      console.log('⭐ [TikTok Unlocked] Step 2: รอ modal เปิด...');
      await randomSleep(CONFIG.delays.step1ToStep2);

      const confirmBtn = document.querySelector('button.TUXButton--primary > div');
      if (confirmBtn) {
        confirmBtn.click();
        console.log('✅ [TikTok Unlocked] Step 2: กดปุ่มยืนยันสำเร็จ');
      } else {
        console.log('⚠️ [TikTok Unlocked] Step 2: ไม่พบปุ่มยืนยัน');
      }

      // ========== Step 2.5: Click "Showcase products" tab ==========
      console.log('⭐ [TikTok Unlocked] Step 2.5: กำลังหา Showcase products tab...');
      await new Promise(r => setTimeout(r, 1000)); // Wait 1 second

      // Try multiple ways to find "Showcase products" tab
      let showcaseTab = null;

      // Method 1: Find second tab in TUXTabBar (Showcase products is 2nd tab)
      const tabBar = document.querySelector('.TUXTabBar-list');
      if (tabBar) {
        const tabs = tabBar.querySelectorAll('.TUXTab');
        if (tabs.length >= 2) {
          showcaseTab = tabs[1]; // Second tab is "Showcase products"
          console.log('[TikTok Unlocked] Found Showcase tab via TUXTabBar (2nd tab)');
        }
      }

      // Method 2: Find by class TUXTab and text content
      if (!showcaseTab) {
        const allTabs = document.querySelectorAll('.TUXTab');
        for (const tab of allTabs) {
          if (tab.textContent.includes('Showcase')) {
            showcaseTab = tab;
            console.log('[TikTok Unlocked] Found Showcase tab via TUXTab text');
            break;
          }
        }
      }

      // Method 3: Find in product-search-bar container
      if (!showcaseTab) {
        const searchBar = document.querySelector('.product-search-bar, [class*="product-search"]');
        if (searchBar) {
          const tabs = searchBar.querySelectorAll('.TUXTab, [class*="tab"]');
          if (tabs.length >= 2) {
            showcaseTab = tabs[1];
            console.log('[TikTok Unlocked] Found Showcase tab via product-search-bar');
          }
        }
      }

      // Method 4: XPath to find text "Showcase products"
      if (!showcaseTab) {
        const xpath = "//*[contains(text(),'Showcase products')]";
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue) {
          showcaseTab = result.singleNodeValue;
          console.log('[TikTok Unlocked] Found Showcase tab via XPath');
        }
      }

      if (showcaseTab) {
        showcaseTab.click();
        console.log('✅ [TikTok Unlocked] Step 2.5: กด Showcase products สำเร็จ');
        await new Promise(r => setTimeout(r, 1500)); // Wait 1.5 second after click
      } else {
        console.log('⚠️ [TikTok Unlocked] Step 2.5: ไม่พบ Showcase products tab - ข้ามไป step ถัดไป');
      }

      // ========== Step 3: Fill Product ID ==========
      console.log('⭐ [TikTok Unlocked] Step 3: รอหน้ากรอก Product ID...');
      await randomSleep(CONFIG.delays.step2ToStep3);

      // Try multiple selectors for product ID input
      let productIdInput = document.querySelector('#\\:r7k\\:');
      if (!productIdInput) {
        productIdInput = document.querySelector('.product-search-input-container input');
      }
      if (!productIdInput) {
        productIdInput = document.querySelector('.TUXInputBox input');
      }
      if (!productIdInput) {
        productIdInput = document.querySelector('input[type="text"]');
      }

      if (!productIdInput) {
        console.log('❌ [TikTok Unlocked] Step 3: ไม่พบช่องกรอก Product ID');
        return {
          success: false,
          error: 'ไม่พบช่องกรอก Product ID'
        };
      }

      productIdInput.focus();
      productIdInput.value = productId;
      productIdInput.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('✅ [TikTok Unlocked] Step 3: กรอก Product ID สำเร็จ:', productId);

      // ========== Step 4: Click search button ==========
      console.log('⭐ [TikTok Unlocked] Step 4: กำลังกดปุ่มค้นหา...');
      await randomSleep(CONFIG.delays.step3ToStep4);

      let searchBtn = document.querySelector('#\\:r7d\\: > div.jsx-607835887.product-selector-container > div > div.jsx-2197861292.product-search-input-container > div > div.TUXInputBox > div > div > div');
      if (!searchBtn) {
        searchBtn = document.querySelector('.product-search-input-container .TUXInputBox div div div');
      }
      if (!searchBtn) {
        searchBtn = document.querySelector('.TUXInputBox button');
      }

      if (searchBtn) {
        searchBtn.click();
        console.log('✅ [TikTok Unlocked] Step 4: กดปุ่มค้นหาสำเร็จ');
      } else {
        // Try pressing Enter on input
        productIdInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        productIdInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
        console.log('✅ [TikTok Unlocked] Step 4: กด Enter แทนปุ่มค้นหา');
      }

      // ========== Step 5: Select product (radio button) ==========
      console.log('⭐ [TikTok Unlocked] Step 5: รอผลการค้นหา...');
      await randomSleep(CONFIG.delays.step4ToStep5);

      // Try multiple selectors for radio button
      let radioBtn = document.querySelector('#\\:r8j\\:');
      if (!radioBtn) {
        radioBtn = document.querySelector('.TUXRadioStandalone-input');
      }
      if (!radioBtn) {
        radioBtn = document.querySelector('input[type="radio"].TUXRadioStandalone-input');
      }
      if (!radioBtn) {
        radioBtn = document.querySelector('table tbody tr td:first-child input[type="radio"]');
      }
      if (!radioBtn) {
        radioBtn = document.querySelector('.product-table-container input[type="radio"]');
      }

      if (radioBtn) {
        radioBtn.click();
        console.log('✅ [TikTok Unlocked] Step 5: เลือกสินค้าสำเร็จ');
      } else {
        // Try clicking the parent TUXRadio div
        const radioDiv = document.querySelector('.TUXRadioStandalone');
        if (radioDiv) {
          radioDiv.click();
          console.log('✅ [TikTok Unlocked] Step 5: เลือกสินค้าสำเร็จ (via parent)');
        } else {
          console.log('⚠️ [TikTok Unlocked] Step 5: ไม่พบ radio button');
        }
      }

      // ========== Step 6: Click Next button ==========
      console.log('⭐ [TikTok Unlocked] Step 6: กำลังกดปุ่ม Next...');
      await randomSleep(CONFIG.delays.step5ToStep6);

      const allPrimaryBtns = document.querySelectorAll('.common-modal-footer button.TUXButton--primary');
      if (allPrimaryBtns.length > 0) {
        allPrimaryBtns[allPrimaryBtns.length - 1].click();
        console.log('✅ [TikTok Unlocked] Step 6: กดปุ่ม Next สำเร็จ');
      } else {
        console.log('⚠️ [TikTok Unlocked] Step 6: ไม่พบปุ่ม Next');
      }

      // ========== Step 7: Fill cart name ==========
      console.log('⭐ [TikTok Unlocked] Step 7: รอหน้ากรอกชื่อตะกร้า...');
      await randomSleep(CONFIG.delays.step6ToStep7);

      let cartNameInput = document.querySelector('input.TUXTextInputCore-input[type="text"]');
      if (!cartNameInput) {
        cartNameInput = document.querySelector('.TUXTextInputCore-input');
      }
      if (!cartNameInput) {
        cartNameInput = document.querySelector('input[aria-invalid]');
      }

      if (cartNameInput) {
        cartNameInput.focus();
        cartNameInput.value = cartName;
        cartNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        cartNameInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✅ [TikTok Unlocked] Step 7: กรอกชื่อตะกร้าสำเร็จ:', cartName);
      } else {
        console.log('⚠️ [TikTok Unlocked] Step 7: ไม่พบช่องกรอกชื่อตะกร้า');
      }

      // ========== Step 8: Click final confirm button ==========
      console.log('⭐ [TikTok Unlocked] Step 8: กำลังกดปุ่มยืนยันสุดท้าย...');
      await randomSleep(CONFIG.delays.step7ToStep8);

      const allPrimaryBtns2 = document.querySelectorAll('.common-modal-footer button.TUXButton--primary');
      if (allPrimaryBtns2.length > 0) {
        allPrimaryBtns2[allPrimaryBtns2.length - 1].click();
        console.log('✅ [TikTok Unlocked] Step 8: กดปุ่มยืนยันสุดท้ายสำเร็จ');
      } else {
        console.log('⚠️ [TikTok Unlocked] Step 8: ไม่พบปุ่มยืนยันสุดท้าย');
      }

      console.log('🎉 [TikTok Unlocked] ปักตะกร้าเสร็จสิ้น!');
      return {
        success: true,
        message: 'ปักตะกร้าสำเร็จ'
      };

    } catch (error) {
      console.error('❌ [TikTok Unlocked] Pin cart error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Scan all products from table with pagination
  async function scanAllProducts() {
    console.log('[TikTok Unlocked] Starting product scan...');

    const allProducts = [];
    const seenProductIds = new Set();
    let pageCount = 0;
    const maxPages = 100; // Safety limit

    while (pageCount < maxPages) {
      pageCount++;
      console.log(`[TikTok Unlocked] Scanning page ${pageCount}...`);

      // Get all rows from current page
      const rows = document.querySelectorAll('.product-table-container table tbody tr');

      if (rows.length === 0) {
        console.log('[TikTok Unlocked] No rows found');
        break;
      }

      let foundNewProduct = false;

      for (const row of rows) {
        // Get product data from each column
        const productName = row.querySelector('td:nth-child(1) .product-name')?.textContent?.trim() ||
                          row.querySelector('td:nth-child(1) span[class*="product-name"]')?.textContent?.trim() ||
                          row.querySelector('td:nth-child(1)')?.textContent?.trim() || '';

        const productId = row.querySelector('td:nth-child(2) div')?.textContent?.trim() ||
                         row.querySelector('td:nth-child(2)')?.textContent?.trim() || '';

        const price = row.querySelector('td:nth-child(3) div')?.textContent?.trim() ||
                     row.querySelector('td:nth-child(3)')?.textContent?.trim() || '';

        const stock = row.querySelector('td:nth-child(4) div')?.textContent?.trim() ||
                     row.querySelector('td:nth-child(4)')?.textContent?.trim() || '';

        const status = row.querySelector('td:nth-child(6) div div')?.textContent?.trim() ||
                      row.querySelector('td:nth-child(6)')?.textContent?.trim() || '';

        // Skip if no product ID or already seen
        if (!productId || seenProductIds.has(productId)) {
          continue;
        }

        seenProductIds.add(productId);
        foundNewProduct = true;

        allProducts.push({
          productName,
          productId,
          price,
          stock,
          status
        });

        console.log(`[TikTok Unlocked] Found: ${productName} (${productId})`);
      }

      // If no new products found, we've reached the end
      if (!foundNewProduct) {
        console.log('[TikTok Unlocked] No new products found, stopping scan');
        break;
      }

      // Try to click next page button
      const nextBtn = document.querySelector('.tiktok-pagination-item-right-arrow');
      if (!nextBtn || nextBtn.classList.contains('tiktok-pagination-item-disabled')) {
        console.log('[TikTok Unlocked] No more pages');
        break;
      }

      nextBtn.click();
      await new Promise(r => setTimeout(r, 1500)); // Wait for page to load
    }

    console.log(`[TikTok Unlocked] Scan complete. Total products: ${allProducts.length}`);

    // Generate CSV
    const csv = generateCSV(allProducts);

    return {
      success: true,
      count: allProducts.length,
      products: allProducts,
      csv: csv
    };
  }

  // Generate CSV string
  function generateCSV(products) {
    const headers = ['Product Name', 'Product ID', 'Price', 'Stock', 'Status'];
    const rows = products.map(p => [
      `"${(p.productName || '').replace(/"/g, '""')}"`,
      `"${p.productId || ''}"`,
      `"${p.price || ''}"`,
      `"${p.stock || ''}"`,
      `"${p.status || ''}"`
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  // Get products for warehouse (scrape ALL pages with pagination)
  // @param {number} minStock - minimum stock required (0 = no filter)
  async function getProductsForWarehouse(minStock = 0) {
    console.log('[TikTok Unlocked] Getting products for warehouse (all pages)...');
    console.log(`[TikTok Unlocked] Filters: minStock=${minStock}, status=Active only`);

    const allProducts = [];
    const skippedProducts = []; // เก็บ productId ที่ไม่ผ่านเกณฑ์ (เพื่อลบออกจากคลัง)
    const seenProductIds = new Set();
    let pageCount = 0;
    let skippedLowStock = 0;
    let skippedInactive = 0;
    const maxPages = 100; // Safety limit

    while (pageCount < maxPages) {
      pageCount++;
      console.log(`[TikTok Unlocked] Scanning page ${pageCount}...`);

      // Try multiple selectors for product table rows
      let rows = document.querySelectorAll('.product-table-container table tbody tr');

      if (rows.length === 0) {
        rows = document.querySelectorAll('table tbody tr');
      }

      if (rows.length === 0) {
        console.log('[TikTok Unlocked] No rows found');
        break;
      }

      let foundNewProduct = false;

      for (const row of rows) {
        try {
          // Get product image
          const imgEl = row.querySelector('td:first-child img, .product-name-cell img');
          const imageUrl = imgEl ? imgEl.src : '';

          // Get product name
          const productName = row.querySelector('td:nth-child(1) .product-name')?.textContent?.trim() ||
                            row.querySelector('td:nth-child(1) span[class*="product-name"]')?.textContent?.trim() ||
                            row.querySelector('.product-name-cell span')?.textContent?.trim() || '';

          // Get product ID from second column
          const productId = row.querySelector('td:nth-child(2) div')?.textContent?.trim() ||
                           row.querySelector('td:nth-child(2)')?.textContent?.trim() || '';

          // Get stock from column 4
          const stockText = row.querySelector('td:nth-child(4) div')?.textContent?.trim() ||
                           row.querySelector('td:nth-child(4)')?.textContent?.trim() || '0';
          const stock = parseInt(stockText.replace(/[^0-9]/g, '')) || 0;

          // Get status from column 6 (or column 5 for modal popup)
          // Try column 6 first (main Showcase page), then column 5 (Add product links modal)
          let status = row.querySelector('td:nth-child(6) div div')?.textContent?.trim() ||
                       row.querySelector('td:nth-child(6)')?.textContent?.trim() || '';

          // Fallback to column 5 if column 6 is empty (modal popup structure)
          if (!status) {
            status = row.querySelector('td:nth-child(5) div div')?.textContent?.trim() ||
                     row.querySelector('td:nth-child(5)')?.textContent?.trim() || '';
          }

          // Clean product ID
          const cleanProductId = productId.replace(/\s+/g, '').trim();

          // Skip if no product ID or already seen
          if (!cleanProductId || seenProductIds.has(cleanProductId)) {
            continue;
          }

          seenProductIds.add(cleanProductId);
          foundNewProduct = true;

          // Filter: Skip if status is not Active or Ongoing
          const isActiveOrOngoing = status.toLowerCase().includes('active') ||
                          status.toLowerCase().includes('ongoing') ||
                          status.includes('ใช้งาน') ||
                          status === 'Active' ||
                          status === 'Ongoing';
          if (!isActiveOrOngoing) {
            console.log(`[TikTok Unlocked] Skipped (inactive): ${productName.substring(0, 20)}... status="${status}"`);
            skippedProducts.push({ productId: cleanProductId, reason: 'inactive' });
            skippedInactive++;
            continue;
          }

          // Filter: Skip if stock is below minimum
          if (minStock > 0 && stock < minStock) {
            console.log(`[TikTok Unlocked] Skipped (low stock): ${productName.substring(0, 20)}... stock=${stock}`);
            skippedProducts.push({ productId: cleanProductId, reason: 'low_stock' });
            skippedLowStock++;
            continue;
          }

          console.log(`[TikTok Unlocked] ✓ Found: ${productName.substring(0, 30)}... (${cleanProductId}) stock=${stock} status=${status}`);

          // Only add if we have valid data
          if ((productName && productName.length > 2) || (cleanProductId && cleanProductId.length > 5)) {
            allProducts.push({
              name: productName || `สินค้า ${cleanProductId}`,
              productId: cleanProductId,
              productImage: imageUrl,
              stock: stock,
              status: status,
              mainHeading: '',
              subHeading: '',
              cartName: '',
              categoryId: null
            });
          }
        } catch (e) {
          console.error('[TikTok Unlocked] Error extracting product:', e);
        }
      }

      // If no new products found on this page, we might have reached the end or same page
      if (!foundNewProduct) {
        console.log('[TikTok Unlocked] No new products found on this page, stopping scan');
        break;
      }

      // Try to click next page button
      const nextBtn = document.querySelector('.tiktok-pagination-item-right-arrow');
      if (!nextBtn || nextBtn.classList.contains('tiktok-pagination-item-disabled')) {
        console.log('[TikTok Unlocked] No more pages (pagination end)');
        break;
      }

      // Click next page and wait for load
      nextBtn.click();
      console.log('[TikTok Unlocked] Clicked next page, waiting...');
      await new Promise(r => setTimeout(r, 2500)); // Wait for page to load (2.5s)
    }

    console.log(`[TikTok Unlocked] Scan complete!`);
    console.log(`[TikTok Unlocked] - Total added: ${allProducts.length}`);
    console.log(`[TikTok Unlocked] - Skipped (inactive): ${skippedInactive}`);
    console.log(`[TikTok Unlocked] - Skipped (low stock): ${skippedLowStock}`);
    console.log(`[TikTok Unlocked] - Pages scanned: ${pageCount}`);

    return {
      success: true,
      count: allProducts.length,
      products: allProducts,
      skippedProducts: skippedProducts, // รายการ productId ที่ไม่ผ่านเกณฑ์
      skippedInactive: skippedInactive,
      skippedLowStock: skippedLowStock
    };
  }

  // Old scan function (kept for compatibility)
  function scanForProducts() {
    const products = [];
    const rows = document.querySelectorAll('.product-table-container table tbody tr');

    rows.forEach(row => {
      const productName = row.querySelector('td:nth-child(1) .product-name')?.textContent?.trim() || '';
      const productId = row.querySelector('td:nth-child(2) div')?.textContent?.trim() || '';
      const price = row.querySelector('td:nth-child(3) div')?.textContent?.trim() || '';
      const stock = row.querySelector('td:nth-child(4) div')?.textContent?.trim() || '';
      // Try column 6 first, fallback to column 5 for modal popup
      let status = row.querySelector('td:nth-child(6) div div')?.textContent?.trim() ||
                   row.querySelector('td:nth-child(6)')?.textContent?.trim() || '';
      if (!status) {
        status = row.querySelector('td:nth-child(5) div div')?.textContent?.trim() ||
                 row.querySelector('td:nth-child(5)')?.textContent?.trim() || '';
      }

      if (productId) {
        products.push({ productName, productId, price, stock, status });
      }
    });

    console.log('[TikTok Unlocked] Found products:', products.length);
    return products;
  }

  // Track current schedule for multiple clips
  let currentScheduleIndex = 0;
  let baseScheduleTime = null;
  let scheduleIntervalMinutes = 1440; // Default 24 hours in minutes

  // Schedule post function
  async function schedulePost(scheduleTime, postInterval) {
    console.log('[TikTok Unlocked] Setting schedule:', scheduleTime, 'Interval:', postInterval, 'minutes');

    // Store base time and interval for future clips
    if (!baseScheduleTime || currentScheduleIndex === 0) {
      baseScheduleTime = new Date(scheduleTime);
      scheduleIntervalMinutes = postInterval;
      currentScheduleIndex = 0;
    }

    // Calculate actual schedule time based on clip index (using minutes)
    const actualScheduleTime = new Date(baseScheduleTime);
    actualScheduleTime.setMinutes(actualScheduleTime.getMinutes() + (currentScheduleIndex * scheduleIntervalMinutes));

    console.log(`[TikTok Unlocked] Clip ${currentScheduleIndex + 1}: Schedule at ${actualScheduleTime.toLocaleString('th-TH')}`);

    // Step 1: Click schedule radio button
    // Try multiple selectors - need to find the schedule option (not "post now")
    const scheduleSelectors = [
      // Schedule radio container - second label (schedule option)
      '.schedule-radio-container label:nth-child(2)',
      '.schedule-radio-container label:last-child',
      // Radio with schedule text
      '.schedule-radio-container label.Radio__root:not(.Radio__root--checked-true)',
      '.schedule-radio-container label.Radio__root + label.Radio__root',
      // Any schedule radio
      '[class*="schedule-radio"] label:nth-child(2)',
      '[class*="schedule-radio"] label:last-child',
      // Direct class match
      '.jsx-2483585186.schedule-radio-container label:nth-child(2)',
      '.jsx-2483585186.schedule-radio-container label:last-child'
    ];

    let radioClicked = false;
    for (const selector of scheduleSelectors) {
      const radio = document.querySelector(selector);
      if (radio) {
        radio.click();
        console.log('[TikTok Unlocked] Clicked schedule radio with selector:', selector);
        radioClicked = true;
        break;
      }
    }

    if (!radioClicked) {
      // Fallback: find all labels in schedule container and click the second one
      const allLabels = document.querySelectorAll('.schedule-radio-container label');
      if (allLabels.length >= 2) {
        allLabels[1].click();
        console.log('[TikTok Unlocked] Clicked schedule radio (fallback - second label)');
        radioClicked = true;
      } else if (allLabels.length === 1) {
        allLabels[0].click();
        console.log('[TikTok Unlocked] Clicked schedule radio (fallback - first label)');
        radioClicked = true;
      }
    }

    if (!radioClicked) {
      console.log('[TikTok Unlocked] Could not find schedule radio button');
    }

    // Random delay 2-3 seconds
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));

    // ========== Step 1.5: Click "Allow" on schedule permission modal (if appears) ==========
    console.log('⭐ [TikTok Unlocked] Step 1.5: กำลังหา Allow modal...');

    // Try multiple selectors for "Allow" button in schedule permission modal
    let allowBtn = null;

    // Method 1: Find all modal footers and get primary button
    const modalFooters = document.querySelectorAll('[class*="common-modal-footer"]');
    for (const footer of modalFooters) {
      const primaryBtn = footer.querySelector('button.Button__root--type-primary');
      if (primaryBtn) {
        allowBtn = primaryBtn;
        console.log('[TikTok Unlocked] Found Allow button via modal footer querySelectorAll');
        break;
      }
    }

    // Method 2: Direct jsx class selector
    if (!allowBtn) {
      allowBtn = document.querySelector('.jsx-1150920910.common-modal-footer button.Button__root--type-primary');
      if (allowBtn) {
        console.log('[TikTok Unlocked] Found Allow button via jsx-1150920910 class');
      }
    }

    // Method 3: Find by exact button text "Allow"
    if (!allowBtn) {
      const allBtns = document.querySelectorAll('button.Button__root--type-primary');
      for (const btn of allBtns) {
        const btnText = btn.textContent.trim();
        if (btnText === 'Allow' || btnText === 'อนุญาต') {
          allowBtn = btn;
          console.log('[TikTok Unlocked] Found Allow button via exact text:', btnText);
          break;
        }
      }
    }

    // Method 4: Find any visible modal with primary button in footer
    if (!allowBtn) {
      const allModals = document.querySelectorAll('[class*="common-modal"], [class*="modal-container"], [role="dialog"]');
      for (const modal of allModals) {
        const style = window.getComputedStyle(modal);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const footer = modal.querySelector('[class*="footer"]');
          if (footer) {
            const btn = footer.querySelector('button.Button__root--type-primary');
            if (btn) {
              allowBtn = btn;
              console.log('[TikTok Unlocked] Found Allow button via visible modal dialog');
              break;
            }
          }
        }
      }
    }

    if (allowBtn) {
      allowBtn.click();
      console.log('✅ [TikTok Unlocked] Step 1.5: กดปุ่ม Allow สำเร็จ');
      // Wait after clicking Allow
      await new Promise(r => setTimeout(r, 1500));
    } else {
      console.log('⚠️ [TikTok Unlocked] Step 1.5: ไม่พบ Allow modal - ข้ามไป step ถัดไป');
    }

    // Step 2: Select time from time picker
    const hours = actualScheduleTime.getHours();
    const minutes = actualScheduleTime.getMinutes();

    console.log(`[TikTok Unlocked] Setting time: ${hours}:${minutes}`);

    // First, click on time picker to open it if needed
    const timePickerInput = document.querySelector('.scheduled-picker .tiktok-timepicker input, .tiktok-timepicker input');
    if (timePickerInput) {
      timePickerInput.click();
      // Random delay 2-3 seconds
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    }

    // Find hour column (div:nth-child(2) in time-picker-container)
    // Structure: .tiktok-timepicker-time-picker-container > div:nth-child(2) > div > div:nth-child(X) > span
    const hourColumn = document.querySelector('.tiktok-timepicker-time-picker-container > div:nth-child(2)');
    if (hourColumn) {
      // Find all span elements within the column (each div contains a span with hour number)
      const hourSpans = hourColumn.querySelectorAll('div > div > span');
      console.log('[TikTok Unlocked] Found hour spans:', hourSpans.length);

      let hourFound = false;
      for (const span of hourSpans) {
        const text = span.textContent.trim();
        const optionHour = parseInt(text);
        if (!isNaN(optionHour) && optionHour === hours) {
          span.click();
          console.log('[TikTok Unlocked] Selected hour:', hours);
          hourFound = true;
          break;
        }
      }

      // Fallback: try direct child divs
      if (!hourFound) {
        const hourDivs = hourColumn.querySelectorAll(':scope > div > div');
        for (const div of hourDivs) {
          const span = div.querySelector('span');
          if (span) {
            const optionHour = parseInt(span.textContent.trim());
            if (!isNaN(optionHour) && optionHour === hours) {
              span.click();
              console.log('[TikTok Unlocked] Selected hour (fallback):', hours);
              hourFound = true;
              break;
            }
          }
        }
      }
    } else {
      console.log('[TikTok Unlocked] Hour column not found');
    }

    // Random delay 2-3 seconds
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));

    // Find minute column (div:nth-child(3) in time-picker-container)
    // Structure: .tiktok-timepicker-time-picker-container > div:nth-child(3) > div > div:nth-child(X) > span
    const minuteColumn = document.querySelector('.tiktok-timepicker-time-picker-container > div:nth-child(3)');
    if (minuteColumn) {
      // Round minutes to nearest 5 (TikTok usually uses 5-min intervals)
      const roundedMinutes = Math.round(minutes / 5) * 5;

      // Find all span elements within the column
      const minuteSpans = minuteColumn.querySelectorAll('div > div > span');
      console.log('[TikTok Unlocked] Found minute spans:', minuteSpans.length);

      let minuteFound = false;
      for (const span of minuteSpans) {
        const text = span.textContent.trim();
        const optionMinute = parseInt(text);
        if (!isNaN(optionMinute) && (optionMinute === roundedMinutes || optionMinute === minutes)) {
          span.click();
          console.log('[TikTok Unlocked] Selected minute:', optionMinute);
          minuteFound = true;
          break;
        }
      }

      // Fallback: try direct child divs
      if (!minuteFound) {
        const minuteDivs = minuteColumn.querySelectorAll(':scope > div > div');
        for (const div of minuteDivs) {
          const span = div.querySelector('span');
          if (span) {
            const optionMinute = parseInt(span.textContent.trim());
            if (!isNaN(optionMinute) && (optionMinute === roundedMinutes || optionMinute === minutes)) {
              span.click();
              console.log('[TikTok Unlocked] Selected minute (fallback):', optionMinute);
              minuteFound = true;
              break;
            }
          }
        }
      }
    } else {
      console.log('[TikTok Unlocked] Minute column not found');
    }

    // Random delay 2-3 seconds
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));

    // Step 3: Select date from calendar
    const year = actualScheduleTime.getFullYear();
    const month = actualScheduleTime.getMonth(); // 0-indexed
    const dayNum = actualScheduleTime.getDate();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    console.log(`[TikTok Unlocked] Setting date: ${dateStr}`);

    // Click on date picker dropdown to open calendar
    // Find the date picker (second dropdown in scheduled-picker, after time picker)
    const scheduledPicker = document.querySelector('.scheduled-picker');
    let dateDropdownClicked = false;

    if (scheduledPicker) {
      // Get all dropdown arrows in scheduled picker
      const dropdownArrows = scheduledPicker.querySelectorAll('.TUXTextInputCore-trailingIconWrapper');
      // Second one should be date picker (first is time picker)
      if (dropdownArrows.length >= 2) {
        dropdownArrows[1].click();
        console.log('[TikTok Unlocked] Clicked date picker dropdown arrow');
        dateDropdownClicked = true;
      } else if (dropdownArrows.length === 1) {
        dropdownArrows[0].click();
        console.log('[TikTok Unlocked] Clicked dropdown arrow (only one found)');
        dateDropdownClicked = true;
      }
    }

    // Fallback: try to find date picker by looking for the date format value
    if (!dateDropdownClicked) {
      const allInputs = document.querySelectorAll('.TUXTextInputCore-input');
      for (const input of allInputs) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(input.value)) {
          const wrapper = input.closest('.TUXInputBox') || input.parentElement;
          const arrow = wrapper?.querySelector('.TUXTextInputCore-trailingIconWrapper');
          if (arrow) {
            arrow.click();
            console.log('[TikTok Unlocked] Clicked date picker (by date format)');
            dateDropdownClicked = true;
            break;
          }
        }
      }
    }

    // Random delay 2-3 seconds
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));

    // Navigate to correct month if needed
    // Calendar header shows "December / 2025" format
    const targetMonth = actualScheduleTime.getMonth(); // 0-indexed
    const targetYear = actualScheduleTime.getFullYear();

    // Try to navigate to correct month (max 12 attempts)
    for (let attempt = 0; attempt < 12; attempt++) {
      // Find arrows: first arrow is previous (<), second arrow is next (>)
      const arrows = document.querySelectorAll('span.arrow');
      const prevArrow = arrows[0];
      const nextArrow = arrows[1];

      // Get current displayed month/year from header
      // Format: "December / 2025"
      let headerText = '';

      // Primary selector from TikTok calendar
      const monthTitle = document.querySelector('span.month-title');
      if (monthTitle) {
        headerText = monthTitle.textContent.trim();
        console.log('[TikTok Unlocked] Found month title:', headerText);
      }

      // Fallback selectors
      if (!headerText) {
        const headerSelectors = [
          '.month-header-wrapper .title-wrapper',
          '.month-header-wrapper span',
          '.calendar-wrapper .month-title',
        ];

        for (const sel of headerSelectors) {
          try {
            const el = document.querySelector(sel);
            if (el && el.textContent.match(/[A-Za-z]+.*\d{4}/)) {
              headerText = el.textContent.trim();
              break;
            }
          } catch (e) {}
        }
      }

      console.log('[TikTok Unlocked] Header text:', headerText);

      // Try to parse month and year
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
      let currentMonth = -1;
      let currentYear = -1;

      for (let i = 0; i < monthNames.length; i++) {
        if (headerText.includes(monthNames[i])) {
          currentMonth = i;
          break;
        }
      }

      const yearMatch = headerText.match(/\d{4}/);
      if (yearMatch) {
        currentYear = parseInt(yearMatch[0]);
      }

      console.log(`[TikTok Unlocked] Calendar shows: ${monthNames[currentMonth] || 'unknown'} ${currentYear}, target: ${monthNames[targetMonth]} ${targetYear}`);

      // Safety: if we can't read the header, skip month navigation
      if (currentMonth === -1 || currentYear === -1) {
        console.log('[TikTok Unlocked] Cannot read calendar header, skipping month navigation');
        break;
      }

      // Check if we're at the right month/year
      if (currentMonth === targetMonth && currentYear === targetYear) {
        console.log('[TikTok Unlocked] Already at correct month');
        break;
      }

      // Calculate direction to navigate
      const currentDate = new Date(currentYear, currentMonth, 1);
      const targetDate = new Date(targetYear, targetMonth, 1);

      if (targetDate > currentDate && nextArrow) {
        nextArrow.click();
        console.log('[TikTok Unlocked] Clicked next month arrow');
      } else if (targetDate < currentDate && prevArrow) {
        prevArrow.click();
        console.log('[TikTok Unlocked] Clicked previous month arrow');
      } else {
        console.log('[TikTok Unlocked] Cannot navigate further');
        break;
      }

      // Random delay 2-3 seconds for month navigation
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    }

    // Find and click the day number in calendar
    // Calendar uses: <span class="jsx-xxx day valid">4</span>
    let daySelected = false;

    // Find all day spans with class "day" and "valid"
    const daySpans = document.querySelectorAll('span.day.valid');
    console.log('[TikTok Unlocked] Found valid day spans:', daySpans.length);

    for (const span of daySpans) {
      const text = span.textContent.trim();
      if (text === String(dayNum)) {
        span.click();
        console.log('[TikTok Unlocked] Selected day:', dayNum);
        daySelected = true;
        break;
      }
    }

    // Fallback: try any span with class "day" (not disabled)
    if (!daySelected) {
      const allDaySpans = document.querySelectorAll('span.day:not(.disabled)');
      for (const span of allDaySpans) {
        const text = span.textContent.trim();
        if (text === String(dayNum)) {
          span.click();
          console.log('[TikTok Unlocked] Selected day (fallback):', dayNum);
          daySelected = true;
          break;
        }
      }
    }

    if (!daySelected) {
      console.log('[TikTok Unlocked] Could not find day to click:', dayNum);
    }

    // Random delay 2-3 seconds
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));

    // Step 4: Click "Show more" / collapse button to expand options
    const moreCollapse = document.querySelector('.more-collapse.collapsed > div, .more-collapse > div');
    if (moreCollapse) {
      moreCollapse.click();
      console.log('[TikTok Unlocked] Clicked more collapse');
      // Random delay 2-3 seconds
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    }

    // Step 5: Click the confirm/apply button in options form
    const optionsConfirm = document.querySelector('.options-form .jsx-1157814305.container > div > div > div > div');
    if (optionsConfirm) {
      optionsConfirm.click();
      console.log('[TikTok Unlocked] Clicked options confirm');
    } else {
      // Fallback: try to find any confirm button in options
      const optionsBtns = document.querySelectorAll('.options-form button, .options-form [role="button"]');
      if (optionsBtns.length > 0) {
        optionsBtns[optionsBtns.length - 1].click();
        console.log('[TikTok Unlocked] Clicked options button (fallback)');
      }
    }

    // Random delay 2-3 seconds
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));

    // Step 6: Click the final post/schedule button
    const postBtn = document.querySelector('.jsx-3335848873.footer button.Button__root--type-primary > div.Button__spinnerBox');
    if (postBtn) {
      postBtn.click();
      console.log('[TikTok Unlocked] Clicked final post button');
    } else {
      // Fallback selectors
      const fallbackBtns = [
        '.footer button.Button__root--type-primary',
        '.footer .Button__root--type-primary',
        'button.Button__root--type-primary'
      ];
      for (const sel of fallbackBtns) {
        const btn = document.querySelector(sel);
        if (btn) {
          btn.click();
          console.log('[TikTok Unlocked] Clicked post button (fallback):', sel);
          break;
        }
      }
    }

    console.log('[TikTok Unlocked] Schedule set - Time:', `${hours}:${minutes}`, 'Date:', dateStr);

    // Wait for popup modal to appear
    await new Promise(r => setTimeout(r, 1500));

    // Step 7: Click confirm button on popup modal
    const popupConfirmSelectors = [
      '.common-modal-footer button.TUXButton--primary > div > div',
      '.common-modal-footer button.TUXButton--primary',
      '.jsx-1150920910.common-modal-footer button.TUXButton--primary',
      '[class*="modal-footer"] button.TUXButton--primary'
    ];

    let popupClicked = false;
    for (const sel of popupConfirmSelectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        console.log('[TikTok Unlocked] Clicked popup confirm button:', sel);
        popupClicked = true;
        break;
      }
    }

    if (!popupClicked) {
      console.log('[TikTok Unlocked] No popup found, continuing...');
    }

    // Wait for upload to complete (video processing)
    console.log('[TikTok Unlocked] Waiting for upload to complete...');
    await new Promise(r => setTimeout(r, 10000)); // Wait 10 seconds for upload

    // Step 8: Wait and click Upload button to go back to upload page for next clip
    await new Promise(r => setTimeout(r, 2000));

    const uploadBtnSelectors = [
      '.css-1gdhwm9 button.Button__root--type-primary span.TUXText',
      '.css-1k5qzh8 button span.TUXText',
      'button.Button__root--type-primary span.TUXText--weight-medium',
      '.edss2sz10 button.Button__root--type-primary'
    ];

    let uploadClicked = false;
    for (const sel of uploadBtnSelectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        console.log('[TikTok Unlocked] Clicked Upload button to return:', sel);
        uploadClicked = true;
        break;
      }
    }

    if (!uploadClicked) {
      // Try clicking parent button
      const uploadBtn = document.querySelector('.css-1k5qzh8 button, .edss2sz10 button.Button__root--type-primary');
      if (uploadBtn) {
        uploadBtn.click();
        console.log('[TikTok Unlocked] Clicked Upload button (parent)');
      }
    }

    // Increment index for next clip
    currentScheduleIndex++;

    return {
      success: true,
      message: `ตั้งเวลาโพส ${actualScheduleTime.toLocaleString('th-TH')} (คลิปที่ ${currentScheduleIndex})`,
      scheduleTime: actualScheduleTime.toISOString()
    };
  }

  // Reset schedule index (call when starting new batch)
  function resetScheduleIndex() {
    currentScheduleIndex = 0;
    baseScheduleTime = null;
    console.log('[TikTok Unlocked] Schedule index reset');
  }

  // Get number of uploaded clips
  function getClipCount() {
    // Try to find clip count from TikTok upload page
    // Look for clip tabs, video thumbnails, or clip indicators
    const selectors = [
      '.clip-card', // Individual clip cards
      '.video-card', // Video cards
      '[class*="clip-item"]', // Clip items
      '[class*="video-item"]', // Video items
      '.upload-item', // Upload items
      '[data-index]', // Items with index
    ];

    for (const selector of selectors) {
      const items = document.querySelectorAll(selector);
      if (items.length > 0) {
        console.log(`[TikTok Unlocked] Found ${items.length} clips with selector: ${selector}`);
        return items.length;
      }
    }

    // Fallback: look for any indicator of multiple clips
    // Check if there's a tab bar or pagination
    const tabBar = document.querySelector('[class*="tab-bar"], [class*="clip-tabs"]');
    if (tabBar) {
      const tabs = tabBar.querySelectorAll('[class*="tab"], button');
      if (tabs.length > 0) {
        console.log(`[TikTok Unlocked] Found ${tabs.length} clip tabs`);
        return tabs.length;
      }
    }

    // Default to 1 clip
    console.log('[TikTok Unlocked] Defaulting to 1 clip');
    return 1;
  }

  // Notify background script that content script is ready
  chrome.runtime.sendMessage({ action: 'contentScriptReady' });
})();

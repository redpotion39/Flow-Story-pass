/**
 * Background Service Worker for Flow Story
 */

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Initialize default settings on first install
chrome.runtime.onInstalled.addListener(async (details) => {
  // Only set defaults if they don't exist to avoid affecting old data
  const result = await chrome.storage.local.get([
    'autoScan', 'notifications', 'products', 'uploadHistory', 
    'productPresets', 'productCategories', 'nextPasteIndex'
  ]);

  const defaults = {};
  if (result.autoScan === undefined) defaults.autoScan = false;
  if (result.notifications === undefined) defaults.notifications = true;
  if (result.products === undefined) defaults.products = [];
  if (result.uploadHistory === undefined) defaults.uploadHistory = [];
  if (result.productPresets === undefined) defaults.productPresets = [];
  if (result.productCategories === undefined) defaults.productCategories = [];
  if (result.nextPasteIndex === undefined) defaults.nextPasteIndex = 0;

  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults);
  }

  if (details.reason === 'install') {
    console.log('AI Story installed');
  }

  // Create Context Menu
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'pasteNextImagePrompt',
      title: 'AI Story: Paste Next Image Prompt',
      contexts: ['editable']
    });

    chrome.contextMenus.create({
      id: 'resetPasteIndex',
      title: 'AI Story: Reset Paste Sequence',
      contexts: ['all']
    });
  });

  // Re-inject content scripts to all tabs after install/update
  if (details.reason === 'install' || details.reason === 'update') {
    injectContentScriptsToAllTabs();
  }
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'pasteNextImagePrompt') {
    const result = await chrome.storage.local.get(['ollamaCleanedData', 'nextPasteIndex']);
    const data = result.ollamaCleanedData || [];
    let index = result.nextPasteIndex || 0;

    // We paste in chronological order (Oldest -> Newest)
    // ollamaCleanedData is newest first, so we reverse it for the index logic
    const chronologicalData = [...data].reverse();

    if (index >= chronologicalData.length) {
      // Loop back or stop
      index = 0;
    }

    if (chronologicalData.length > 0) {
      const item = chronologicalData[index];
      const text = item.image_prompt;

      // Send to content script
      chrome.tabs.sendMessage(tab.id, { action: 'insertText', text: text });

      // Increment and save index
      const nextIndex = (index + 1) % chronologicalData.length;
      await chrome.storage.local.set({ nextPasteIndex: nextIndex });
      
      // Update menu title to show next
      updateContextMenuTitle(nextIndex, chronologicalData.length);
    }
  } else if (info.menuItemId === 'resetPasteIndex') {
    await chrome.storage.local.set({ nextPasteIndex: 0 });
    updateContextMenuTitle(0);
    console.log('[AI Story] Paste index reset');
  }
});

/**
 * Update Context Menu title to show progress
 */
async function updateContextMenuTitle(nextIdx, total = -1) {
  let displayTotal = total;
  if (total === -1) {
    const result = await chrome.storage.local.get('ollamaCleanedData');
    displayTotal = (result.ollamaCleanedData || []).length;
  }

  const title = displayTotal > 0 
    ? `AI Story: Paste Image Prompt #${nextIdx + 1} / ${displayTotal}`
    : 'AI Story: Paste Next Image Prompt';

  chrome.contextMenus.update('pasteNextImagePrompt', { title: title });
}

/**
 * Inject content script to a specific tab
 */
async function injectContentScript(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return false;

    // Only inject to non-chrome pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return false;

    // Check if content script is already loaded
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (response && response.status === 'ok') return true;
    } catch (e) {}

    // Inject the generic content script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content/general.js']
    });

    // If TikTok, also inject TikTok specific
    if (tab.url.includes('tiktok.com')) {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/tiktok.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['css/content.css']
      });
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Inject content scripts to all relevant tabs
 */
async function injectContentScriptsToAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) injectContentScript(tab.id);
    }
  } catch (error) {}
}

// Listen for messages from content scripts and sidebar
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadFile') {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename
    }, (downloadId) => {
      sendResponse({ success: true, downloadId });
    });
    return true;
  }

  // Handle request to ensure content script is loaded
  if (message.action === 'ensureContentScript') {
    injectContentScript(message.tabId)
      .then(result => sendResponse({ success: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Content script ready notification
  if (message.action === 'contentScriptReady') {
    console.log('[Background] Content script ready in tab:', sender.tab?.id);
    sendResponse({ acknowledged: true });
    return true;
  }
});

// Listen for tab updates to re-inject if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only inject when page is fully loaded and is a TikTok page
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('tiktok.com')) {
    // Small delay to ensure page is ready
    setTimeout(() => {
      injectContentScript(tabId);
    }, 500);
  }
});

// Listen for tab activation (when user switches to a tab)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && tab.url.includes('tiktok.com')) {
      // Check and inject if needed
      injectContentScript(activeInfo.tabId);
    }
  } catch (error) {
    // Tab might not exist
  }
});

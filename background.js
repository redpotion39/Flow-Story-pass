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
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      autoScan: false,
      notifications: true,
      products: [],
      uploadHistory: [],
      productPresets: [],
      productCategories: []
    });
    console.log('Flow Story installed');
  }

  // Re-inject content scripts to all TikTok tabs after install/update
  if (details.reason === 'install' || details.reason === 'update') {
    injectContentScriptsToAllTabs();
  }
});

/**
 * Inject content script to a specific tab
 */
async function injectContentScript(tabId) {
  try {
    // Check if tab exists and is a TikTok page
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.includes('tiktok.com')) {
      return false;
    }

    // Check if content script is already loaded by sending ping
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (response && response.status === 'ok') {
        console.log(`[Background] Content script already loaded in tab ${tabId}`);
        return true;
      }
    } catch (e) {
      // Content script not loaded, inject it
      console.log(`[Background] Injecting content script to tab ${tabId}`);
    }

    // Inject the content script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content/tiktok.js']
    });

    // Inject CSS
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['css/content.css']
    });

    console.log(`[Background] Content script injected to tab ${tabId}`);
    return true;
  } catch (error) {
    console.error(`[Background] Failed to inject to tab ${tabId}:`, error.message);
    return false;
  }
}

/**
 * Inject content scripts to all TikTok tabs
 */
async function injectContentScriptsToAllTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.tiktok.com/*' });
    for (const tab of tabs) {
      await injectContentScript(tab.id);
    }
    console.log(`[Background] Injected to ${tabs.length} TikTok tabs`);
  } catch (error) {
    console.error('[Background] Error injecting to all tabs:', error);
  }
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

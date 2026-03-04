/**
 * Background Service Worker for AI Story
 */

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Initialize default settings on first install
chrome.runtime.onInstalled.addListener(async (details) => {
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

  createContextMenus();

  if (details.reason === 'install' || details.reason === 'update') {
    injectContentScriptsToAllTabs();
  }
});

/**
 * Create Context Menus grouped under a parent
 */
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // Parent Menu
    chrome.contextMenus.create({
      id: 'aiStoryMain',
      title: 'AI Story (Scene #1)',
      contexts: ['editable', 'all']
    });

    // Generate menu for 5 scenes
    for (let i = 1; i <= 5; i++) {
      chrome.contextMenus.create({
        id: `s${i}_img`,
        parentId: 'aiStoryMain',
        title: `S${i}: Img`,
        contexts: ['editable']
      });
      chrome.contextMenus.create({
        id: `s${i}_vdo`,
        parentId: 'aiStoryMain',
        title: `S${i}: Vdo`,
        contexts: ['editable']
      });
      
      chrome.contextMenus.create({
        id: `sep_${i}`,
        parentId: 'aiStoryMain',
        type: 'separator',
        contexts: ['editable']
      });
    }

    chrome.contextMenus.create({
      id: 'nextSet',
      parentId: 'aiStoryMain',
      title: 'Next Set (+5 Scenes)',
      contexts: ['all']
    });

    chrome.contextMenus.create({
      id: 'deleteCurrentFive',
      parentId: 'aiStoryMain',
      title: '🔥 Delete these 5 and Shift',
      contexts: ['all']
    });

    chrome.contextMenus.create({
      id: 'resetPasteIndex',
      parentId: 'aiStoryMain',
      title: 'Reset to Scene #1',
      contexts: ['all']
    });
    
    updateContextMenuTitle();
  });
}

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const result = await chrome.storage.local.get(['ollamaCleanedData', 'nextPasteIndex']);
  const data = result.ollamaCleanedData || [];
  let index = result.nextPasteIndex || 0;
  const chronologicalData = [...data].reverse();

  // Handle Scene Pasting
  if (info.menuItemId.startsWith('s')) {
    const match = info.menuItemId.match(/s(\d+)_(img|vdo)/);
    if (match && chronologicalData.length > 0) {
      const sceneOffset = parseInt(match[1]) - 1;
      const type = match[2];
      const targetIdx = (index + sceneOffset) % chronologicalData.length;
      
      const item = chronologicalData[targetIdx];
      const text = type === 'img' ? item.image_prompt : item.video_prompt;
      chrome.tabs.sendMessage(tab.id, { action: 'insertText', text: text });
    }
  } 
  // Next Set
  else if (info.menuItemId === 'nextSet') {
    const nextIndex = (index + 5) % (chronologicalData.length || 1);
    await chrome.storage.local.set({ nextPasteIndex: nextIndex });
    updateContextMenuTitle(nextIndex, chronologicalData.length);
  }
  // Delete current 5 and Shift
  else if (info.menuItemId === 'deleteCurrentFive') {
    if (chronologicalData.length === 0) return;
    
    const countToDelete = Math.min(5, chronologicalData.length);
    const itemsToDelete = chronologicalData.slice(index, index + countToDelete);
    const newData = data.filter(item => !itemsToDelete.includes(item));
    
    let nextIdx = index;
    if (nextIdx >= newData.length) nextIdx = 0;

    await chrome.storage.local.set({ 
      ollamaCleanedData: newData,
      nextPasteIndex: nextIdx 
    });
    
    updateContextMenuTitle(nextIdx, newData.length);
    chrome.runtime.sendMessage({ action: 'dataUpdated' });
  }
  // Reset
  else if (info.menuItemId === 'resetPasteIndex') {
    await chrome.storage.local.set({ nextPasteIndex: 0 });
    updateContextMenuTitle(0, chronologicalData.length);
  }
});

/**
 * Update Context Menu title to show progress
 */
async function updateContextMenuTitle(nextIdx = -1, total = -1) {
  let displayIdx = nextIdx;
  let displayTotal = total;

  if (displayIdx === -1 || displayTotal === -1) {
    const result = await chrome.storage.local.get(['nextPasteIndex', 'ollamaCleanedData']);
    displayIdx = result.nextPasteIndex || 0;
    displayTotal = (result.ollamaCleanedData || []).length;
  }

  const sceneNum = displayTotal > 0 ? (displayIdx % displayTotal) + 1 : 1;
  const mainTitle = displayTotal > 0 ? `AI Story (Scene #${sceneNum})` : 'AI Story (No Data)';
  
  try {
    chrome.contextMenus.update('aiStoryMain', { title: mainTitle });
    
    for (let i = 1; i <= 5; i++) {
      const absScene = displayTotal > 0 ? ((displayIdx + i - 1) % displayTotal) + 1 : i;
      const suffix = displayTotal > 0 ? ` (#${absScene})` : ' (-)';
      chrome.contextMenus.update(`s${i}_img`, { title: `S${i}: Img${suffix}` });
      chrome.contextMenus.update(`s${i}_vdo`, { title: `S${i}: Vdo${suffix}` });
    }
  } catch (e) {}
}

/**
 * Inject content script to a specific tab
 */
async function injectContentScript(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return false;
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return false;

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content/general.js']
    });

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

async function injectContentScriptsToAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) injectContentScript(tab.id);
    }
  } catch (error) {}
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadFile') {
    chrome.downloads.download({ url: message.url, filename: message.filename }, (id) => sendResponse({ success: true, id }));
    return true;
  }
  if (message.action === 'ensureContentScript') {
    injectContentScript(message.tabId).then(res => sendResponse({ success: res }));
    return true;
  }
});

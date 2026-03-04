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

  await refreshContextMenus();

  if (details.reason === 'install' || details.reason === 'update') {
    injectContentScriptsToAllTabs();
  }
});

/**
 * Rebuild Context Menus based on data count
 */
async function refreshContextMenus() {
  const result = await chrome.storage.local.get(['ollamaCleanedData', 'nextPasteIndex']);
  const data = result.ollamaCleanedData || [];
  const index = result.nextPasteIndex || 0;
  const totalCount = data.length;
  
  // Clear all first
  chrome.contextMenus.removeAll(() => {
    if (totalCount === 0) {
      // Show placeholder if no data
      chrome.contextMenus.create({
        id: 'noData',
        title: 'AI Story: (No Data)',
        enabled: false,
        contexts: ['all']
      });
    } else {
      // Parent Menu
      const sceneNum = (index % totalCount) + 1;
      chrome.contextMenus.create({
        id: 'aiStoryMain',
        title: `AI Story (Scene #${sceneNum})`,
        contexts: ['editable', 'all']
      });

      // Show up to 5 scenes
      const scenesToShow = Math.min(5, totalCount);
      for (let i = 1; i <= scenesToShow; i++) {
        const absIdx = (index + i - 1);
        const absSceneNum = (absIdx % totalCount) + 1;
        const suffix = ` (#${absSceneNum})`;

        chrome.contextMenus.create({
          id: `s${i}_img`,
          parentId: 'aiStoryMain',
          title: `S${i}: Img${suffix}`,
          contexts: ['editable']
        });
        chrome.contextMenus.create({
          id: `s${i}_vdo`,
          parentId: 'aiStoryMain',
          title: `S${i}: Vdo${suffix}`,
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
    }

    // Always show Reset option if we have any data
    if (totalCount > 0) {
      chrome.contextMenus.create({
        id: 'resetPasteIndex',
        title: 'Reset to Scene #1',
        contexts: ['all']
      });
    }
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
    await refreshContextMenus();
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
    
    await refreshContextMenus();
    chrome.runtime.sendMessage({ action: 'dataUpdated' });
  }
  // Reset
  else if (info.menuItemId === 'resetPasteIndex') {
    await chrome.storage.local.set({ nextPasteIndex: 0 });
    await refreshContextMenus();
  }
});

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
  if (message.action === 'dataUpdated') {
    refreshContextMenus();
    return true;
  }
});

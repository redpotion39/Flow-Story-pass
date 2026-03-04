/**
 * General Content Script for AI Story
 * Handles text insertion for context menu actions
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'insertText') {
    const text = message.text;
    const activeEl = document.activeElement;

    if (!activeEl) {
      console.warn('[AI Story] No active element to insert text into');
      return;
    }

    insertTextAtCursor(activeEl, text);
    sendResponse({ success: true });
  }
});

/**
 * Inserts text into various types of input elements
 */
function insertTextAtCursor(el, text) {
  const tagName = el.tagName.toLowerCase();
  const isInput = tagName === 'input' || tagName === 'textarea';
  const isContentEditable = el.contentEditable === 'true' || el.designMode === 'on';

  if (isInput) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;
    
    el.value = val.slice(0, start) + text + val.slice(end);
    
    // Set cursor position after inserted text
    el.selectionStart = el.selectionEnd = start + text.length;
    
    // Trigger events for frameworks (React/Vue/etc)
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (isContentEditable) {
    el.focus();
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      
      // Move cursor after text
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
      
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } else {
    // Fallback: try to execCommand (deprecated but sometimes works where other methods fail)
    try {
      el.focus();
      document.execCommand('insertText', false, text);
    } catch (e) {
      console.error('[AI Story] Failed to insert text:', e);
    }
  }
}

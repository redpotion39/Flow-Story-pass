/**
 * DOM Traversal
 * ฟังก์ชันช่วยเดิน DOM tree และเข้าถึง React fiber internals
 * ใช้สำหรับค้นหา elements ที่ dynamic ID จาก Radix UI
 */

Object.assign(Controls, {

  // icon ที่ใช้ค้นหา elements หลัก
  PRIMARY_ICONS: {
    modeSelect: 'aspect_ratio',
    videoMode: 'smart_display',
    imageMode: 'create',
    download: 'movie_creation',
    settings: 'tune',
    gallery: 'grid_view',
    refresh: 'autorenew'
  },

  // React fiber key สำหรับเข้าถึง internal props
  FIBER_KEYS: ['__reactFiber$', '__reactInternalInstance$', '__reactProps$'],

  /**
   * เดิน DOM tree จาก root ตาม predicate ที่กำหนด
   * @param {Element} root - element เริ่มต้น
   * @param {Function} predicate - ฟังก์ชันตรวจสอบแต่ละ node
   * @returns {Element[]} รายการ elements ที่ตรงเงื่อนไข
   */
  traverseDOM(root, predicate) {
    try {
      if (!root) {
        console.log('[DOMTraversal] root element เป็น null');
        return [];
      }

      const results = [];
      const stack = [root];

      while (stack.length > 0) {
        const node = stack.pop();

        // ตรวจสอบเฉพาะ element nodes
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (predicate(node)) {
            results.push(node);
          }
        }

        // เพิ่ม children เข้า stack (reverse order เพื่อให้ traverse ตาม DOM order)
        const children = node.children;
        if (children) {
          for (let i = children.length - 1; i >= 0; i--) {
            stack.push(children[i]);
          }
        }
      }

      console.log(`[DOMTraversal] พบ ${results.length} elements ที่ตรงเงื่อนไข`);
      return results;
    } catch (err) {
      console.error('[DOMTraversal] traverseDOM error:', err);
      return [];
    }
  },

  /**
   * ค้นหา React fiber จาก element
   * ใช้สำหรับดึง props และ state ของ React component
   * @param {Element} element - DOM element
   * @returns {Object|null} React fiber object
   */
  findReactFiber(element) {
    try {
      if (!element) return null;

      // หา fiber key จาก element properties
      for (const prefix of this.FIBER_KEYS) {
        const fiberKey = Object.keys(element).find(key => key.startsWith(prefix));
        if (fiberKey) {
          const fiber = element[fiberKey];
          console.log('[DOMTraversal] พบ React fiber:', fiberKey);
          return fiber;
        }
      }

      console.log('[DOMTraversal] ไม่พบ React fiber ใน element');
      return null;
    } catch (err) {
      console.error('[DOMTraversal] findReactFiber error:', err);
      return null;
    }
  },

  /**
   * ดึง React props จาก element โดยตรง
   * @param {Element} element - DOM element
   * @returns {Object|null} React props
   */
  getReactProps(element) {
    try {
      const fiber = this.findReactFiber(element);
      if (!fiber) return null;

      // เดิน fiber tree ขึ้นไปหา props
      let current = fiber;
      let depth = 0;
      const maxDepth = 15;

      while (current && depth < maxDepth) {
        if (current.memoizedProps) {
          console.log('[DOMTraversal] พบ props ที่ depth:', depth);
          return current.memoizedProps;
        }
        current = current.return;
        depth++;
      }

      return null;
    } catch (err) {
      console.error('[DOMTraversal] getReactProps error:', err);
      return null;
    }
  },

  /**
   * ค้นหา element จาก icon name ใน material icons
   * @param {string} iconName - ชื่อ icon เช่น 'smart_display', 'create'
   * @returns {Element|null} ปุ่มที่มี icon ตรง
   */
  findByIcon(iconName) {
    try {
      console.log('[DOMTraversal] ค้นหา icon:', iconName);

      // ค้นหาใน material-symbols-outlined
      const iconElements = document.querySelectorAll('.material-symbols-outlined, .material-icons');

      for (const el of iconElements) {
        const text = el.textContent.trim();
        if (text === iconName) {
          // หา parent ที่เป็น button หรือ clickable element
          const button = el.closest('button') ||
                         el.closest('[role="button"]') ||
                         el.closest('[data-radix-collection-item]');

          if (button) {
            console.log('[DOMTraversal] พบ icon button:', iconName, button.tagName);
            return button;
          }

          // ถ้าไม่มี button parent ให้ return parent element
          console.log('[DOMTraversal] พบ icon แต่ไม่มี button parent:', iconName);
          return el.parentElement;
        }
      }

      // ลองหาใน SVG icons ด้วย
      const svgIcons = document.querySelectorAll('svg[data-icon]');
      for (const svg of svgIcons) {
        if (svg.getAttribute('data-icon') === iconName) {
          const button = svg.closest('button');
          if (button) return button;
          return svg.parentElement;
        }
      }

      console.log('[DOMTraversal] ไม่พบ icon:', iconName);
      return null;
    } catch (err) {
      console.error('[DOMTraversal] findByIcon error:', err);
      return null;
    }
  },

  /**
   * เดิน Shadow DOM tree
   * ใช้สำหรับ web components ที่ใช้ shadow root
   * @param {Element} root - host element
   * @returns {Element[]} รายการ elements ใน shadow DOM
   */
  walkShadowDOM(root) {
    try {
      if (!root) return [];

      const results = [];
      const queue = [root];

      while (queue.length > 0) {
        const node = queue.shift();

        // เช็ค shadow root
        if (node.shadowRoot) {
          console.log('[DOMTraversal] พบ shadow root:', node.tagName);
          const shadowChildren = node.shadowRoot.querySelectorAll('*');
          shadowChildren.forEach(child => {
            results.push(child);
            queue.push(child);
          });
        }

        // เพิ่ม light DOM children
        if (node.children) {
          for (const child of node.children) {
            queue.push(child);
          }
        }
      }

      console.log(`[DOMTraversal] พบ ${results.length} elements ใน shadow DOM`);
      return results;
    } catch (err) {
      console.error('[DOMTraversal] walkShadowDOM error:', err);
      return [];
    }
  },

  /**
   * ค้นหา element จาก text content ใน popup/dropdown
   * @param {string} text - ข้อความที่ต้องการหา
   * @param {string} containerSelector - selector ของ container
   * @returns {Element|null}
   */
  findByTextInPopup(text, containerSelector = '[data-radix-popper-content-wrapper]') {
    try {
      const containers = document.querySelectorAll(containerSelector);
      for (const container of containers) {
        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          null
        );

        while (walker.nextNode()) {
          if (walker.currentNode.textContent.trim().includes(text)) {
            const parent = walker.currentNode.parentElement;
            console.log('[DOMTraversal] พบ text ใน popup:', text);
            return parent.closest('[role="menuitem"]') ||
                   parent.closest('[data-radix-collection-item]') ||
                   parent;
          }
        }
      }

      console.log('[DOMTraversal] ไม่พบ text ใน popup:', text);
      return null;
    } catch (err) {
      console.error('[DOMTraversal] findByTextInPopup error:', err);
      return null;
    }
  }
});

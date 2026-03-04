/**
 * Response Parser Module
 * Parses AI response to extract prompt and headings
 */
const ResponseParser = {
  /**
   * Parse AI response
   * @param {string} response - Raw AI response
   * @param {boolean} useAiHeading - Whether AI generated headings
   * @returns {object} - Parsed result
   */
  parse(response, useAiHeading) {
    if (useAiHeading) {
      return this.parseWithHeadings(response);
    } else {
      return {
        prompt: this.cleanPromptOnly(response),
        mainHeading: null,
        subHeading: null
      };
    }
  },

  /**
   * Parse response that includes headings
   */
  parseWithHeadings(response) {
    let prompt = '';
    let mainHeading = null;
    let subHeading = null;

    // Extract PROMPT
    const promptMatch = response.match(/PROMPT:\s*(.+?)(?=MAIN_HEADING:|$)/s);
    if (promptMatch) {
      prompt = promptMatch[1].trim();
    }

    // Extract MAIN_HEADING
    const mainMatch = response.match(/MAIN_HEADING:\s*(.+?)(?=SUB_HEADING:|$)/s);
    if (mainMatch) {
      mainHeading = mainMatch[1].trim();
    }

    // Extract SUB_HEADING
    const subMatch = response.match(/SUB_HEADING:\s*(.+?)$/s);
    if (subMatch) {
      subHeading = subMatch[1].trim();
    }

    // If no PROMPT: prefix found, use cleanPromptOnly
    if (!prompt) {
      prompt = this.cleanPromptOnly(response);
    }

    return { prompt, mainHeading, subHeading };
  },

  /**
   * Clean prompt and extract text overlays that AI included
   * @param {string} text - Raw response
   * @returns {object} - { cleanedPrompt, textOverlays }
   */
  cleanAndExtractOverlays(text) {
    let cleaned = text.trim();
    let textOverlays = [];

    // Extract text overlay patterns before cleaning
    // Pattern: "text overlay: ..." or "text saying ..." or quoted Thai text
    const overlayPatterns = [
      /text\s+(?:overlay|saying|reading|displaying)[:\s]*["']([^"']+)["']/gi,
      /(?:with|showing|displaying)\s+(?:the\s+)?text[:\s]*["']([^"']+)["']/gi,
      /["']([ก-๙][^"']{2,})["']/g, // Thai text in quotes
    ];

    for (const pattern of overlayPatterns) {
      let match;
      while ((match = pattern.exec(cleaned)) !== null) {
        if (match[1] && match[1].trim()) {
          textOverlays.push(match[1].trim());
        }
      }
    }

    // Remove Thai intro sentences at the beginning
    const introPatterns = [
      /^[\s\S]*?(?:นี่คือ|แน่นอน|ได้เลย|นี้คือ|ครับ|ค่ะ)[^\n]*[:\n]\s*/i,
      /^(?:Here is|Here's|Sure|Certainly)[^\n]*[:\n]\s*/i,
    ];

    for (const pattern of introPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Remove PROMPT: prefix if exists
    cleaned = cleaned.replace(/^PROMPT:\s*/i, '');

    // Remove markdown bold markers **
    cleaned = cleaned.replace(/\*\*/g, '');

    // Remove MAIN_HEADING and SUB_HEADING if they appear at the end
    cleaned = cleaned.replace(/\n*MAIN_HEADING:[\s\S]*$/i, '');

    return {
      cleanedPrompt: cleaned.trim(),
      textOverlays: [...new Set(textOverlays)] // Remove duplicates
    };
  },

  /**
   * Clean prompt - remove Thai intro text only, keep the English prompt intact
   */
  cleanPromptOnly(text) {
    const { cleanedPrompt } = this.cleanAndExtractOverlays(text);
    return cleanedPrompt;
  }
};

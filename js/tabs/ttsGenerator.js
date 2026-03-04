/**
 * TTS Generator Module
 * Text-to-Speech using Gemini TTS API (gemini-2.5-flash-preview-tts)
 */
const TTSGenerator = {
  audioBlob: null,

  VOICES: [
    { value: 'Zephyr', label: 'Zephyr (Bright)' },
    { value: 'Puck', label: 'Puck (Upbeat)' },
    { value: 'Charon', label: 'Charon (Informative)' },
    { value: 'Kore', label: 'Kore (Firm)' },
    { value: 'Fenrir', label: 'Fenrir (Excitable)' },
    { value: 'Leda', label: 'Leda (Youthful)' },
    { value: 'Orus', label: 'Orus (Firm)' },
    { value: 'Aoede', label: 'Aoede (Breezy)' },
    { value: 'Callirrhoe', label: 'Callirrhoe (Easy-going)' },
    { value: 'Autonoe', label: 'Autonoe (Bright)' },
    { value: 'Enceladus', label: 'Enceladus (Breathy)' },
    { value: 'Iapetus', label: 'Iapetus (Clear)' },
    { value: 'Umbriel', label: 'Umbriel (Easy-going)' },
    { value: 'Algieba', label: 'Algieba (Smooth)' },
    { value: 'Despina', label: 'Despina (Smooth)' },
    { value: 'Erinome', label: 'Erinome (Clear)' },
    { value: 'Algenib', label: 'Algenib (Gravelly)' },
    { value: 'Rasalgethi', label: 'Rasalgethi (Informative)' },
    { value: 'Laomedeia', label: 'Laomedeia (Upbeat)' },
    { value: 'Achernar', label: 'Achernar (Soft)' },
    { value: 'Alnilam', label: 'Alnilam (Firm)' },
    { value: 'Schedar', label: 'Schedar (Even)' },
    { value: 'Gacrux', label: 'Gacrux (Mature)' },
    { value: 'Pulcherrima', label: 'Pulcherrima (Forward)' },
    { value: 'Achird', label: 'Achird (Friendly)' },
    { value: 'Zubenelgenubi', label: 'Zubenelgenubi (Casual)' },
    { value: 'Vindemiatrix', label: 'Vindemiatrix (Gentle)' },
    { value: 'Sadachbia', label: 'Sadachbia (Lively)' },
    { value: 'Sadaltager', label: 'Sadaltager (Knowledgeable)' },
    { value: 'Sulafat', label: 'Sulafat (Warm)' }
  ],

  /**
   * Initialize
   */
  init() {
    this.bindElements();
    this.populateVoiceDropdown();
    this.bindEvents();
    this.loadSettings();
    this.initStoryPage();
  },

  /**
   * Bind DOM elements
   */
  bindElements() {
    this.voiceSelect = document.getElementById('ttsVoiceSelect');
    this.prefixInput = document.getElementById('ttsPrefixInput');
    this.textInput = document.getElementById('ttsTextInput');
    this.charCount = document.getElementById('ttsCharCount');
    this.generateBtn = document.getElementById('ttsGenerateBtn');
    this.statusEl = document.getElementById('ttsStatus');
    this.audioSection = document.getElementById('ttsAudioSection');
    this.audioPlayer = document.getElementById('ttsAudioPlayer');
    this.downloadBtn = document.getElementById('ttsDownloadBtn');
  },

  /**
   * Populate voice dropdown
   */
  populateVoiceDropdown() {
    if (!this.voiceSelect) return;
    this.voiceSelect.innerHTML = '';
    this.VOICES.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.value;
      opt.textContent = v.label;
      this.voiceSelect.appendChild(opt);
    });
  },

  /**
   * Bind events
   */
  bindEvents() {
    // Character count
    if (this.textInput) {
      this.textInput.addEventListener('input', () => {
        this.updateCharCount();
      });
    }

    // Generate button
    if (this.generateBtn) {
      this.generateBtn.addEventListener('click', () => this.generateSpeech());
    }

    // Download button
    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => this.downloadAudio());
    }

    // Save settings on change
    if (this.voiceSelect) {
      this.voiceSelect.addEventListener('change', () => this.saveSettings());
    }
    if (this.prefixInput) {
      this.prefixInput.addEventListener('change', () => this.saveSettings());
    }
  },

  /**
   * Update character count display
   */
  updateCharCount() {
    if (this.charCount && this.textInput) {
      this.charCount.textContent = `${this.textInput.value.length} ตัวอักษร`;
    }
  },

  /**
   * Load saved settings from localStorage
   */
  loadSettings() {
    try {
      const voice = localStorage.getItem('tts_voice');
      const prefix = localStorage.getItem('tts_prefix');
      if (voice && this.voiceSelect) this.voiceSelect.value = voice;
      if (prefix && this.prefixInput) this.prefixInput.value = prefix;
    } catch (e) {
      // ignore
    }
  },

  /**
   * Save settings to localStorage
   */
  saveSettings() {
    try {
      if (this.voiceSelect) localStorage.setItem('tts_voice', this.voiceSelect.value);
      if (this.prefixInput) localStorage.setItem('tts_prefix', this.prefixInput.value);
    } catch (e) {
      // ignore
    }
  },

  /**
   * Main: Generate speech from text
   */
  async generateSpeech() {
    const text = (this.textInput?.value || '').trim();
    if (!text) {
      this.setStatus('กรุณากรอกข้อความก่อนค่ะ', 'error');
      return;
    }

    // Get API key from chrome.storage
    const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
    if (!geminiApiKey) {
      this.setStatus('กรุณาตั้งค่า Gemini API Key ก่อนค่ะ (ปุ่มตั้งค่า)', 'error');
      return;
    }

    const voice = this.voiceSelect?.value || 'Zephyr';
    const prefix = (this.prefixInput?.value || '').trim();
    const fullText = prefix ? `${prefix}\n${text}` : text;

    // Disable button
    this.generateBtn.disabled = true;
    this.setStatus('กำลังสร้างเสียง...', 'info');
    this.audioSection.classList.remove('visible');

    try {
      const pcmData = await this.callTTSApi(fullText, voice, geminiApiKey);
      const wavBlob = this.pcmToWav(pcmData, 24000);
      this.displayAudioPlayer(wavBlob);
      this.setStatus('สร้างเสียงเรียบร้อยแล้วค่ะ!', 'success');
    } catch (err) {
      console.error('TTS error:', err);
      this.setStatus(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    } finally {
      this.generateBtn.disabled = false;
    }
  },

  /**
   * Call Gemini TTS API (streamGenerateContent)
   * Returns PCM Uint8Array
   */
  async callTTSApi(text, voice, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:streamGenerateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text }]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice
            }
          }
        }
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error ${response.status}: ${errText.substring(0, 200)}`);
    }

    const data = await response.json();

    // Collect base64 PCM chunks
    const chunks = [];
    if (Array.isArray(data)) {
      for (const chunk of data) {
        const parts = chunk?.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part?.inlineData?.data) {
              chunks.push(part.inlineData.data);
            }
          }
        }
      }
    }

    if (chunks.length === 0) {
      throw new Error('ไม่ได้รับข้อมูลเสียงจาก API');
    }

    // Decode base64 chunks and merge
    const pcmArrays = chunks.map(b64 => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    });

    // Merge all chunks
    const totalLength = pcmArrays.reduce((sum, arr) => sum + arr.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of pcmArrays) {
      merged.set(arr, offset);
      offset += arr.length;
    }

    return merged;
  },

  /**
   * Convert raw PCM to WAV
   * PCM: 24kHz, 16-bit, mono (little-endian)
   */
  pcmToWav(pcmData, sampleRate = 24000) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);           // sub-chunk size
    view.setUint16(20, 1, true);            // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Copy PCM data
    const wavBytes = new Uint8Array(buffer);
    wavBytes.set(pcmData, headerSize);

    return new Blob([buffer], { type: 'audio/wav' });
  },

  /**
   * Helper: write ASCII string to DataView
   */
  writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  },

  /**
   * Display audio player with the generated WAV blob
   */
  displayAudioPlayer(blob) {
    this.audioBlob = blob;
    const url = URL.createObjectURL(blob);
    if (this.audioPlayer) {
      this.audioPlayer.src = url;
    }
    if (this.audioSection) {
      this.audioSection.classList.add('visible');
    }
  },

  /**
   * Download audio as .wav file
   */
  downloadAudio() {
    if (!this.audioBlob) return;
    const url = URL.createObjectURL(this.audioBlob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    a.download = `tts-${timestamp}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Set status message
   */
  setStatus(msg, type = 'info') {
    if (!this.statusEl) return;
    this.statusEl.textContent = msg;
    this.statusEl.style.color =
      type === 'error' ? 'var(--color-error)' :
      type === 'success' ? 'var(--color-success)' :
      'var(--color-text-secondary)';
  },

  // ===================== Story Page TTS =====================

  /**
   * Initialize TTS elements on the AI Story page (tab 1)
   */
  initStoryPage() {
    this.storyVoiceSelect = document.getElementById('storyVoiceSelect');
    this.storyTTSBtn = document.getElementById('storyTTSBtn');
    this.storyTTSStatus = document.getElementById('storyTTSStatus');
    this.storyAudioSection = document.getElementById('storyAudioSection');
    this.storyAudioPlayer = document.getElementById('storyAudioPlayer');
    this.storyDownloadBtn = document.getElementById('storyDownloadBtn');
    this.storyAudioBlob = null;

    // Populate voice dropdown
    if (this.storyVoiceSelect) {
      this.storyVoiceSelect.innerHTML = '';
      this.VOICES.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.value;
        opt.textContent = v.label;
        this.storyVoiceSelect.appendChild(opt);
      });
      // Restore saved voice
      try {
        const saved = localStorage.getItem('tts_voice');
        if (saved) this.storyVoiceSelect.value = saved;
      } catch (e) { /* ignore */ }
    }

    // Generate TTS button
    if (this.storyTTSBtn) {
      this.storyTTSBtn.addEventListener('click', () => this.generateStoryTTS());
    }

    // Download button
    if (this.storyDownloadBtn) {
      this.storyDownloadBtn.addEventListener('click', () => this.downloadStoryAudio());
    }
  },

  /**
   * Generate TTS from storyDetails textarea
   */
  async generateStoryTTS() {
    const text = (document.getElementById('storyDetails')?.value || '').trim();
    if (!text) {
      this.setStoryStatus('กรุณาสร้างเรื่องก่อนค่ะ', 'error');
      return;
    }

    const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
    if (!geminiApiKey) {
      this.setStoryStatus('กรุณาตั้งค่า Gemini API Key ก่อนค่ะ (ปุ่มตั้งค่า)', 'error');
      return;
    }

    const voice = this.storyVoiceSelect?.value || 'Zephyr';

    // Disable button
    if (this.storyTTSBtn) this.storyTTSBtn.disabled = true;
    this.setStoryStatus('กำลังสร้างเสียง...', 'info');
    if (this.storyAudioSection) this.storyAudioSection.classList.remove('visible');

    try {
      const pcmData = await this.callTTSApi(text, voice, geminiApiKey);
      const wavBlob = this.pcmToWav(pcmData, 24000);
      this.storyAudioBlob = wavBlob;

      const url = URL.createObjectURL(wavBlob);
      if (this.storyAudioPlayer) this.storyAudioPlayer.src = url;
      if (this.storyAudioSection) this.storyAudioSection.classList.add('visible');

      this.setStoryStatus('สร้างเสียงเรียบร้อยแล้วค่ะ!', 'success');
    } catch (err) {
      console.error('Story TTS error:', err);
      this.setStoryStatus(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    } finally {
      if (this.storyTTSBtn) this.storyTTSBtn.disabled = false;
    }
  },

  /**
   * Download story audio as .wav
   */
  downloadStoryAudio() {
    if (!this.storyAudioBlob) return;
    const url = URL.createObjectURL(this.storyAudioBlob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    a.download = `story-tts-${timestamp}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Set status for story TTS section
   */
  setStoryStatus(msg, type = 'info') {
    if (!this.storyTTSStatus) return;
    this.storyTTSStatus.textContent = msg;
    this.storyTTSStatus.style.color =
      type === 'error' ? 'var(--color-error)' :
      type === 'success' ? 'var(--color-success)' :
      'var(--color-text-secondary)';
  }
};

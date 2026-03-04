/**
 * Proxy Service Module
 * Relays API requests through server-side proxy with managed key pool
 */
const ProxyService = {
  PROXY_URL: 'https://aiunlock.co/api/proxy/v1',
  SUPPORTED_PROVIDERS: ['gemini', 'openai', 'claude', 'stability'],
  RETRY_LIMIT: 3,
  _initialized: false,
  _currentKeys: {},
  _quotaCache: null,

  /** เริ่มต้น proxy service และดึง key pool จาก server */
  async init() {
    try {
      if (this._initialized) return true;
      const response = await fetch(`${this.PROXY_URL}/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Client-Id': await this._getClientId() }
      });
      if (!response.ok) throw new Error('Proxy service unavailable');
      const data = await response.json();
      this._currentKeys = data.activeKeys || {};
      this._quotaCache = data.quota || null;
      this._initialized = true;
      console.log('[ProxyService] init success, providers:', Object.keys(this._currentKeys));
      return true;
    } catch (error) {
      console.error('[ProxyService] init error:', error);
      this._initialized = false;
      return false;
    }
  },

  /** ส่ง request ผ่าน proxy ไปยัง provider ที่ระบุ */
  async relayRequest(provider, payload) {
    try {
      if (!this.SUPPORTED_PROVIDERS.includes(provider)) throw new Error(`Unsupported provider: ${provider}`);
      const keyId = await this.getAvailableKey(provider);
      if (!keyId) throw new Error(`No available key for ${provider}`);
      console.log('[ProxyService] relayRequest:', provider, 'keyId:', keyId);

      // ส่ง request ผ่าน proxy พร้อม retry
      let lastError = null;
      for (let attempt = 1; attempt <= this.RETRY_LIMIT; attempt++) {
        try {
          const response = await fetch(`${this.PROXY_URL}/relay`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Client-Id': await this._getClientId(),
              'X-Provider': provider,
              'X-Key-Id': keyId
            },
            body: JSON.stringify({ provider, keyId, payload, timestamp: Date.now() })
          });
          if (response.status === 429) {
            // rate limit → หมุน key แล้วลองใหม่
            console.log('[ProxyService] rate limited, rotating key...');
            await this.rotateKey(provider);
            continue;
          }
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `Proxy error: ${response.status}`);
          }
          const data = await response.json();
          // รายงานการใช้งาน token
          if (data.usage) await this.reportKeyUsage(keyId, data.usage.totalTokens || 0);
          return data.result;
        } catch (error) {
          lastError = error;
          console.warn(`[ProxyService] attempt ${attempt} failed:`, error.message);
        }
      }
      throw lastError || new Error('All relay attempts failed');
    } catch (error) {
      console.error('[ProxyService] relayRequest error:', error);
      Helpers.showToast('Proxy request failed: ' + error.message, 'error');
      throw error;
    }
  },

  /** ดึง key ที่ใช้ได้สำหรับ provider */
  async getAvailableKey(provider) {
    try {
      // ใช้ key จาก cache ก่อน
      if (this._currentKeys[provider]) return this._currentKeys[provider];
      // ขอ key ใหม่จาก server
      const response = await fetch(`${this.PROXY_URL}/key/acquire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-Id': await this._getClientId() },
        body: JSON.stringify({ provider })
      });
      if (!response.ok) { console.warn('[ProxyService] no key available for:', provider); return null; }
      const data = await response.json();
      this._currentKeys[provider] = data.keyId;
      console.log('[ProxyService] getAvailableKey:', provider, '->', data.keyId);
      return data.keyId;
    } catch (error) {
      console.error('[ProxyService] getAvailableKey error:', error);
      return null;
    }
  },

  /** รายงานจำนวน token ที่ใช้ไป */
  async reportKeyUsage(keyId, tokens) {
    try {
      await fetch(`${this.PROXY_URL}/key/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-Id': await this._getClientId() },
        body: JSON.stringify({ keyId, tokens, timestamp: Date.now() })
      });
      console.log('[ProxyService] reportKeyUsage:', keyId, 'tokens:', tokens);
    } catch (error) {
      // ไม่ throw เพราะเป็นแค่ reporting
      console.warn('[ProxyService] reportKeyUsage failed:', error.message);
    }
  },

  /** หมุนไปใช้ key ใหม่สำหรับ provider */
  async rotateKey(provider) {
    try {
      const oldKeyId = this._currentKeys[provider];
      const response = await fetch(`${this.PROXY_URL}/key/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-Id': await this._getClientId() },
        body: JSON.stringify({ provider, currentKeyId: oldKeyId })
      });
      if (!response.ok) throw new Error('Key rotation failed');
      const data = await response.json();
      this._currentKeys[provider] = data.newKeyId;
      console.log('[ProxyService] rotateKey:', provider, oldKeyId, '->', data.newKeyId);
      return data.newKeyId;
    } catch (error) {
      console.error('[ProxyService] rotateKey error:', error);
      delete this._currentKeys[provider];
      return null;
    }
  },

  /** ดึงสถานะ quota การใช้งาน */
  async getQuotaStatus() {
    try {
      const response = await fetch(`${this.PROXY_URL}/quota`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Client-Id': await this._getClientId() }
      });
      if (!response.ok) throw new Error('Failed to fetch quota');
      const data = await response.json();
      this._quotaCache = data;
      console.log('[ProxyService] getQuotaStatus:', data);
      return {
        daily: data.daily || { used: 0, limit: 0 },
        monthly: data.monthly || { used: 0, limit: 0 },
        providers: data.providers || {}
      };
    } catch (error) {
      console.error('[ProxyService] getQuotaStatus error:', error);
      return this._quotaCache || { daily: { used: 0, limit: 0 }, monthly: { used: 0, limit: 0 } };
    }
  },

  /** ดึง client ID จาก storage หรือสร้างใหม่ */
  async _getClientId() {
    const result = await chrome.storage.local.get(['flowProxyClientId']);
    if (result.flowProxyClientId) return result.flowProxyClientId;
    const clientId = 'flow_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
    await chrome.storage.local.set({ flowProxyClientId: clientId });
    return clientId;
  }
};

/**
 * TTL-aware localStorage wrapper used heavily in the original app-service.js
 */

export const storage = {
  get(key, defaultValue = null) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return defaultValue;
      
      const parsed = JSON.parse(stored);
      // Check TTL wrapper syntax { value: any, ttl: number, ts: number }
      if (parsed && typeof parsed === 'object' && 'ttl' in parsed && 'ts' in parsed) {
        if (parsed.ttl > 0 && Date.now() - parsed.ts > parsed.ttl) {
          this.remove(key);
          return defaultValue;
        }
        return parsed.value;
      }
      return parsed; // Fallback for raw non-TTL values
    } catch (e) {
      // If not JSON, return as string
      return localStorage.getItem(key) || defaultValue;
    }
  },

  set(key, value, ttlMs = 0) {
    try {
      if (ttlMs > 0) {
        const payload = {
          value,
          ttl: ttlMs,
          ts: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(payload));
      } else {
        localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    } catch (e) {
      console.error('Storage set err:', e);
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  touch(key) {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && 'ttl' in parsed && 'ts' in parsed) {
          parsed.ts = Date.now();
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      }
    } catch (e) {
      // ignored
    }
  }
};

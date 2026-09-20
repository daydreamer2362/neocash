const runtimeEnv = String(import.meta?.env?.VITE_APP_ENV || import.meta?.env?.MODE || 'dev').toLowerCase();
const resolvedEnv = (() => {
  if (runtimeEnv === 'production' || runtimeEnv === 'prod') return 'prod';
  if (runtimeEnv === 'development' || runtimeEnv === 'dev' || runtimeEnv === 'local') return 'dev';
  if (runtimeEnv === 'sit') return 'sit';
  return 'dev';
})();
const explicitBaseURL = String(import.meta?.env?.VITE_API_BASE_URL || '').trim();
const explicitBaseURLs = String(import.meta?.env?.VITE_API_BASE_URLS || '')
  .split(',')
  .map((item) => String(item || '').trim())
  .filter(Boolean);
const isBrowser = typeof window !== 'undefined';
const hostname = isBrowser ? window.location.hostname : '';
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
const nativePlatform = (() => {
  if (!isBrowser) return '';
  try {
    const cap = window.Capacitor;
    if (typeof cap?.getPlatform === 'function') {
      const platform = String(cap.getPlatform() || '').toLowerCase();
      if (platform && platform !== 'web') return platform;
    }
    if (typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()) {
      const ua = String(window.navigator?.userAgent || '').toLowerCase();
      if (ua.includes('android')) return 'android';
      if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'ios';
      return 'native';
    }
  } catch (e) {}
  return '';
})();
const isNativeApp = Boolean(nativePlatform);
const nativeDefaultBaseURL = nativePlatform === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const nativeBaseURLCandidates = isNativeApp
  ? ['http://10.0.2.2:3000', 'http://127.0.0.1:3000', 'http://localhost:3000']
  : [];
const webLocalDefaultBaseURL = 'http://127.0.0.1:3000';
const webLocalCandidates = (isBrowser && isLocalHost)
  ? ['http://127.0.0.1:3000', 'http://localhost:3000']
  : [];
const devBaseURL = explicitBaseURL || (isNativeApp
  ? nativeDefaultBaseURL
  : (isBrowser && !isLocalHost ? '' : webLocalDefaultBaseURL));
const explicitWsBaseURL = String(import.meta?.env?.VITE_WS_BASE_URL || '').trim();
const parsedFailoverTimeout = Number(import.meta?.env?.VITE_API_FAILOVER_TIMEOUT_MS || 2500);
const failoverAttemptTimeout = Number.isFinite(parsedFailoverTimeout)
  ? Math.max(800, Math.min(parsedFailoverTimeout, 12000))
  : 2500;

export const config = {
  env: resolvedEnv,
  appVersion: String(import.meta?.env?.VITE_APP_VERSION || '1.1.1'),
  timeout: 20000,
  maxRetryTimeout: 45000,
  failoverAttemptTimeout,
  retryDelay: 400,
  maxGetRetries: 3,
  maxAuthRetries: 3,
  maxCriticalPostRetries: 2,

  baseURLMap: {
    prod: explicitBaseURL || '',
    sit: 'https://sit-api.example.com',
    // Default to local backend for non-proxy/static runs; Vite proxy still works with this.
    dev: devBaseURL
  },
  wsBaseURL: explicitWsBaseURL || '',

  captcha: {
    siteKey: '6LfZk_QqAAAAAO7JFG8q88DtIE8ei5ErdZc0624L'
  },

  // Gets all candidate URLs for the current environment
  getBaseURLCandidates() {
    const configured = explicitBaseURL ? [explicitBaseURL, ...explicitBaseURLs] : [...explicitBaseURLs];
    if (configured.length) {
      const merged = [...configured, ...nativeBaseURLCandidates, ...webLocalCandidates];
      return Array.from(new Set(merged.map((item) => String(item || '').trim()).filter(Boolean)));
    }
    const envUrls = this.baseURLMap[this.env];
    const urls = envUrls !== undefined ? envUrls : this.baseURLMap.prod;
    const envCandidates = Array.isArray(urls) ? urls : [urls];
    const merged = [...envCandidates, ...nativeBaseURLCandidates, ...webLocalCandidates];
    return Array.from(new Set(merged.map((item) => String(item || '').trim()).filter(Boolean)));
  }
};

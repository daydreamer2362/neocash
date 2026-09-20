import { createApp } from 'vue'
import { injectSpeedInsights } from '@vercel/speed-insights'
import './style.css'
import App from './App.vue'
import router from './router'
import api from './api'
import { http } from './api/http'
import { config } from './api/config'
import {
  buildUrl,
  getCandidateBaseUrls,
  getStoredBaseUrl,
  normalizeHttpUrl,
  setStoredBaseUrl
} from './api/baseUrl'

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', 'dark');
}

const normalizePublicInvitePath = () => {
  if (typeof window === 'undefined') return;
  const path = String(window.location.pathname || '').replace(/\/+$/, '');
  const qs = new URLSearchParams(String(window.location.search || ''));
  const inviteFromQuery = String(qs.get('invite') || qs.get('code') || '').trim();
  const match = path.match(/^\/users_invite_code\/([A-Za-z0-9]{3,32})$/i);
  const inviteFromPath = match ? String(match[1] || '').trim() : '';
  const directMatch = path.match(/^\/([A-Za-z0-9]{4,20})$/i);
  let inviteFromDirectPath = directMatch ? String(directMatch[1] || '').trim() : '';
  
  const ignoredPaths = ['login', 'register', 'home', 'team', 'wallet', 'orders', 'score', 'deposit', 'payment', 'message', 'service', 'statistics', 'my'];
  if (ignoredPaths.includes(inviteFromDirectPath.toLowerCase())) {
    inviteFromDirectPath = '';
  }

  const inviteCode = inviteFromPath || inviteFromDirectPath || inviteFromQuery;
  if (!inviteCode) return;
  
  // Preserve any other query parameters except 'invite' or 'code' if we want, but for now just pass invite
  const target = `${window.location.origin}/#/register?invite=${encodeURIComponent(inviteCode)}`;
  
  // Only redirect if the current full href does not match (to avoid loops)
  // Wait, if we are at /register?invite=XYZ, href is different from /#/register?invite=XYZ. This is correct.
  if (window.location.href !== target) {
    window.location.replace(target);
  }
};

const readJsonSafe = async (res) => {
  try {
    return await res.json();
  } catch (e) {
    return null;
  }
};

const checkApiBaseHealth = async (baseUrl, timeoutMs = 6000) => {
  const target = normalizeHttpUrl(baseUrl || '');
  if (!target) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(buildUrl(target, '/app/base/param'), {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return false;
    const json = await readJsonSafe(res);
    return json?.code === 1000;
  } catch (e) {
    return false;
  }
};

const RUNTIME_REPORT_THROTTLE_MS = 45000;
const runtimeReportSeen = new Map();

const readClientRoutePath = () => {
  if (typeof window === 'undefined') return '/';
  const hash = String(window.location.hash || '').replace(/^#/, '');
  if (hash) return hash.startsWith('/') ? hash : `/${hash}`;
  return String(window.location.pathname || '/');
};

const isLowSignalClientRuntimeError = (payload = {}) => {
  const message = String(payload.message || '').trim().toLowerCase();
  const source = String(payload.source || '').trim().toLowerCase();
  const stack = String(payload.stack || '').trim();

  if (!message) return true;
  if ((message === 'script error.' || message === 'script error' || message === 'window error') && !stack) {
    return true;
  }
  if (message.includes('resizeobserver loop limit exceeded')) return true;
  if (source.startsWith('chrome-extension://') || source.startsWith('moz-extension://') || source.startsWith('safari-extension://')) {
    return true;
  }
  return false;
};

const allowRuntimeErrorReport = (payload = {}) => {
  const now = Date.now();
  const route = readClientRoutePath();
  const fingerprint = [
    String(payload.type || 'CLIENT_RUNTIME_ERROR').toUpperCase(),
    route,
    String(payload.message || '').trim().slice(0, 160),
    String(payload.source || '').trim().slice(0, 120),
    Number(payload.line || 0),
    Number(payload.col || 0)
  ].join('|');

  const prev = Number(runtimeReportSeen.get(fingerprint) || 0);
  if (now - prev < RUNTIME_REPORT_THROTTLE_MS) return false;
  runtimeReportSeen.set(fingerprint, now);
  if (runtimeReportSeen.size > 300) {
    const threshold = now - (RUNTIME_REPORT_THROTTLE_MS * 3);
    for (const [k, ts] of runtimeReportSeen.entries()) {
      if (Number(ts || 0) < threshold) runtimeReportSeen.delete(k);
    }
  }
  return true;
};

const setupClientCrashTelemetry = () => {
  if (typeof window === 'undefined') return;
  if (window.__gpCrashTelemetryReady) return;
  window.__gpCrashTelemetryReady = true;

  const push = (payload) => {
    try {
      if (isLowSignalClientRuntimeError(payload)) return;
      if (!allowRuntimeErrorReport(payload)) return;
      const candidates = getCandidateBaseUrls(config.env, config.getBaseURLCandidates(), {
        includeOrigin: false,
        strictStoredOnly: false
      }).slice(0, 2);
      const base = candidates[0] || '';
      const endpoint = buildUrl(base, '/app/client/error');
      const body = JSON.stringify({
        type: payload.type || 'CLIENT_RUNTIME_ERROR',
        severity: payload.severity || 'high',
        message: String(payload.message || 'Client runtime failure').slice(0, 200),
        method: 'RUNTIME',
        path: readClientRoutePath(),
        meta: {
          source: payload.source || '',
          line: payload.line || 0,
          col: payload.col || 0,
          stack: String(payload.stack || '').slice(0, 500),
          ua: String(navigator?.userAgent || '').slice(0, 220),
          href: String(window.location.href || '').slice(0, 300),
          platform: (() => {
            try { return window.Capacitor?.getPlatform?.() || 'web'; } catch (e) { return 'web'; }
          })(),
        }
      });

      if (typeof navigator?.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
        return;
      }
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  };

  window.addEventListener('error', (event) => {
    push({
      type: 'CLIENT_RUNTIME_ERROR',
      severity: 'high',
      message: event?.message || 'Window error',
      source: event?.filename || '',
      line: event?.lineno || 0,
      col: event?.colno || 0,
      stack: event?.error?.stack || ''
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = typeof reason === 'string'
      ? reason
      : String(reason?.message || reason || 'Unhandled promise rejection');
    push({
      type: 'CLIENT_PROMISE_REJECTION',
      severity: 'high',
      message,
      stack: String(reason?.stack || '').slice(0, 500)
    });
  });
};

const applyRemoteBaseUrlFromSettings = async () => {
  const pref = getStoredBaseUrl(config.env);
  const candidates = getCandidateBaseUrls(config.env, config.getBaseURLCandidates(), {
    includeOrigin: true,
    strictStoredOnly: false
  }).slice(0, 5);

  for (const base of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(buildUrl(base, '/app/base/param'), {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;
      const json = await readJsonSafe(res);
      if (json?.code !== 1000) continue;
      const remoteBase = normalizeHttpUrl(json?.data?.API_BASE_URL || json?.data?.apiBaseUrl || '');
      if (remoteBase && remoteBase !== pref) {
        const healthy = await checkApiBaseHealth(remoteBase);
        if (healthy) {
          setStoredBaseUrl(config.env, remoteBase);
        }
      }
      return;
    } catch (e) {}
  }
};

const app = createApp(App)
app.config.globalProperties.$api = api
app.config.globalProperties.$http = http

if (String(import.meta?.env?.VITE_ENABLE_SPEED_INSIGHTS || '').toLowerCase() === 'true') {
  try {
    injectSpeedInsights();
  } catch (e) {}
}
normalizePublicInvitePath();
setupClientCrashTelemetry();
await applyRemoteBaseUrlFromSettings();

app.use(router).mount('#app')

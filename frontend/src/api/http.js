import { config } from './config';
import { auth } from './auth';
import { toast } from '../utils/toast';
import { loading } from '../utils/loading';
import { isTestSessionToken } from '../utils/testAuth';
import { buildUrl, clearStoredBaseUrl, getCandidateBaseUrls, getStoredBaseUrl, setStoredBaseUrl } from './baseUrl';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

// Public endpoints that don't need token
const PUBLIC_ENDPOINTS = new Set([
  '/app/user/login/login',
  '/app/user/login/sendotp',
  '/app/user/login/forgot',
  '/app/user/rs/submit',
  '/app/client/error',
  '/captcha'
]);

function isPublic(url) {
  const path = String(url).split('?')[0].toLowerCase();
  for (const endpoint of PUBLIC_ENDPOINTS) {
    if (path.includes(endpoint)) return true;
  }
  return false;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const CACHE_TTL_MS = 45000;
const CACHE_PREFIX = 'http_cache_v1:';
const CACHEABLE_GET_PATTERNS = [
  '/app/base/param',
  '/app/news/notice',
  '/app/content/page',
  '/app/app/version/info/getlatestappversion',
  '/app/app/official/service/getofficialservicedata'
];
const CLIENT_ERROR_ENDPOINT = '/app/client/error';
const CLIENT_REPORT_THROTTLE_MS = 20000;
const clientErrorReportSeen = new Map();
const CLIENT_ERROR_QUEUE_KEY = '__gp_client_error_queue_v1__';
const CLIENT_ERROR_QUEUE_LIMIT = 80;
let clientErrorFlushInProgress = false;
const REQUEST_ID_HEADER = 'X-Client-Request-Id';

function createClientRequestId() {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `gp-${time}-${rand}`;
}

function shouldAddNgrokHeader(baseUrl) {
  const v = String(baseUrl || '').toLowerCase();
  return v.includes('ngrok');
}

function shouldUseAuthRetry(url, method) {
  const path = String(url || '').toLowerCase().split('?')[0];
  const m = String(method || '').toUpperCase();
  if (m !== 'POST') return false;
  return (
    path.includes('/app/user/login/login') ||
    path.includes('/app/user/login/sendotp') ||
    path.includes('/app/user/login/forgot')
  );
}

function shouldUseCriticalPostRetry(url, method) {
  const path = String(url || '').toLowerCase().split('?')[0];
  const m = String(method || '').toUpperCase();
  if (m !== 'POST') return false;
  return (
    path.includes('/app/user/rs/submit') ||
    path.includes('/app/payment/order/submit') ||
    path.includes('/app/usdt/order') ||
    path.includes('/app/ct/app/collection/submit') ||
    path.includes('/app/mission/task/receive')
  );
}

function resolveNetworkRetryCount(url, method, explicitRetry) {
  if (Number.isInteger(explicitRetry)) return Math.max(0, explicitRetry);
  if (String(method || '').toUpperCase() === 'GET') {
    return Math.max(0, Number(config.maxGetRetries || 0));
  }
  if (shouldUseAuthRetry(url, method)) {
    return Math.max(0, Number(config.maxAuthRetries || 0));
  }
  if (shouldUseCriticalPostRetry(url, method)) {
    return Math.max(0, Number(config.maxCriticalPostRetries || 0));
  }
  return 0;
}

function retryDelayMs(attemptIndex) {
  const base = Math.max(100, Number(config.retryDelay || 300));
  const jitter = Math.floor(Math.random() * 120);
  return Math.min(2000, (base * (attemptIndex + 1)) + jitter);
}

function resolveAttemptTimeout(baseTimeout, attemptIndex) {
  const minTimeout = Math.max(6000, Number(baseTimeout || config.timeout || 15000));
  const boosted = Math.round(minTimeout * (1 + (attemptIndex * 0.35)));
  const cap = Math.max(minTimeout, Number(config.maxRetryTimeout || minTimeout));
  return Math.min(boosted, cap);
}

function isNativePlatform() {
  if (typeof window !== 'undefined') {
    const wCap = window.Capacitor;
    try {
      if (typeof wCap?.getPlatform === 'function' && wCap.getPlatform() !== 'web') return true;
      if (typeof wCap?.isNativePlatform === 'function' && wCap.isNativePlatform()) return true;
    } catch (e) {}
  }
  try {
    if (typeof Capacitor?.getPlatform === 'function' && Capacitor.getPlatform() !== 'web') return true;
    if (typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform()) return true;
  } catch (e) {
  }
  return false;
}

function isNetworkTransportError(error) {
  const errMsg = String(error?.message || '').toLowerCase();
  return (
    isTimeoutTransportError(error) ||
    errMsg.includes('failed to fetch') ||
    errMsg.includes('network') ||
    errMsg.includes('unable to resolve host') ||
    errMsg.includes('no address associated with hostname') ||
    errMsg.includes('enotfound') ||
    errMsg.includes('eai_again') ||
    errMsg.includes('econnrefused') ||
    errMsg.includes('timed out') ||
    errMsg.includes('timeout')
  );
}

function isTimeoutTransportError(error) {
  const errMsg = String(error?.message || '').toLowerCase();
  return error?.name === 'AbortError' || errMsg.includes('timed out') || errMsg.includes('timeout');
}

function isRetryableServerStatus(status) {
  const code = Number(status || 0);
  return code === 429 || code === 502 || code === 503 || code === 504;
}

function isClientOffline() {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch (e) {
    return false;
  }
}

function getSafeRequestErrorMessage(error) {
  const errMsg = String(error?.message || '').toLowerCase();
  const retryableStatus = Number(error?.__gpRetryableStatus || 0);
  if (errMsg.includes('invalid json response (received html)')) {
    return 'Your network or ISP may be blocking the connection. Try switching to mobile data or Wi-Fi.';
  }
  if (errMsg.includes('invalid json response')) {
    return 'Network connection intercepted or invalid response. Please try using a different network or VPN.';
  }
  if (errMsg.includes('cleartext') || errMsg.includes('ssl') || errMsg.includes('certificate')) {
    return 'Secure connection failed. Please try again on a stable network.';
  }
  if (retryableStatus && isRetryableServerStatus(retryableStatus)) {
    return 'Request is delayed. Please retry in a moment.';
  }
  if (isTimeoutTransportError(error)) {
    return 'Request is taking longer than expected. Please retry in a moment.';
  }
  if (isClientOffline()) {
    return 'Connection is unstable. We are retrying, please try again shortly.';
  }
  if (isNetworkTransportError(error)) {
    return 'Request could not be completed right now. Please try again shortly.';
  }
  return 'Request failed. Please try again.';
}

function isApiMismatchError(error) {
  const errMsg = String(error?.message || '').toLowerCase();
  return errMsg.includes('invalid json response');
}

function sanitizeUserMessage(input, fallback = 'Request failed. Please try again.') {
  const raw = String(input || '').trim();
  if (!raw) return fallback;
  const sanitized = raw
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi, '[host]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
    .replace(/\b(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)\b/gi, '[network]')
    .slice(0, 180);
  if (!sanitized) return fallback;
  if (/\b(exception|stack|traceback|sqlstate|sequel|database error|internal error|node:|syntaxerror)\b/i.test(sanitized)) {
    return fallback;
  }
  return sanitized;
}

function readUserAgent() {
  try {
    return String(navigator?.userAgent || '').slice(0, 220);
  } catch (e) {
    return '';
  }
}

function allowClientErrorReport(key) {
  const now = Date.now();
  const last = Number(clientErrorReportSeen.get(key) || 0);
  if (now - last < CLIENT_REPORT_THROTTLE_MS) return false;
  clientErrorReportSeen.set(key, now);
  if (clientErrorReportSeen.size > 400) {
    const threshold = now - (CLIENT_REPORT_THROTTLE_MS * 2);
    for (const [k, ts] of clientErrorReportSeen.entries()) {
      if (ts < threshold) clientErrorReportSeen.delete(k);
    }
  }
  return true;
}

function hostFromBaseUrl(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch (e) {
    return String(baseUrl || '').replace(/^https?:\/\//i, '').split('/')[0] || '';
  }
}

function rankBaseUrlForLocalDev(url) {
  const normalized = String(url || '').trim().toLowerCase();
  if (!normalized) return 100;
  if (normalized.startsWith('http://127.0.0.1:3000')) return 0;
  if (normalized.startsWith('http://localhost:3000')) return 1;
  if (typeof window !== 'undefined') {
    const origin = String(window.location.origin || '').trim().toLowerCase();
    if (origin && normalized.startsWith(origin)) return 2;
  }
  return 10;
}

function readClientErrorQueue() {
  try {
    const raw = localStorage.getItem(CLIENT_ERROR_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === 'object').slice(0, CLIENT_ERROR_QUEUE_LIMIT);
  } catch (e) {
    return [];
  }
}

function writeClientErrorQueue(items) {
  try {
    const next = Array.isArray(items) ? items.slice(0, CLIENT_ERROR_QUEUE_LIMIT) : [];
    if (!next.length) {
      localStorage.removeItem(CLIENT_ERROR_QUEUE_KEY);
      return;
    }
    localStorage.setItem(CLIENT_ERROR_QUEUE_KEY, JSON.stringify(next));
  } catch (e) {}
}

function enqueueClientError(item) {
  const queue = readClientErrorQueue();
  queue.unshift({
    ...item,
    queuedAt: new Date().toISOString()
  });
  writeClientErrorQueue(queue);
}

async function postClientErrorBody(body, candidates) {
  const reqBody = JSON.stringify(body);
  for (const baseUrl of candidates) {
    const fullUrl = buildUrl(baseUrl, CLIENT_ERROR_ENDPOINT);
    try {
      if (isNativePlatform()) {
        await CapacitorHttp.request({
          url: fullUrl,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: body,
          readTimeout: 3000,
          connectTimeout: 3000
        });
      } else {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        await fetch(fullUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: reqBody,
          signal: controller.signal,
          keepalive: true
        });
        clearTimeout(timeoutId);
      }
      return true;
    } catch (e) {}
  }
  return false;
}

async function flushQueuedClientErrors(preferredBaseUrl = '') {
  if (clientErrorFlushInProgress) return;
  let queue = readClientErrorQueue();
  if (!queue.length) return;
  clientErrorFlushInProgress = true;
  try {
    const candidates = [];
    if (preferredBaseUrl) candidates.push(preferredBaseUrl);
    const fallbackCandidates = getCandidateBaseUrls(config.env, config.getBaseURLCandidates(), {
      includeOrigin: true,
      strictStoredOnly: false
    }).slice(0, 3);
    fallbackCandidates.forEach((url) => {
      if (url && !candidates.includes(url)) candidates.push(url);
    });

    const remaining = [];
    for (const item of queue.slice(0, CLIENT_ERROR_QUEUE_LIMIT)) {
      const sent = await postClientErrorBody(item, candidates);
      if (!sent) remaining.push(item);
    }
    writeClientErrorQueue(remaining);
  } finally {
    clientErrorFlushInProgress = false;
  }
}

async function reportClientError(payload = {}, preferredBaseUrl = '') {
  const type = String(payload.type || 'CLIENT_RUNTIME_ERROR').toUpperCase();
  const method = String(payload.method || 'GET').toUpperCase();
  const path = String(payload.path || '').slice(0, 180);
  const status = Number(payload.status || 0) || 0;
  const message = sanitizeUserMessage(payload.message || 'Client error', 'Client error');
  const throttleKey = `${type}|${method}|${path}|${status}|${message}`;
  if (!allowClientErrorReport(throttleKey)) return;

  const body = {
    type,
    severity: payload.severity || 'medium',
    message,
    method,
    path,
    meta: {
      status,
      code: payload.code || null,
      baseHost: payload.baseHost || '',
      attemptedHosts: Array.isArray(payload.attemptedHosts) ? payload.attemptedHosts.slice(0, 6) : [],
      requestId: String(payload.requestId || '').slice(0, 120),
      serverRequestId: String(payload.serverRequestId || '').slice(0, 120),
      retryAttempts: Number(payload.retryAttempts || 0),
      timeoutMs: Number(payload.timeoutMs || 0),
      platform: (() => {
        try { return Capacitor?.getPlatform?.() || 'web'; } catch (e) { return 'web'; }
      })(),
      ua: readUserAgent(),
      env: config.env
    }
  };

  const candidates = [];
  if (preferredBaseUrl) candidates.push(preferredBaseUrl);
  const fallbackCandidates = getCandidateBaseUrls(config.env, config.getBaseURLCandidates(), {
    includeOrigin: true,
    strictStoredOnly: false
  }).slice(0, 3);
  fallbackCandidates.forEach((url) => {
    if (url && !candidates.includes(url)) candidates.push(url);
  });

  const sent = await postClientErrorBody(body, candidates);
  if (!sent) {
    enqueueClientError(body);
  }
}

function normalizeResponseHeaders(rawHeaders) {
  const out = {};
  if (!rawHeaders || typeof rawHeaders !== 'object') return out;
  Object.keys(rawHeaders).forEach((key) => {
    const normalizedKey = String(key || '').toLowerCase();
    if (!normalizedKey) return;
    const value = rawHeaders[key];
    if (Array.isArray(value)) {
      out[normalizedKey] = value.join(', ');
      return;
    }
    if (value === undefined || value === null) return;
    out[normalizedKey] = String(value);
  });
  return out;
}

async function executeHttpRequest(url, method, headers, body, timeout) {
  const upperMethod = String(method || 'GET').toUpperCase();
  const onNative = isNativePlatform();

  if (onNative) {
    if (typeof window !== 'undefined' && !window.__gp_native_http_logged) {
      window.__gp_native_http_logged = true;
      console.error('NeoCash: using Capacitor native HTTP transport');
    }
    let nativeData = body;
    if (
      typeof nativeData === 'string' &&
      String(headers?.['Content-Type'] || headers?.['content-type'] || '').includes('application/json')
    ) {
      try {
        nativeData = JSON.parse(nativeData);
      } catch (e) {}
    }
    const nativeRes = await CapacitorHttp.request({
      url,
      method: upperMethod,
      headers,
      data: nativeData,
      readTimeout: timeout,
      connectTimeout: timeout
    });

    let payload = nativeRes?.data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {}
    }
    return {
      ok: nativeRes.status >= 200 && nativeRes.status < 300,
      status: nativeRes.status,
      json: payload,
      headers: normalizeResponseHeaders(nativeRes?.headers || {})
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const fetchOptions = {
    method: upperMethod,
    headers,
    signal: controller.signal
  };
  if (upperMethod !== 'GET' && upperMethod !== 'HEAD' && body !== undefined) {
    fetchOptions.body = body;
  }
  let res;
  try {
    res = await fetch(url, fetchOptions);
  } finally {
    clearTimeout(timeoutId);
  }
  const rawBody = await res.text();
  let json = null;
  if (rawBody) {
    try {
      json = JSON.parse(rawBody);
    } catch (e) {
      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        throw new Error('Invalid JSON response (received HTML)');
      }
      throw new Error('Invalid JSON response');
    }
  }
  if (typeof json !== 'object' || json === null) {
    throw new Error('Invalid JSON response');
  }
  return {
    ok: res.ok,
    status: res.status,
    json,
    headers: (() => {
      const out = {};
      try {
        res.headers.forEach((value, key) => {
          out[String(key || '').toLowerCase()] = String(value || '');
        });
      } catch (e) {}
      return out;
    })()
  };
}

function canCacheGet(url, method) {
  if (String(method || '').toUpperCase() !== 'GET') return false;
  const path = String(url || '').toLowerCase();
  return CACHEABLE_GET_PATTERNS.some((pattern) => path.includes(pattern));
}

function readCachedResponse(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - Number(parsed.ts || 0) > CACHE_TTL_MS) return null;
    return parsed.data || null;
  } catch (e) {
    return null;
  }
}

function writeCachedResponse(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {}
}

async function request(options = {}) {
  const {
    url = '',
    method = 'GET',
    data = {},
    header = {},
    timeout = config.timeout,
    showLoading = false,
    loadingText = 'Loading...',
    showToastOnError = true,
    withToken = !isPublic(url),
    retry
  } = options;

  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
  const clientRequestId = createClientRequestId();
  const headers = {
    ...header,
    ...(withToken ? auth.authHeader() : {}),
    [REQUEST_ID_HEADER]: clientRequestId
  };
  const upperMethod = String(method || '').toUpperCase();
  if (
    upperMethod !== 'GET' &&
    upperMethod !== 'HEAD' &&
    !isFormData &&
    !headers['Content-Type']
  ) {
    headers['Content-Type'] = 'application/json';
  }

  if (showLoading) loading.show(loadingText);



  // Determine retry count for transport errors only.
  const maxRetries = resolveNetworkRetryCount(url, method, retry);
  
  // URL candidates for failover
  let pref = getStoredBaseUrl(config.env);
  const isLocalDevWeb = typeof window !== 'undefined'
    && config.env === 'dev'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (isLocalDevWeb && pref) {
    const lower = String(pref).toLowerCase();
    const isLocalPref = lower.includes('127.0.0.1:3000') || lower.includes('localhost:3000');
    if (!isLocalPref) {
      clearStoredBaseUrl(config.env);
      pref = '';
    }
  }
  let sortedCandidates = getCandidateBaseUrls(config.env, config.getBaseURLCandidates(), {
    includeOrigin: true,
    strictStoredOnly: false
  });
  if (isLocalDevWeb && sortedCandidates.length > 1) {
    sortedCandidates = [...sortedCandidates].sort((a, b) => rankBaseUrlForLocalDev(a) - rankBaseUrlForLocalDev(b));
  }
  const limit = Math.min(sortedCandidates.length || 1, 5);
  const hasMultipleBaseUrls = limit > 1;
  const configuredTimeout = Number(timeout || config.timeout || 0);
  const fastFailoverTimeout = Math.max(1200, Number(config.failoverAttemptTimeout || 2500));
  const perBaseAttemptTimeout = hasMultipleBaseUrls
    ? Math.min(Math.max(configuredTimeout || fastFailoverTimeout, 1200), fastFailoverTimeout)
    : configuredTimeout;
  const retriesPerBase = hasMultipleBaseUrls ? 0 : maxRetries;

  let attempt = 0;
  let lastError = null;
  const attemptedHosts = [];
  let lastServerRequestId = '';
  let totalRetriesTried = 0;
  let lastAttemptTimeout = Number(timeout || config.timeout || 0);
  const cacheKey = `${CACHE_PREFIX}${url}`;
  const isCacheableGet = canCacheGet(url, method);

  while (attempt < limit) {
    const baseUrl = sortedCandidates[attempt] || '';
    const baseHost = hostFromBaseUrl(baseUrl);
    if (baseHost && !attemptedHosts.includes(baseHost)) attemptedHosts.push(baseHost);
    const fullUrl = buildUrl(baseUrl, url);
    let retryCount = 0;
    const runtimeHeaders = {
      ...headers,
      ...(shouldAddNgrokHeader(baseUrl) ? { 'ngrok-skip-browser-warning': 'true' } : {})
    };

    while (retryCount <= retriesPerBase) {
      try {
        const requestBody = method !== 'GET' && method !== 'HEAD'
          ? (isFormData ? data : JSON.stringify(data))
          : undefined;
        const requestTimeout = hasMultipleBaseUrls
          ? perBaseAttemptTimeout
          : resolveAttemptTimeout(timeout, retryCount);
        lastAttemptTimeout = requestTimeout;
        const result = await executeHttpRequest(
          fullUrl,
          method,
          runtimeHeaders,
          requestBody,
          requestTimeout
        );
        const serverRequestId = String(
          result?.headers?.['x-request-id']
          || result?.headers?.['x-client-request-id']
          || ''
        ).slice(0, 120);
        const serverRequestRef = serverRequestId || String(result?.json?.requestId || '').slice(0, 120);
        if (serverRequestRef) lastServerRequestId = serverRequestRef;

        if (result.status === 401) {
          auth.clearAuth();
          toast.show({ title: 'Session expired, please login again', icon: 'error' });
          setTimeout(() => {
            window.location.href = '/#/login';
          }, 600);
          if (showLoading) loading.hide();
          return Promise.reject(new Error('Unauthorized'));
        }

        if (isRetryableServerStatus(result.status) && retryCount < retriesPerBase) {
          const transientErr = new Error(`Retryable server status ${result.status}`);
          transientErr.__gpRetryableStatus = result.status;
          transientErr.__gpServerRequestId = serverRequestRef;
          transientErr.__gpClientRequestId = clientRequestId;
          throw transientErr;
        }

        const json = result.json;
        if (typeof json !== 'object' || json === null) {
          throw new Error('Invalid JSON response');
        }
        
        // Success criteria: HTTP 200 AND config business logic code 1000
        if (result.ok && json.code === 1000) {
          if (baseUrl && baseUrl !== pref) setStoredBaseUrl(config.env, baseUrl);
          if (isCacheableGet) writeCachedResponse(cacheKey, json);
          void flushQueuedClientErrors(baseUrl);
          if (showLoading) loading.hide();
          return json;
        }

        // Business Logic Error
        if (json.code === 1001 || json.code === 1002) {
          auth.clearAuth();
          toast.show({ title: 'Session expired, please login again', icon: 'error' });
          setTimeout(() => {
            window.location.href = '/#/login';
          }, 600);
          if (showLoading) loading.hide();
          return Promise.reject(new Error('Unauthorized'));
        }

        let errorMsg = sanitizeUserMessage(json.msg || json.message);
        if (isRetryableServerStatus(result.status)) {
          errorMsg = 'Request is delayed. Please retry in a moment.';
        }
        reportClientError({
          type: 'CLIENT_API_ERROR',
          severity: result.status >= 500 ? 'high' : 'medium',
          message: errorMsg,
          method: upperMethod,
          path: url,
          status: result.status,
          code: json.code,
          baseHost,
          requestId: clientRequestId,
          serverRequestId: serverRequestRef,
          retryAttempts: retryCount,
          timeoutMs: requestTimeout
        }, baseUrl);
        if (showToastOnError) toast.show({ title: errorMsg, icon: 'error' });
        if (showLoading) loading.hide();
        return Promise.reject(json);

      } catch (err) {
        lastError = err;
        const isNetworkErr = isNetworkTransportError(err);
        const retryableStatus = Number(err?.__gpRetryableStatus || 0);
        const isRetryableStatusErr = isRetryableServerStatus(retryableStatus);
        if (String(err?.__gpServerRequestId || '').trim()) {
          lastServerRequestId = String(err.__gpServerRequestId).slice(0, 120);
        }

        if (isNetworkErr || isRetryableStatusErr) {
          const errMsg = err?.message || '';
          console.error('HTTP transport/retryable error', {
            url: fullUrl,
            method,
            requestId: clientRequestId,
            serverRequestId: lastServerRequestId || '',
            error: errMsg || String(err),
            retryableStatus: retryableStatus || undefined,
            timeoutMs: lastAttemptTimeout,
            attempt: retryCount + 1,
            maxAttempts: retriesPerBase + 1
          });
          retryCount++;
          totalRetriesTried = Math.max(totalRetriesTried, retryCount);
          if (retryCount <= retriesPerBase) {
            if (hasMultipleBaseUrls) break;
            await sleep(retryDelayMs(retryCount));
            continue; // Retry same URL
          }
        } else {
          break; // Don't retry non-network errors
        }
      }
    }
    // Try next URL
    attempt++;
  }

  if (showLoading) loading.hide();
  if (isCacheableGet) {
    const cached = readCachedResponse(cacheKey);
    if (cached) return cached;
  }
  if (lastError && (isNetworkTransportError(lastError) || isApiMismatchError(lastError)) && pref) {
    clearStoredBaseUrl(config.env);
  }
  const lastAttemptedHost = attemptedHosts[attemptedHosts.length - 1] || attemptedHosts[0] || '';
  const errorText = lastError ? getSafeRequestErrorMessage(lastError) : 'Server unavailable';
  if (lastError && isNetworkTransportError(lastError)) {
    reportClientError({
      type: 'CLIENT_NETWORK_ERROR',
      severity: 'high',
      message: String(lastError?.message || 'Network unreachable'),
      method: upperMethod,
      path: url,
      baseHost: lastAttemptedHost,
      attemptedHosts,
      requestId: clientRequestId,
      serverRequestId: lastServerRequestId || String(lastError?.__gpServerRequestId || ''),
      retryAttempts: totalRetriesTried,
      timeoutMs: lastAttemptTimeout
    }, sortedCandidates[0] || '');
  } else if (lastError) {
    reportClientError({
      type: 'CLIENT_RUNTIME_ERROR',
      severity: 'medium',
      message: String(lastError?.message || 'Client runtime error'),
      method: upperMethod,
      path: url,
      baseHost: lastAttemptedHost,
      attemptedHosts,
      requestId: clientRequestId,
      serverRequestId: lastServerRequestId || String(lastError?.__gpServerRequestId || ''),
      retryAttempts: totalRetriesTried,
      timeoutMs: lastAttemptTimeout
    }, sortedCandidates[0] || '');
  }
  if (showToastOnError) toast.show({ title: errorText, icon: 'error' });
  return Promise.reject(lastError || new Error('All base URLs failed'));
}

export const http = {
  get(url, data, config = {}) {
    let queryStr = '';
    if (data && Object.keys(data).length > 0) {
      const params = new URLSearchParams();
      Object.keys(data).forEach(k => {
        if (data[k] !== undefined && data[k] !== null) {
          params.append(k, data[k]);
        }
      });
      queryStr = '?' + params.toString();
    }
    return request({ ...config, url: url + queryStr, method: 'GET' });
  },

  post(url, data, config = {}) {
    return request({ ...config, url, data, method: 'POST' });
  },

  put(url, data, config = {}) {
    return request({ ...config, url, data, method: 'PUT' });
  },

  del(url, data, config = {}) {
    return request({ ...config, url, data, method: 'DELETE' });
  }
};

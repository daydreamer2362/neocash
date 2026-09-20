import { NextFunction, Request, Response } from 'express';
import { recordSecurityEvent } from '../utils/securityMonitor';

const SCAN_PATH_PATTERNS = [
  '.env',
  'wp-admin',
  'phpmyadmin',
  'mysql',
  'manager/html',
  'actuator',
  'server-status',
  '.git',
  '../',
  '..%2f',
];

const ATTACK_PATTERNS: Array<{ regex: RegExp; type: string; severity: 'high' | 'critical'; block: boolean }> = [
  {
    regex: /\bunion(?:\s+all)?\s+select\b|\binformation_schema\b|\bpg_catalog\b|\bpg_sleep\s*\(|\bsleep\s*\(|\bbenchmark\s*\(|\bwaitfor\s+delay\b|\bdrop\s+table\b/i,
    type: 'SQL_INJECTION_PROBE',
    severity: 'critical',
    block: true,
  },
  {
    regex: /<\s*script\b|javascript:|data:text\/html|onerror\s*=|onload\s*=|onmouseover\s*=/i,
    type: 'XSS_PROBE',
    severity: 'high',
    block: true,
  },
  {
    regex: /\.\.\/|%2e%2e%2f|\/etc\/passwd|cmd\.exe|powershell|\/proc\/self\/environ/i,
    type: 'PATH_TRAVERSAL_PROBE',
    severity: 'critical',
    block: true,
  },
  {
    regex: /\$\w+\s*:|"\$(?:where|ne|gt|gte|lt|lte|regex|expr)"/i,
    type: 'NOSQL_INJECTION_PROBE',
    severity: 'critical',
    block: true,
  },
  {
    regex: /;\s*(?:cat|ls|whoami|uname|curl|wget|bash|sh)\b|\|\||&&|\$\(/i,
    type: 'COMMAND_INJECTION_PROBE',
    severity: 'critical',
    block: true,
  },
];

const MAX_LOG_STRING_LENGTH = 4096;
const MAX_RECURSION_DEPTH = 6;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 150;

const SENSITIVE_KEY_REGEX = /(password|pass|\bpin\b|pin$|^pin|token|secret|api[_-]?key|authorization|cookie|jwt|session|private[_-]?key|client[_-]?secret)/i;
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const TOKEN_RESPONSE_ALLOWED_PATHS = new Set([
  '/app/user/login/login',
  '/app/user/login/google',
  '/app/user/login/google/complete',
  '/app/user/rs/submit',
  '/admin/login',
]);
const CLIENT_FAILURE_LOG_THROTTLE_MS = Math.max(3000, Number(process.env.CLIENT_FAILURE_LOG_THROTTLE_MS || 12000));
const clientFailureSeen = new Map<string, number>();

const compact = (value: unknown) => {
  const text = String(value || '');
  return text.length > 280 ? `${text.slice(0, 280)}...` : text;
};

const getIP = (req: Request) => String(req.ip || req.socket.remoteAddress || '');
const shouldLogClientFailure = (key: string) => {
  const now = Date.now();
  const last = Number(clientFailureSeen.get(key) || 0);
  if (now - last < CLIENT_FAILURE_LOG_THROTTLE_MS) return false;
  clientFailureSeen.set(key, now);
  if (clientFailureSeen.size > 4000) {
    const floor = now - (CLIENT_FAILURE_LOG_THROTTLE_MS * 3);
    for (const [k, ts] of clientFailureSeen.entries()) {
      if (Number(ts || 0) < floor) clientFailureSeen.delete(k);
    }
  }
  return true;
};

const shouldCaptureClientFailure = (status: number, pathOnlyLower: string) => {
  if (status >= 500) return true;
  if (status === 429 || status === 409) return true;
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return pathOnlyLower.startsWith('/app/user/login')
      || pathOnlyLower.startsWith('/app/user/rs/submit')
      || pathOnlyLower.startsWith('/app/payment/order/submit')
      || pathOnlyLower.startsWith('/app/payment/order/create')
      || pathOnlyLower.startsWith('/app/payment/order')
      || pathOnlyLower.startsWith('/app/ct/app/collection')
      || pathOnlyLower.startsWith('/app/usdt/order');
  }
  return false;
};

const sanitizeString = (value: string) =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

const sanitizeStringForLog = (value: string) => sanitizeString(value).slice(0, MAX_LOG_STRING_LENGTH);

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return '[unserializable]';
  }
};

const isPlainObject = (value: unknown) =>
  Object.prototype.toString.call(value) === '[object Object]';

const replaceObjectContents = (target: Record<string, unknown>, next: Record<string, unknown>) => {
  Object.keys(target).forEach((key) => { delete target[key]; });
  Object.entries(next).forEach(([key, value]) => { target[key] = value; });
};

const normalizeInputValue = (
  value: unknown,
  depth = 0,
  report?: { droppedKeys: string[]; suspiciousKeys: string[] },
): unknown => {
  if (depth > MAX_RECURSION_DEPTH) return '[depth-limited]';
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((item) => normalizeInputValue(item, depth + 1, report));
  if (!isPlainObject(value)) return value;

  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(input).slice(0, MAX_OBJECT_KEYS);
  for (const key of keys) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
      report?.droppedKeys.push(key);
      continue;
    }
    if (key.startsWith('$')) {
      report?.suspiciousKeys.push(key);
      continue;
    }
    out[key] = normalizeInputValue(input[key], depth + 1, report);
  }
  return out;
};

const scrubForSecurityLog = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_RECURSION_DEPTH) return '[depth-limited]';
  if (typeof value === 'string') return compact(sanitizeStringForLog(value));
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => scrubForSecurityLog(item, depth + 1));
  if (!isPlainObject(value)) return String(value);

  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input).slice(0, 40)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = scrubForSecurityLog(raw, depth + 1);
  }
  return out;
};

const sanitizeResponsePayload = (
  value: unknown,
  pathLower: string,
  depth = 0,
): { value: unknown; redactedKeys: string[] } => {
  if (TOKEN_RESPONSE_ALLOWED_PATHS.has(pathLower)) return { value, redactedKeys: [] };
  if (depth > MAX_RECURSION_DEPTH) return { value: '[depth-limited]', redactedKeys: [] };
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return { value, redactedKeys: [] };
  }
  if (Array.isArray(value)) {
    const redactedKeys: string[] = [];
    const next = value.map((item) => {
      const out = sanitizeResponsePayload(item, pathLower, depth + 1);
      redactedKeys.push(...out.redactedKeys);
      return out.value;
    });
    return { value: next, redactedKeys };
  }
  if (!isPlainObject(value)) return { value, redactedKeys: [] };

  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const redactedKeys: string[] = [];
  for (const [key, raw] of Object.entries(input).slice(0, MAX_OBJECT_KEYS)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      if (typeof raw === 'string') {
        const normalized = raw.trim();
        const looksMasked = !normalized || normalized.includes('*') || normalized === '[REDACTED]';
        if (looksMasked) {
          out[key] = raw;
          continue;
        }
      }
      if (typeof raw === 'number' || typeof raw === 'boolean' || raw === null) {
        out[key] = raw;
        continue;
      }
      out[key] = '[REDACTED]';
      redactedKeys.push(key);
      continue;
    }
    const nested = sanitizeResponsePayload(raw, pathLower, depth + 1);
    out[key] = nested.value;
    redactedKeys.push(...nested.redactedKeys);
  }
  return { value: out, redactedKeys };
};

export const securityShield = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const rawPath = String(req.originalUrl || req.url || '');
  const pathLower = rawPath.toLowerCase();
  const pathOnlyLower = pathLower.split('?')[0];
  const method = String(req.method || 'GET').toUpperCase();
  const ip = getIP(req);
  const userAgent = String(req.headers['user-agent'] || '');
  const decodedPath = (() => {
    try { return decodeURIComponent(rawPath); } catch (_error) { return rawPath; }
  })();
  // Redact sensitive fields (password, pin, token, ...) before pattern-matching so that
  // legitimate credentials containing symbols like `||`, `&&`, `$(` aren't mistaken for
  // command/SQL injection payloads — those fields are never interpreted as commands or
  // queries (bcrypt-compared / parameterized), so scanning their contents serves no purpose.
  const probeTarget = `${rawPath} ${decodedPath} ${safeJson(scrubForSecurityLog(req.query || {}))} ${safeJson(scrubForSecurityLog(req.body || {}))} ${safeJson(scrubForSecurityLog(req.params || {}))}`;
  let responseSnapshot: any = null;

  const originalJson = res.json.bind(res);
  (res as any).json = (body: any) => {
    const sanitized = sanitizeResponsePayload(body, pathOnlyLower);
    responseSnapshot = sanitized.value;
    if (sanitized.redactedKeys.length) {
      recordSecurityEvent({
        type: 'SENSITIVE_RESPONSE_REDACTED',
        severity: 'critical',
        message: `Sensitive fields were auto-redacted on ${method} ${rawPath}`,
        ip,
        method,
        path: rawPath,
        userAgent,
        meta: {
          redactedKeys: Array.from(new Set(sanitized.redactedKeys)).slice(0, 15),
        },
      });
    }
    return originalJson(sanitized.value);
  };

  if (SCAN_PATH_PATTERNS.some((needle) => pathLower.includes(needle))) {
    recordSecurityEvent({
      type: 'SCAN_REQUEST_BLOCKED',
      severity: 'critical',
      message: `Blocked scan pattern request: ${rawPath}`,
      ip,
      method,
      path: rawPath,
      userAgent,
      meta: { hint: 'scan_path_pattern' },
    });
    res.status(403).json({ code: 4403, msg: 'Forbidden' });
    return;
  }

  const sanitizeReport = { droppedKeys: [] as string[], suspiciousKeys: [] as string[] };
  if (req.body && typeof req.body === 'object') {
    const normalizedBody = normalizeInputValue(req.body, 0, sanitizeReport);
    if (isPlainObject(req.body) && isPlainObject(normalizedBody)) {
      replaceObjectContents(req.body as Record<string, unknown>, normalizedBody as Record<string, unknown>);
    } else {
      (req as any).body = normalizedBody;
    }
  }
  if (req.query && typeof req.query === 'object') {
    const normalizedQuery = normalizeInputValue(req.query, 0, sanitizeReport);
    if (isPlainObject(req.query) && isPlainObject(normalizedQuery)) {
      replaceObjectContents(req.query as Record<string, unknown>, normalizedQuery as Record<string, unknown>);
    }
  }
  if (req.params && typeof req.params === 'object') {
    const normalizedParams = normalizeInputValue(req.params, 0, sanitizeReport);
    if (isPlainObject(req.params) && isPlainObject(normalizedParams)) {
      replaceObjectContents(req.params as Record<string, unknown>, normalizedParams as Record<string, unknown>);
    } else {
      (req as any).params = normalizedParams;
    }
  }

  if (sanitizeReport.droppedKeys.length || sanitizeReport.suspiciousKeys.length) {
    recordSecurityEvent({
      type: 'MALICIOUS_KEY_BLOCKED',
      severity: 'critical',
      message: `Blocked malicious payload keys on ${method} ${rawPath}`,
      ip,
      method,
      path: rawPath,
      userAgent,
      meta: {
        droppedKeys: sanitizeReport.droppedKeys.slice(0, 10),
        suspiciousKeys: sanitizeReport.suspiciousKeys.slice(0, 10),
      },
    });
    res.status(403).json({ code: 4410, msg: 'Forbidden request payload' });
    return;
  }

  const isSecurityIngest = pathOnlyLower.startsWith('/internal/security/');
  for (const pattern of ATTACK_PATTERNS) {
    if (pattern.regex.test(probeTarget)) {
      const blocked = pattern.block && !isSecurityIngest;
      recordSecurityEvent({
        type: blocked ? `${pattern.type}_BLOCKED` : pattern.type,
        severity: pattern.severity,
        message: blocked ? `Blocked suspicious payload on ${rawPath}` : `Suspicious payload detected on ${rawPath}`,
        ip,
        method,
        path: rawPath,
        userAgent,
        meta: {
          query: compact(safeJson(scrubForSecurityLog(req.query || {}))),
          body: compact(safeJson(scrubForSecurityLog(req.body || {}))),
          params: compact(safeJson(scrubForSecurityLog(req.params || {}))),
        },
      });
      if (blocked) {
        res.status(403).json({ code: 4404, msg: 'Suspicious request blocked' });
        return;
      }
      break;
    }
  }

  res.on('finish', () => {
    const ms = Date.now() - start;
    const requestId = String((req as any)?.requestId || req.headers['x-client-request-id'] || req.headers['x-request-id'] || '').slice(0, 120);
    const errorCode = Number(responseSnapshot?.code || 0) || undefined;
    const errorMsg = compact(responseSnapshot?.msg || responseSnapshot?.message || '');

    if (res.statusCode >= 500) {
      recordSecurityEvent({
        type: 'SERVER_ERROR_SPIKE',
        severity: 'high',
        message: `HTTP ${res.statusCode} on ${method} ${rawPath}`,
        ip,
        method,
        path: rawPath,
        userAgent,
        meta: {
          durationMs: ms,
          requestId: requestId || undefined,
          ...(errorCode ? { errorCode } : {}),
          ...(errorMsg ? { errorMessage: errorMsg } : {}),
        },
      });
      return;
    }
    if (res.statusCode === 401 || res.statusCode === 403) {
      recordSecurityEvent({
        type: 'AUTH_FAILURE',
        severity: 'medium',
        message: `Auth rejection HTTP ${res.statusCode} on ${method} ${rawPath}`,
        ip,
        method,
        path: rawPath,
        userAgent,
        meta: {
          durationMs: ms,
          requestId: requestId || undefined,
          ...(errorCode ? { errorCode } : {}),
          ...(errorMsg ? { errorMessage: errorMsg } : {}),
        },
      });
      return;
    }
    if (res.statusCode >= 400 && shouldCaptureClientFailure(res.statusCode, pathOnlyLower)) {
      const fingerprint = [
        ip,
        method,
        pathOnlyLower,
        res.statusCode,
        errorCode || 0,
      ].join('|');
      if (!shouldLogClientFailure(fingerprint)) return;
      recordSecurityEvent({
        type: 'CLIENT_REQUEST_REJECTED',
        severity: res.statusCode >= 500 || res.statusCode === 429 ? 'high' : 'medium',
        message: `Client request rejected HTTP ${res.statusCode} on ${method} ${rawPath}`,
        ip,
        method,
        path: rawPath,
        userAgent,
        meta: {
          status: res.statusCode,
          durationMs: ms,
          requestId: requestId || undefined,
          ...(errorCode ? { errorCode } : {}),
          ...(errorMsg ? { errorMessage: errorMsg } : {}),
        },
      });
    }
  });

  next();
};

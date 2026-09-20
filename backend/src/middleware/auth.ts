import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import { recordSecurityEvent } from '../utils/securityMonitor';

dotenv.config();

const deriveFallbackSecret = (label: string): string => {
  const seed = [
    String(process.env.DATABASE_URL || '').trim(),
    String(process.env.RAILWAY_PROJECT_ID || '').trim(),
    String(process.env.RAILWAY_SERVICE_ID || '').trim(),
    String(process.env.RAILWAY_ENVIRONMENT_ID || '').trim(),
    String(process.env.APP_BASE_URL || '').trim(),
    String(process.env.NODE_ENV || '').trim(),
    process.cwd(),
  ].filter(Boolean).join('|');
  const effectiveSeed = seed || `local:${process.cwd()}`;
  return crypto.createHash('sha256').update(`diwapay:${label}:${effectiveSeed}`).digest('hex');
};

const getRequiredSecret = (envName: 'JWT_SECRET' | 'ADMIN_JWT_SECRET', label: string) => {
  const explicit = String(process.env[envName] || '').trim();
  if (explicit) return explicit;
  const fallback = deriveFallbackSecret(label);
  console.warn(`[auth] ${envName} not set. Using deterministic fallback secret for this environment.`);
  return fallback;
};

const JWT_SECRET = getRequiredSecret('JWT_SECRET', 'user');
const ADMIN_JWT_SECRET = getRequiredSecret('ADMIN_JWT_SECRET', 'admin');

export interface AuthRequest extends Request {
  user?: {
    id: string;
    phone: string;
    role: string;
  };
}

const AUTH_EVENT_THROTTLE_MS = Math.max(3000, Number(process.env.AUTH_SECURITY_EVENT_THROTTLE_MS || 15000));
const authEventSeen = new Map<string, number>();
const AUTH_USER_CACHE_TTL_MS = Math.max(3000, Number(process.env.AUTH_USER_CACHE_TTL_MS || 15000));
const AUTH_DB_LOOKUP_TIMEOUT_MS = Math.max(1000, Number(process.env.AUTH_DB_LOOKUP_TIMEOUT_MS || 7000));
const authUserStateCache = new Map<string, { isActive: boolean; at: number }>();

const shouldEmitAuthEvent = (key: string) => {
  const now = Date.now();
  const last = Number(authEventSeen.get(key) || 0);
  if (now - last < AUTH_EVENT_THROTTLE_MS) return false;
  authEventSeen.set(key, now);
  return true;
};

const emitAuthSecurityEvent = (
  req: AuthRequest,
  type: string,
  severity: 'medium' | 'high' | 'critical',
  message: string,
) => {
  const ip = String(req.ip || req.socket.remoteAddress || '');
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.originalUrl || req.url || '');
  const key = `${type}|${ip}|${method}|${path}`;
  if (!shouldEmitAuthEvent(key)) return;
  recordSecurityEvent({
    type,
    severity,
    message,
    ip,
    method,
    path,
    userAgent: String(req.headers['user-agent'] || ''),
  });
};

const readAuthUserCache = (userId: string): { isActive: boolean } | null => {
  const key = String(userId || '').trim();
  if (!key) return null;
  const hit = authUserStateCache.get(key);
  if (!hit) return null;
  if (Date.now() - Number(hit.at || 0) > AUTH_USER_CACHE_TTL_MS) {
    authUserStateCache.delete(key);
    return null;
  }
  return { isActive: Boolean(hit.isActive) };
};

const writeAuthUserCache = (userId: string, isActive: boolean) => {
  const key = String(userId || '').trim();
  if (!key) return;
  authUserStateCache.set(key, { isActive: Boolean(isActive), at: Date.now() });
  if (authUserStateCache.size > 6000) {
    const floor = Date.now() - (AUTH_USER_CACHE_TTL_MS * 2);
    for (const [k, row] of authUserStateCache.entries()) {
      if (Number(row.at || 0) < floor) authUserStateCache.delete(k);
    }
  }
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutError: Error): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const isPrismaConnectivityIssue = (error: unknown) => {
  const raw = String((error as any)?.message || '').toLowerCase();
  return raw.includes('can\'t reach database server')
    || raw.includes('timed out fetching')
    || raw.includes('prisma')
    || raw.includes('connection');
};

const extractToken = (req: Request, allowQueryToken = false): string => {
  const authHeader = req.headers['authorization'] as string | undefined;
  const tokenHeader = req.headers['token'] as string | undefined;
  const fromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (authHeader || tokenHeader || '');
  if (fromHeader) return String(fromHeader);
  if (!allowQueryToken) return '';
  const q = req.query || {};
  const fromQuery = String((q as any).token || (q as any).access_token || '').trim();
  return fromQuery;
};

// Verify a user JWT outside of the Express middleware chain (e.g. WebSocket upgrade auth).
export interface VerifiedUserToken {
  id: string;
  phone: string;
  role: string;
}

export const verifyUserToken = (token: string): VerifiedUserToken | null => {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as VerifiedUserToken;
  } catch {
    return null;
  }
};

// User JWT middleware
export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const token = extractToken(req, false);

  if (!token) {
    emitAuthSecurityEvent(req, 'AUTH_TOKEN_MISSING', 'high', `Missing user token on ${req.method} ${req.originalUrl}`);
    res.status(401).json({ code: 1001, msg: 'Token required' });
    return;
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as any;
  } catch (err) {
    emitAuthSecurityEvent(req, 'AUTH_TOKEN_INVALID', 'high', `Invalid/expired user token on ${req.method} ${req.originalUrl}`);
    res.status(403).json({ code: 1002, msg: 'Invalid or expired token' });
    return;
  }

  const cacheHit = readAuthUserCache(decoded?.id);
  if (cacheHit) {
    if (!cacheHit.isActive) {
      emitAuthSecurityEvent(req, 'AUTH_ACCOUNT_DISABLED_ACCESS', 'high', `Disabled account token used on ${req.method} ${req.originalUrl}`);
      res.status(403).json({ code: 1002, msg: 'Account disabled' });
      return;
    }
    req.user = decoded;
    next();
    return;
  }

  try {
    const dbUser = await withTimeout(
      prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, isActive: true },
      }),
      AUTH_DB_LOOKUP_TIMEOUT_MS,
      new Error('AUTH_DB_LOOKUP_TIMEOUT'),
    );
    if (!dbUser || !dbUser.isActive) {
      writeAuthUserCache(decoded?.id, false);
      emitAuthSecurityEvent(req, 'AUTH_ACCOUNT_DISABLED_ACCESS', 'high', `Disabled account token used on ${req.method} ${req.originalUrl}`);
      res.status(403).json({ code: 1002, msg: 'Account disabled' });
      return;
    }
    writeAuthUserCache(decoded?.id, true);
    req.user = decoded;
    next();
  } catch (err) {
    const errMsg = String((err as any)?.message || '');
    if (errMsg === 'AUTH_DB_LOOKUP_TIMEOUT' || isPrismaConnectivityIssue(err)) {
      emitAuthSecurityEvent(req, 'AUTH_DB_LOOKUP_FAILED', 'high', `Auth DB lookup failed on ${req.method} ${req.originalUrl}`);
      res.status(503).json({ code: 1017, msg: 'Auth service busy. Please retry' });
      return;
    }
    emitAuthSecurityEvent(req, 'AUTH_TOKEN_INVALID', 'high', `Invalid/expired user token on ${req.method} ${req.originalUrl}`);
    res.status(403).json({ code: 1002, msg: 'Invalid or expired token' });
  }
};

const verifyAdminJwt = (req: AuthRequest, res: Response, next: NextFunction, allowQueryToken: boolean): void => {
  const token = extractToken(req, allowQueryToken);

  if (!token) {
    emitAuthSecurityEvent(req, 'ADMIN_TOKEN_MISSING', 'critical', `Missing admin token on ${req.method} ${req.originalUrl}`);
    res.status(401).json({ code: 1001, msg: 'Admin token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as any;
    if (decoded.role !== 'ADMIN') {
      emitAuthSecurityEvent(req, 'ADMIN_ROLE_BYPASS_ATTEMPT', 'critical', `Non-admin token used on ${req.method} ${req.originalUrl}`);
      res.status(403).json({ code: 1003, msg: 'Admin access required' });
      return;
    }
    req.user = decoded;
    next();
  } catch (err) {
    emitAuthSecurityEvent(req, 'ADMIN_TOKEN_INVALID', 'critical', `Invalid admin token on ${req.method} ${req.originalUrl}`);
    res.status(403).json({ code: 1002, msg: 'Invalid admin token' });
  }
};

// Admin JWT middleware
export const authenticateAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  verifyAdminJwt(req, res, next, false);
};

// Admin JWT middleware for SSE/stream endpoints (allows token in query string).
export const authenticateAdminStream = (req: AuthRequest, res: Response, next: NextFunction): void => {
  verifyAdminJwt(req, res, next, true);
};

// Generate user JWT
export const signUserToken = (payload: { id: string; phone: string; role: string }) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

// Generate admin JWT
export const signAdminToken = (payload: { id: string; phone: string; role: string }) => {
  return jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: '24h' });
};

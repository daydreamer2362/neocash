import { NextFunction, Request, Response } from 'express';
import { DEFAULT_ENV } from '../config/defaultEnv';
import { recordSecurityEvent } from '../utils/securityMonitor';
import { createOriginPolicy, normalizeOrigin } from '../utils/originPolicy';

const ADMIN_ORIGIN_POLICY = createOriginPolicy({
  envValue: process.env.ADMIN_PANEL_ORIGINS,
  fallbackOrigins: [...DEFAULT_ENV.ADMIN_PANEL_ORIGINS],
  extraOrigins: [process.env.APP_BASE_URL || DEFAULT_ENV.APP_BASE_URL],
});
const isSameHostOrigin = (req: Request, normalizedOrigin: string): boolean => {
  const requestHost = String(req.get('host') || '').trim().toLowerCase();
  if (!requestHost || !normalizedOrigin) return false;
  const inferredOrigin = normalizeOrigin(`${req.protocol}://${requestHost}`);
  return inferredOrigin === normalizedOrigin;
};

const shouldGuard = (path: string): boolean => path.startsWith('/admin');

export const adminOriginGuard = (req: Request, res: Response, next: NextFunction) => {
  if (!shouldGuard(String(req.originalUrl || req.url || ''))) {
    next();
    return;
  }

  if (ADMIN_ORIGIN_POLICY.allowAll) {
    next();
    return;
  }

  const originHeader = String(req.headers.origin || '').trim();

  // Requests without Origin (curl/server-to-server) are allowed.
  if (!originHeader) {
    next();
    return;
  }

  const normalized = normalizeOrigin(originHeader);
  if (isSameHostOrigin(req, normalized) || ADMIN_ORIGIN_POLICY.isAllowed(normalized)) {
    next();
    return;
  }

  recordSecurityEvent({
    type: 'ADMIN_ORIGIN_BLOCKED',
    severity: 'high',
    message: `Blocked admin API request from disallowed origin: ${originHeader}`,
    ip: String(req.ip || req.socket.remoteAddress || ''),
    method: String(req.method || 'GET'),
    path: String(req.originalUrl || req.url || ''),
    userAgent: String(req.headers['user-agent'] || ''),
    meta: {
      origin: originHeader,
    },
  });
  res.status(403).json({ code: 4403, msg: 'Origin not allowed for admin APIs' });
};

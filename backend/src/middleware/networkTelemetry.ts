import { NextFunction, Request, Response } from 'express';
import { recordRequestTelemetry } from '../utils/networkTelemetry';
import { recordSecurityEvent } from '../utils/securityMonitor';

const compactPath = (value: string) => {
  const raw = String(value || '/');
  if (!raw || raw === '/') return '/';
  const safe = raw.split('?')[0];
  return safe.length > 180 ? `${safe.slice(0, 180)}...` : safe;
};

export const networkTelemetry = (req: Request, res: Response, next: NextFunction) => {
  const started = Date.now();
  const method = String(req.method || 'GET').toUpperCase();
  const path = compactPath(String(req.originalUrl || req.url || '/'));
  const ip = String(req.ip || req.socket.remoteAddress || '');
  const requestId = String((req as any)?.requestId || req.headers['x-client-request-id'] || req.headers['x-request-id'] || '').slice(0, 120);
  const origin = String(req.headers.origin || '').trim().slice(0, 180);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 220);
  const securityEventSeenKey = '__gp_security_event_seen';
  const throttleMs = 20000;

  const shouldEmitSecurityEvent = (status: number, requestPath: string) => {
    if (status >= 500) return true;
    if (status === 429 || status === 401 || status === 403) return true;
    if (status === 400) {
      const p = requestPath.toLowerCase();
      if (p.includes('/app/user/login') || p.includes('/app/user/rs/submit') || p.includes('/app/payment') || p.includes('/app/ct/')) {
        return true;
      }
    }
    return false;
  };

  res.on('finish', () => {
    const durationMs = Date.now() - started;
    const status = Number(res.statusCode || 0);
    const maybeAuthUser = (req as any)?.user || null;
    const userId = String(maybeAuthUser?.id || '').trim();
    recordRequestTelemetry({
      at: Date.now(),
      ip,
      method,
      path,
      status,
      durationMs,
      userId: userId || undefined,
      requestId: requestId || undefined,
      origin: origin || undefined,
      userAgent: userAgent || undefined,
    });

    if (shouldEmitSecurityEvent(status, path)) {
      const key = `${ip}|${method}|${path}|${status}`;
      const now = Date.now();
      const bag = (globalThis as any)[securityEventSeenKey] || new Map<string, number>();
      (globalThis as any)[securityEventSeenKey] = bag;
      const last = Number(bag.get(key) || 0);
      if (now - last >= throttleMs) {
        bag.set(key, now);
        recordSecurityEvent({
          type: 'SECURITY_HTTP_ERROR',
          severity: status >= 500 ? 'high' : 'medium',
          message: `HTTP ${status} on ${method} ${path}`,
          ip,
          method,
          path,
          userAgent,
          meta: {
            status,
            durationMs,
            requestId: requestId || undefined,
            origin: origin || undefined,
            source: 'network-telemetry',
          },
        });
      }
    }
  });

  next();
};

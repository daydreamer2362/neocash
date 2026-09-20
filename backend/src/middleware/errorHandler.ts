import { Request, Response, NextFunction } from 'express';
import { recordSecurityEvent } from '../utils/securityMonitor';

const redactSensitive = (value: string) =>
  String(value || '')
    .replace(/(bearer\s+)[a-z0-9\-._~+/]+=*/gi, '$1[REDACTED]')
    .replace(/(password|pin|token|secret|api[_-]?key)\s*[:=]\s*['"]?([^\s'",}]+)/gi, '$1=[REDACTED]')
    .replace(/\b[A-Za-z0-9+/_-]{24,}\.[A-Za-z0-9+/_-]{12,}\.[A-Za-z0-9+/_-]{12,}\b/g, '[JWT]')
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi, '[host]');

const classifyError = (message: string) => {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('sql') || lower.includes('prisma') || lower.includes('database')) {
    return { type: 'DATABASE_ERROR', severity: 'critical' as const };
  }
  if (lower.includes('jwt') || lower.includes('token')) {
    return { type: 'AUTH_RUNTIME_ERROR', severity: 'high' as const };
  }
  return { type: 'HTTP_UNHANDLED_ERROR', severity: 'high' as const };
};

// Global error handler
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction): void => {
  const rawMessage = String(err?.message || 'Unexpected server error').slice(0, 1200);
  const safeMessage = redactSensitive(rawMessage).slice(0, 240);
  const safeStack = redactSensitive(String(err?.stack || '')).slice(0, 2000);
  const kind = classifyError(rawMessage);
  const requestId = String((req as any)?.requestId || req.headers['x-client-request-id'] || req.headers['x-request-id'] || '').slice(0, 120);

  recordSecurityEvent({
    type: kind.type,
    severity: kind.severity,
    message: safeMessage || 'Unexpected server error',
    ip: String(req.ip || req.socket.remoteAddress || ''),
    method: req.method,
    path: req.originalUrl || req.path,
    userAgent: String(req.headers['user-agent'] || ''),
    meta: {
      name: String(err?.name || 'Error'),
      stack: safeStack,
      requestId: requestId || undefined,
    },
  });

  console.error(`[ERROR] ${req.method} ${req.path} reqId=${requestId || '-'}:`, safeMessage);
  res.status(500).json({ code: 9999, msg: 'Internal server error', requestId });
};

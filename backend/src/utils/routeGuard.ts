import { Request, Response } from 'express';
import { errorResponse } from './helpers';
import { recordSecurityEvent } from './securityMonitor';

export const ROUTE_OPERATION_TIMEOUT_MS = Math.max(3000, Number(process.env.ROUTE_OPERATION_TIMEOUT_MS || 12000));

export type RouteGuardOptions = {
  errorCode: number;
  errorMessage: string;
  busyCode?: number;
  busyMessage?: string;
  eventType?: string;
};

export const routeRequestId = (req: Request) =>
  String((req as any)?.requestId || req.headers['x-client-request-id'] || req.headers['x-request-id'] || '').slice(0, 120);

export const withRouteTimeout = async <T>(
  promise: Promise<T>,
  marker: string,
  timeoutMs = ROUTE_OPERATION_TIMEOUT_MS,
): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(marker)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const isTransientRouteError = (error: unknown) => {
  const rawMsg = String((error as any)?.message || '').toLowerCase();
  const rawCode = String((error as any)?.code || '').toUpperCase();
  if (rawCode === 'P1001' || rawCode === 'P2024') return true;
  if (rawMsg.includes('timeout') || rawMsg.includes('timed out')) return true;
  if (rawMsg.includes('can\'t reach database server')) return true;
  if (rawMsg.includes('connection') && rawMsg.includes('prisma')) return true;
  if (rawMsg.includes('too many connections')) return true;
  return false;
};

const emitRouteFailure = (req: Request, error: unknown, status: number, opts: RouteGuardOptions) => {
  const requestId = routeRequestId(req);
  const baseType = String(opts.eventType || 'ROUTE_GUARD').toUpperCase();
  const type = status === 503 ? `${baseType}_BUSY` : `${baseType}_ERROR`;
  recordSecurityEvent({
    type,
    severity: status === 503 ? 'high' : 'critical',
    message: String((error as any)?.message || opts.errorMessage || 'Route error').slice(0, 220),
    ip: String(req.ip || req.socket.remoteAddress || ''),
    method: String(req.method || '').toUpperCase(),
    path: String(req.originalUrl || req.url || ''),
    userAgent: String(req.headers['user-agent'] || ''),
    meta: {
      requestId: requestId || undefined,
      status,
      code: status === 503 ? (opts.busyCode || opts.errorCode) : opts.errorCode,
      errorName: String((error as any)?.name || ''),
    },
  });
};

export const handleGuardError = (req: Request, res: Response, error: unknown, opts: RouteGuardOptions) => {
  if (res.headersSent) return;
  const transient = isTransientRouteError(error);
  const status = transient ? 503 : 500;
  const code = transient ? Number(opts.busyCode || opts.errorCode) : Number(opts.errorCode);
  const msg = transient
    ? String(opts.busyMessage || 'Service busy. Please retry')
    : String(opts.errorMessage || 'Request failed');
  emitRouteFailure(req, error, status, opts);
  res.status(status).json({
    ...errorResponse(code, msg),
    requestId: routeRequestId(req),
  });
};

export const guardRoute = <Req extends Request = Request>(
  opts: RouteGuardOptions,
  handler: (req: Req, res: Response) => Promise<void>,
) => async (req: Req, res: Response) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleGuardError(req, res, error, opts);
  }
};


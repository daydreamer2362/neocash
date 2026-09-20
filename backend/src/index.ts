import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import { DEFAULT_ENV } from './config/defaultEnv';
import { errorHandler } from './middleware/errorHandler';
import { securityShield } from './middleware/securityShield';
import { networkTelemetry } from './middleware/networkTelemetry';
import { adminOriginGuard } from './middleware/adminOriginGuard';
import { createOriginPolicy, normalizeOrigin } from './utils/originPolicy';
import { recordSecurityEvent } from './utils/securityMonitor';
import { initTelegramSecurityForwarder } from './utils/telegramAlerts';
import { getSecurityRuntimeConfig } from './utils/securityConfig';
import { getNetworkOverview } from './utils/networkTelemetry';
import { getSecurityStats, pruneSecurityEventLogs } from './utils/securityMonitor';
import { startStorageStatusMonitor } from './utils/storagePressure';
import { registerProcessCrashHandlers } from './utils/crashMonitor';
import { initWebSocketServer, pushOrderUpdate } from './utils/wsServer';

// Route imports
import authRoutes from './api/auth';
import userRoutes from './api/user';
import orderRoutes from './api/order';
import walletRoutes from './api/wallet';
import teamRoutes from './api/team';
import missionRoutes from './api/mission';
import miscRoutes from './api/misc';
import adminRoutes from './api/admin';
import { userUsdtRoutes, adminUsdtRoutes } from './api/usdt';
import adminSecurityRoutes from './api/adminSecurity';
import securityRoutes from './api/security';
import prisma from './utils/prisma';

registerProcessCrashHandlers();

const app = express();
const numberEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const boolEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
};
const PORT = numberEnv(process.env.PORT, DEFAULT_ENV.PORT);
const ORDER_LOCK_SWEEP_MS = numberEnv(process.env.ORDER_LOCK_SWEEP_MS, DEFAULT_ENV.ORDER_LOCK_SWEEP_MS);
const REQUEST_TIMEOUT_MS = numberEnv(process.env.REQUEST_TIMEOUT_MS, DEFAULT_ENV.REQUEST_TIMEOUT_MS);
// How many requests this single free-tier instance will hold in flight at once.
// Beyond this we reject immediately with 503 instead of letting the event loop
// queue grow unbounded, which is what actually crashes a memory-capped process
// under a traffic spike (vs. gracefully shedding load and letting clients retry).
const MAX_CONCURRENT_REQUESTS = numberEnv(process.env.MAX_CONCURRENT_REQUESTS, DEFAULT_ENV.MAX_CONCURRENT_REQUESTS);
// Live order updates also work over polling (frontend polls every 5s regardless),
// so WS is a pure latency optimization. Disable it on constrained instances to
// save the per-connection memory and heartbeat overhead.
const ENABLE_WS = boolEnv(process.env.ENABLE_WS, DEFAULT_ENV.ENABLE_WS);
const CORS_POLICY = createOriginPolicy({
  envValue: process.env.CORS_ORIGINS,
  fallbackOrigins: [...DEFAULT_ENV.CORS_ORIGINS],
  extraOrigins: [process.env.APP_BASE_URL || DEFAULT_ENV.APP_BASE_URL],
});
const MOBILE_ORIGINS = new Set([
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'app://localhost',
].map(normalizeOrigin));
const isLikelyMobileWebView = (req: express.Request) => {
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  return ua.includes('capacitor')
    || ua.includes('cordova')
    || ua.includes(' wv')
    || ua.includes('android')
    || ua.includes('iphone')
    || ua.includes('ipad');
};
const isSameHostOrigin = (req: express.Request, incomingOrigin: string): boolean => {
  const requestHost = String(req.get('host') || '').trim().toLowerCase();
  if (!requestHost || !incomingOrigin) return false;
  const inferredOrigin = normalizeOrigin(`${req.protocol}://${requestHost}`);
  return inferredOrigin === incomingOrigin;
};

const sweepExpiredOrderLocks = async () => {
  const now = new Date();
  const expired = await prisma.userOrder.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lte: now },
    },
    select: { id: true, orderId: true, buyId: true, userId: true, order: { select: { code: true } } },
    take: 1000,
  });

  if (!expired.length) return;
  const expiredOrderIds = Array.from(new Set(expired.map((item) => item.orderId)));
  const expiredUserOrderIds = expired.map((item) => item.id);

  await prisma.$transaction([
    prisma.userOrder.updateMany({
      where: {
        id: { in: expiredUserOrderIds },
        status: 'PENDING',
        expiresAt: { lte: now },
      },
      data: { status: 'TIMEOUT' },
    }),
    prisma.order.updateMany({
      where: { id: { in: expiredOrderIds }, status: 'CLAIMED' },
      data: { status: 'READY' },
    }),
  ]);

  expired.forEach((item) => {
    pushOrderUpdate(item.userId, { buyId: item.buyId, orderNo: item.order?.code || null, status: 'TIMEOUT' });
  });

  console.log(`[order-lock-sweep] timed out ${expired.length} pending order(s)`);
};

// ─── GLOBAL MIDDLEWARE ──────────────────────────────
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  const incomingRequestId = String(req.headers['x-client-request-id'] || req.headers['x-request-id'] || '')
    .trim()
    .slice(0, 120);
  const requestId = incomingRequestId || randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});
// ─── LOAD SHEDDING ──────────────────────────────────
// Reject early (cheaply, before body parsing/DB work) once too many requests
// are in flight, instead of accepting everything and risking an OOM crash or
// every request timing out together under a burst.
let inFlightRequests = 0;
app.use((req, res, next) => {
  if (inFlightRequests >= MAX_CONCURRENT_REQUESTS) {
    res.status(503).set('Retry-After', '1').json({
      code: 5503,
      msg: 'Server busy, please retry',
      requestId: (req as any).requestId || '',
    });
    return;
  }
  inFlightRequests++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    inFlightRequests--;
  };
  res.once('finish', release);
  res.once('close', release);
  next();
});
app.use(compression());
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (res.headersSent) return;
    res.status(504).json({ code: 5504, msg: 'Request timed out. Please retry', requestId: (req as any).requestId || '' });
  });
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    if (durationMs >= Math.max(5000, Math.floor(REQUEST_TIMEOUT_MS * 0.5))) {
      console.warn(`[slow-request] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms reqId=${(req as any).requestId || '-'}`);
    }
  });
  next();
});
app.use(cors((req, cb) => {
  const originHeader = String(req.headers.origin || '').trim();
  if (!originHeader) {
    cb(null, { origin: true, credentials: true });
    return;
  }
  if (originHeader === 'null' && isLikelyMobileWebView(req)) {
    cb(null, { origin: true, credentials: true });
    return;
  }

  const incomingOrigin = normalizeOrigin(originHeader);
  const isAllowed = MOBILE_ORIGINS.has(incomingOrigin)
    || isSameHostOrigin(req, incomingOrigin)
    || CORS_POLICY.isAllowed(incomingOrigin);

  cb(null, { origin: isAllowed, credentials: true });
}));
app.use(express.json({ limit: '2mb' })); // base64 endpoints use dedicated upload limits
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
// 'dev' format does colorized, per-request synchronous stdout writes - cheap at
// low volume but adds up under load. 'tiny' is the lightest built-in format.
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(networkTelemetry);
app.use(securityShield);
app.use(adminOriginGuard);

// Rate limiter: max 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: numberEnv(process.env.GLOBAL_RATE_LIMIT, DEFAULT_ENV.GLOBAL_RATE_LIMIT),
  message: { code: 4029, msg: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    recordSecurityEvent({
      type: 'RATE_LIMIT_HIT',
      severity: 'high',
      message: `Rate limit exceeded for ${req.method} ${req.originalUrl}`,
      ip: String(req.ip || req.socket.remoteAddress || ''),
      method: req.method,
      path: req.originalUrl,
      userAgent: String(req.headers['user-agent'] || ''),
    });
    res.status(429).json({ code: 4029, msg: 'Too many requests, slow down' });
  },
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: numberEnv(process.env.AUTH_RATE_LIMIT, DEFAULT_ENV.AUTH_RATE_LIMIT),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    recordSecurityEvent({
      type: 'AUTH_RATE_LIMIT_HIT',
      severity: 'critical',
      message: `Auth brute-force limiter hit on ${req.originalUrl}`,
      ip: String(req.ip || req.socket.remoteAddress || ''),
      method: req.method,
      path: req.originalUrl,
      userAgent: String(req.headers['user-agent'] || ''),
    });
    res.status(429).json({ code: 4030, msg: 'Too many auth attempts, please wait' });
  },
});
app.use('/app/user/login', authLimiter);
app.use('/admin/login', authLimiter);
app.use('/app/user/login/google', authLimiter);

// ─── ROUTE MOUNTS (matching original APK endpoints) ─
app.use('/app/user', authRoutes);
app.use('/app/user/info', userRoutes);   // /person, /onSell, /verifyPin, etc.
app.use('/app/user', userRoutes);        // /token/page, /active/activeInfo, /update
app.use('/app/payment/order', orderRoutes);
app.use('/app/ct/app/collection', walletRoutes);
app.use('/app/user/team', teamRoutes);
app.use('/app/mission', missionRoutes);
app.use('/app', miscRoutes);
app.use('/app/usdt', userUsdtRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/usdt', adminUsdtRoutes);
app.use('/admin/security-control', adminSecurityRoutes);
app.use('/internal/security', securityRoutes);

// ─── ADMIN PANEL STATIC FILES ───────────────────────
app.get('/admin-panel/runtime-config.js', (_req, res) => {
  const configuredBase = String(process.env.ADMIN_PANEL_API_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const fallbackBase = `${_req.protocol}://${_req.get('host')}`;
  const finalBase = configuredBase || fallbackBase || DEFAULT_ENV.ADMIN_PANEL_API_BASE_URL;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.send(`window.__ADMIN_API_BASE__ = ${JSON.stringify(finalBase)};`);
});
app.use('/admin-panel', express.static(path.join(__dirname, '..', 'admin-panel')));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── HEALTH CHECK ───────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ status: 'NeoCash Backend Active', version: '1.1.1', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (_req, res) => {
  const runtime = await getSecurityRuntimeConfig();
  if (!runtime.prometheusEnabled) {
    res.status(403).send('prometheus metrics disabled');
    return;
  }
  const network = getNetworkOverview();
  const security = getSecurityStats();
  const payload = [
    '# TYPE neocash_requests_total counter',
    `neocash_requests_total ${network.totalRequests}`,
    '# TYPE neocash_requests_last_minute gauge',
    `neocash_requests_last_minute ${network.requestsLast1m}`,
    '# TYPE neocash_error_rate_last_minute gauge',
    `neocash_error_rate_last_minute ${network.errorRateLast1m}`,
    '# TYPE neocash_latency_avg_ms gauge',
    `neocash_latency_avg_ms ${network.avgLatencyMs}`,
    '# TYPE neocash_latency_p95_ms gauge',
    `neocash_latency_p95_ms ${network.p95LatencyMs}`,
    '# TYPE neocash_security_unresolved_alerts gauge',
    `neocash_security_unresolved_alerts ${security.unresolved}`,
    '# TYPE neocash_security_critical_alerts gauge',
    `neocash_security_critical_alerts ${security.bySeverity.critical || 0}`,
    '',
  ].join('\n');
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(payload);
});

app.get('/healthz', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down', timestamp: new Date().toISOString() });
  }
});

app.get('/readyz', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

// ─── ERROR HANDLER ──────────────────────────────────
app.use(errorHandler);

// ─── START SERVER ───────────────────────────────────
let stopTelegramForwarder: (() => void) = () => undefined;
let orderSweepTimer: NodeJS.Timeout | null = null;
let securityPruneTimer: NodeJS.Timeout | null = null;

const httpServer = http.createServer(app);
if (ENABLE_WS) {
  initWebSocketServer(httpServer);
} else {
  console.log('[ws] disabled via ENABLE_WS=false - clients fall back to polling');
}

const server = httpServer.listen(PORT, () => {
  console.log(`\n🚀 NeoCash Backend running on http://localhost:${PORT}`);
  console.log(`   WebSocket live-order updates ready on the same port\n`);
  console.log(`   Environment: ${process.env.NODE_ENV || DEFAULT_ENV.NODE_ENV}\n`);
  startStorageStatusMonitor();
  stopTelegramForwarder = initTelegramSecurityForwarder();

  // Lock-timeout watchdog: automatically release expired claimed orders back to pool.
  sweepExpiredOrderLocks().catch((error) => console.error('[order-lock-sweep] startup failed', error));
  orderSweepTimer = setInterval(() => {
    sweepExpiredOrderLocks().catch((error) => console.error('[order-lock-sweep] failed', error));
  }, ORDER_LOCK_SWEEP_MS);
  securityPruneTimer = setInterval(() => {
    pruneSecurityEventLogs().catch(() => undefined);
  }, 60_000);
});

let isShuttingDown = false;
const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (orderSweepTimer) clearInterval(orderSweepTimer);
  if (securityPruneTimer) clearInterval(securityPruneTimer);
  stopTelegramForwarder();

  const forceExitTimer = setTimeout(() => process.exit(1), 10_000);
  forceExitTimer.unref();

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

export default app;

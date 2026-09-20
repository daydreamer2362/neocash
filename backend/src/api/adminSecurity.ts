import { Router, Response } from 'express';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { successResponse, errorResponse } from '../utils/helpers';
import { getSecurityConfigForAdmin, updateSecurityConfig } from '../utils/securityConfig';
import { recordSecurityEvent, subscribeSecurityEvents, getSecurityStats, listSecurityEventsFromDb } from '../utils/securityMonitor';
import {
  getNetworkOverview,
  getNetworkTop,
  getRecentRequestErrors,
  subscribeNetworkTelemetry,
  getIpUserHints,
  getEndpointHealth,
  getFailureTimeline,
} from '../utils/networkTelemetry';
import { reloadAlertDispatchConfig } from '../utils/telegramAlerts';
import { getStorageStatus, refreshStorageStatus } from '../utils/storagePressure';
import prisma from '../utils/prisma';

const router = Router();
const NETWORK_FAILURE_TYPE_HINTS = [
  'SECURITY_HTTP_ERROR',
  'CLIENT_',
  'AUTH_',
  'UTR_',
  'ORDER_',
  'RATE_LIMIT',
  'SERVER_ERROR',
  'DATABASE_ERROR',
  'HTTP_UNHANDLED_ERROR',
];

const toMetaObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, any>;
    } catch (_error) {}
  }
  return {};
};

const parseMetaStatus = (meta: Record<string, any>, message = ''): number => {
  const n = Number(meta.status || meta.httpStatus || meta.errorStatus || 0);
  if (Number.isFinite(n) && n > 0) return n;
  const fromMessage = String(message || '').match(/\bHTTP\s+([1-5]\d{2})\b/i);
  if (fromMessage?.[1]) {
    const parsed = Number(fromMessage[1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.isFinite(n) ? n : 0;
};

const parseIsoDateSafe = (input: string) => {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const includesAny = (haystack: string, needles: string[]) => {
  const source = String(haystack || '').toUpperCase();
  return needles.some((needle) => source.includes(String(needle || '').toUpperCase()));
};

const isFailureType = (type: string, status: number) => {
  if (status >= 400) return true;
  return includesAny(type, NETWORK_FAILURE_TYPE_HINTS);
};

const resolveIpUsers = async (ips: string[]) => {
  const byIp = getIpUserHints(ips);
  const userIds = Array.from(new Set(
    Object.values(byIp)
      .flat()
      .map((row) => String(row.userId || '').trim())
      .filter(Boolean),
  ));

  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, userName: true, phone: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [String(u.id), u]));

  const enrichedByIp: Record<string, Array<{
    userId: string;
    userName: string | null;
    mail: string | null;
    phone: string | null;
    hitCount: number;
    lastAt: string | null;
  }>> = {};

  for (const [ip, rows] of Object.entries(byIp)) {
    enrichedByIp[ip] = rows.map((row) => {
      const user = userMap.get(String(row.userId || ''));
      return {
        userId: row.userId,
        userName: user?.userName || null,
        mail: user?.userName || null,
        phone: user?.phone || null,
        hitCount: Number(row.count || 0),
        lastAt: row.lastAt ? new Date(row.lastAt).toISOString() : null,
      };
    });
  }

  return enrichedByIp;
};

router.get('/config', authenticateAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const cfg = await getSecurityConfigForAdmin();
    res.json(successResponse(cfg));
  } catch (error) {
    res.status(500).json(errorResponse(5801, 'Failed to fetch security config'));
  }
});

router.post('/config', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const updated = await updateSecurityConfig(req.body || {});
    await reloadAlertDispatchConfig();
    res.json(successResponse(updated, 'Security integrations updated'));
  } catch (error) {
    res.status(500).json(errorResponse(5802, 'Failed to update security config'));
  }
});

router.post('/test-alert', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const severityInput = String(req.body?.severity || 'medium').toLowerCase();
  const severity: 'low' | 'medium' | 'high' | 'critical' = (
    severityInput === 'critical' ? 'critical' :
      severityInput === 'high' ? 'high' :
        severityInput === 'medium' ? 'medium' : 'low'
  );
  const event = recordSecurityEvent({
    type: 'ADMIN_TEST_ALERT',
    severity,
    message: String(req.body?.message || 'Manual alert test from admin panel'),
    ip: String(req.ip || req.socket.remoteAddress || ''),
    method: 'POST',
    path: '/admin/security-control/test-alert',
    userAgent: String(req.headers['user-agent'] || ''),
    meta: { actor: req.user?.id || 'admin' },
  });
  res.json(successResponse({ id: event.id }, 'Test alert emitted'));
});

router.get('/network/overview', authenticateAdmin, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse({
    overview: getNetworkOverview(),
    security: getSecurityStats(),
  }));
});

router.get('/network/top', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const limit = Math.max(3, Math.min(Number(req.query.limit || 10), 30));
  const top = getNetworkTop(limit);
  const ips = Array.from(new Set((top.byIp || []).map((row: any) => String(row.ip || '').trim()).filter(Boolean)));
  const usersByIp = await resolveIpUsers(ips);
  const withUsers = {
    ...top,
    byIp: (top.byIp || []).map((row: any) => ({
      ...row,
      users: usersByIp[String(row.ip || '').trim()] || [],
    })),
  };
  res.json(successResponse(withUsers));
});

router.get('/network/errors', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const limit = Math.max(10, Math.min(Number(req.query.limit || 50), 300));
  const minStatus = Math.max(400, Math.min(Number(req.query.minStatus || 400), 599));
  const rows = getRecentRequestErrors(limit).filter((item) => Number(item.status || 0) >= minStatus);
  const ips = Array.from(new Set(rows.map((row) => String(row.ip || '').trim()).filter(Boolean)));
  const usersByIp = await resolveIpUsers(ips);
  const withUsers = rows.map((row) => ({
    ...row,
    users: usersByIp[String(row.ip || '').trim()] || [],
  }));
  res.json(successResponse(withUsers));
});

router.get('/network/path-health', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const minutes = Math.max(1, Math.min(Number(req.query.minutes || 60), 24 * 24));
  const limit = Math.max(5, Math.min(Number(req.query.limit || 50), 300));
  const minRequests = Math.max(1, Math.min(Number(req.query.minRequests || 1), 1000));
  const minErrors = Math.max(0, Math.min(Number(req.query.minErrors || 0), 1000));
  const payload = getEndpointHealth({ minutes, limit, minRequests, minErrors });
  res.json(successResponse(payload));
});

router.get('/network/failure-timeline', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const minutes = Math.max(5, Math.min(Number(req.query.minutes || 120), 24 * 24));
  const bucketMinutes = Math.max(1, Math.min(Number(req.query.bucketMinutes || 5), 60));
  const minStatus = Math.max(400, Math.min(Number(req.query.minStatus || 400), 599));
  const payload = getFailureTimeline({ minutes, bucketMinutes, minStatus });
  res.json(successResponse(payload));
});

router.get('/network/reliability', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const sinceHours = Math.max(1, Math.min(Number(req.query.sinceHours || 24), 24 * 30));
  const sinceDate = new Date(Date.now() - (sinceHours * 60 * 60 * 1000));
  const events = await listSecurityEventsFromDb({
    since: sinceDate.toISOString(),
    limit: 5000,
  });

  const rows = (events || []).map((item: any) => {
    const meta = toMetaObject(item?.meta);
    const status = parseMetaStatus(meta, String(item?.message || ''));
    return {
      type: String(item?.type || '').toUpperCase(),
      status,
      path: String(item?.path || ''),
    };
  });

  const isBusy = (row: { type: string; status: number }) =>
    row.status === 503 || row.status === 504 || row.type.endsWith('_BUSY') || row.type.includes('TIMEOUT');
  const isNetwork = (row: { type: string }) =>
    row.type.includes('CLIENT_NETWORK_ERROR') || row.type.includes('SECURITY_HTTP_ERROR');

  const busyCount = rows.filter(isBusy).length;
  const networkCount = rows.filter(isNetwork).length;
  const byPath = rows.reduce<Record<string, { busy: number; network: number; total: number }>>((acc, row) => {
    const key = String(row.path || '/');
    if (!acc[key]) acc[key] = { busy: 0, network: 0, total: 0 };
    acc[key].total += 1;
    if (isBusy(row)) acc[key].busy += 1;
    if (isNetwork(row)) acc[key].network += 1;
    return acc;
  }, {});
  const topPaths = Object.entries(byPath)
    .map(([path, stats]) => ({ path, ...stats }))
    .sort((a, b) => (b.busy + b.network) - (a.busy + a.network))
    .slice(0, 20);

  res.json(successResponse({
    since: sinceDate.toISOString(),
    sinceHours,
    totals: {
      events: rows.length,
      busy: busyCount,
      network: networkCount,
    },
    topPaths,
  }));
});

router.get('/network/failures', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Math.min(Number(req.query.page || 1), 500));
  const size = Math.max(10, Math.min(Number(req.query.size || 100), 500));
  const limit = Math.max(size, Math.min(Number(req.query.limit || 2500), 5000));
  const severity = String(req.query.severity || '').trim().toLowerCase();
  const eventTypeFilter = String(req.query.type || '').trim().toUpperCase();
  const pathContains = String(req.query.path || '').trim().toLowerCase();
  const search = String(req.query.search || '').trim().toLowerCase();
  const minStatus = Math.max(0, Math.min(Number(req.query.minStatus || 0), 999));
  const maxStatusRaw = Number(req.query.maxStatus || 0);
  const maxStatus = maxStatusRaw > 0 ? Math.max(minStatus || 1, Math.min(maxStatusRaw, 999)) : 0;
  const unresolvedOnly = String(req.query.unresolvedOnly || '').toLowerCase() === 'true';
  const sinceParam = String(req.query.since || '').trim();
  const sinceHours = Math.max(1, Math.min(Number(req.query.sinceHours || 24), 24 * 30));
  const sinceDate = parseIsoDateSafe(sinceParam) || new Date(Date.now() - (sinceHours * 60 * 60 * 1000));

  const events = await listSecurityEventsFromDb({
    severity: severity || undefined,
    since: sinceDate.toISOString(),
    limit,
    unresolvedOnly,
  });

  const mapped = (events || [])
    .map((item: any) => {
      const meta = toMetaObject(item?.meta);
      const status = parseMetaStatus(meta, String(item?.message || ''));
      return {
        id: String(item?.id || ''),
        ts: item?.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
        createdAt: item?.createdAt || new Date(),
        severity: String(item?.severity || '').toLowerCase(),
        type: String(item?.type || '').toUpperCase(),
        status,
        method: String(item?.method || '').toUpperCase(),
        path: String(item?.path || ''),
        ip: String(item?.ip || ''),
        message: String(item?.message || ''),
        userAgent: String(item?.userAgent || ''),
        requestId: String(meta.requestId || meta.clientRequestId || '').slice(0, 120),
        serverRequestId: String(meta.serverRequestId || '').slice(0, 120),
        origin: String(meta.origin || '').slice(0, 180),
        code: meta.code || meta.errorCode || null,
        durationMs: Number(meta.durationMs || 0) || 0,
        retryAttempts: Number(meta.retryAttempts || 0) || 0,
        timeoutMs: Number(meta.timeoutMs || 0) || 0,
        baseHost: String(meta.baseHost || '').slice(0, 120),
        attemptedHosts: Array.isArray(meta.attemptedHosts) ? meta.attemptedHosts.slice(0, 8) : [],
        resolvedAt: item?.resolvedAt || null,
        meta,
      };
    })
    .filter((row) => isFailureType(row.type, row.status))
    .filter((row) => (eventTypeFilter ? String(row.type || '').includes(eventTypeFilter) : true))
    .filter((row) => (pathContains ? String(row.path || '').toLowerCase().includes(pathContains) : true))
    .filter((row) => (minStatus ? row.status >= minStatus : true))
    .filter((row) => (maxStatus ? row.status <= maxStatus : true))
    .filter((row) => {
      if (!search) return true;
      const blob = [
        row.type,
        row.path,
        row.method,
        row.ip,
        row.message,
        row.status,
        row.code,
        row.requestId,
        row.serverRequestId,
        row.baseHost,
      ].join(' ').toLowerCase();
      return blob.includes(search);
    });

  const total = mapped.length;
  const start = (page - 1) * size;
  const records = mapped.slice(start, start + size);
  const ips = Array.from(new Set(records.map((row) => String(row.ip || '').trim()).filter(Boolean)));
  const usersByIp = await resolveIpUsers(ips);
  const enriched = records.map((row) => ({
    ...row,
    users: usersByIp[String(row.ip || '').trim()] || [],
  }));

  const statusBuckets = mapped.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.status || 0);
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
  const typeBuckets = mapped.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.type || 'UNKNOWN');
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
  const topTypes = Object.entries(typeBuckets)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
    .slice(0, 8);

  res.json(successResponse({
    records: enriched,
    total,
    page,
    size,
    summary: {
      statusBuckets,
      topTypes,
      since: sinceDate.toISOString(),
    },
  }));
});

router.get('/storage/status', authenticateAdmin, async (_req: AuthRequest, res: Response) => {
  await refreshStorageStatus();
  res.json(successResponse(getStorageStatus()));
});

router.get('/network/stream', authenticateAdmin, async (_req: AuthRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('hello', {
    ts: new Date().toISOString(),
    overview: getNetworkOverview(),
    security: getSecurityStats(),
    top: getNetworkTop(5),
  });

  const secUnsub = subscribeSecurityEvents((event) => send('security', event));
  const netUnsub = subscribeNetworkTelemetry((event) => send('network', event));
  const pulse = setInterval(() => {
    send('pulse', {
      ts: new Date().toISOString(),
      overview: getNetworkOverview(),
      security: getSecurityStats(),
    });
  }, 5000);

  _req.on('close', () => {
    clearInterval(pulse);
    secUnsub();
    netUnsub();
    res.end();
  });
});

export default router;

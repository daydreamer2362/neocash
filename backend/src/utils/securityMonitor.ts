type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';
import { getLoggingPolicy } from './storagePressure';
import prisma from './prisma';

export type SecurityEvent = {
  id: string;
  type: string;
  severity: SecuritySeverity;
  message: string;
  ip?: string;
  method?: string;
  path?: string;
  userAgent?: string;
  meta?: Record<string, any>;
  createdAt: Date;
  resolvedAt?: Date | null;
};

const MAX_EVENTS = Number(process.env.SECURITY_EVENT_BUFFER_SIZE || 5000);
const MAX_OVERFLOW_EVENTS = Math.max(100, Number(process.env.SECURITY_EVENT_OVERFLOW_BUFFER_SIZE || 400));
const events: SecurityEvent[] = [];

const listeners = new Set<(event: SecurityEvent) => void>();
const DB_PRUNE_INTERVAL_MS = Math.max(60_000, Number(process.env.SECURITY_DB_PRUNE_INTERVAL_MS || 5 * 60_000));
let lastPruneAt = 0;
let tableReady = false;
let tableInitFailed = false;

const nextId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const ensureSecurityEventLogTable = async () => {
  if (tableReady || tableInitFailed) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SecurityEventLog" (
        "id" TEXT PRIMARY KEY,
        "type" TEXT NOT NULL,
        "severity" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "ip" TEXT,
        "method" TEXT,
        "path" TEXT,
        "userAgent" TEXT,
        "meta" JSONB,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "resolvedAt" TIMESTAMPTZ
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SecurityEventLog_createdAt_idx" ON "SecurityEventLog" ("createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SecurityEventLog_severity_createdAt_idx" ON "SecurityEventLog" ("severity", "createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SecurityEventLog_resolvedAt_createdAt_idx" ON "SecurityEventLog" ("resolvedAt", "createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SecurityEventLog_type_createdAt_idx" ON "SecurityEventLog" ("type", "createdAt")');
    tableReady = true;
  } catch (_error) {
    tableInitFailed = true;
  }
};

const trimByRetention = () => {
  const policy = getLoggingPolicy();
  if (policy.retentionMs <= 0) {
    events.length = 0;
    return;
  }
  const floor = Date.now() - policy.retentionMs;
  while (events.length && events[events.length - 1].createdAt.getTime() < floor) {
    events.pop();
  }
};

export const recordSecurityEvent = (event: Omit<SecurityEvent, 'id' | 'createdAt' | 'resolvedAt'>) => {
  const policy = getLoggingPolicy();
  const criticalByType = ['AUTH', 'RATE_LIMIT', 'PAYMENT', 'SECURITY', 'CLIENT', 'CRASH', 'RUNTIME'].some((key) =>
    String(event.type || '').toUpperCase().includes(key),
  );
  const allowWhenOverflow = event.severity === 'critical' || criticalByType;
  if (!policy.realtimeLoggingEnabled && !allowWhenOverflow) {
    return {
      id: `${Date.now()}-skipped`,
      createdAt: new Date(),
      resolvedAt: null,
      ...event,
    } as SecurityEvent;
  }

  const payload: SecurityEvent = {
    id: nextId(),
    createdAt: new Date(),
    resolvedAt: null,
    ...event,
  };

  events.unshift(payload);
  trimByRetention();
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  if (policy.mode === 'OVERFLOW' && events.length > MAX_OVERFLOW_EVENTS) {
    events.length = MAX_OVERFLOW_EVENTS;
  }
  listeners.forEach((cb) => cb(payload));
  void persistSecurityEvent(payload);
  void pruneSecurityEventLogs();
  return payload;
};

export const listSecurityEvents = (params: {
  severity?: string;
  type?: string;
  since?: string;
  limit?: number;
  unresolvedOnly?: boolean;
}) => {
  trimByRetention();
  const severity = String(params.severity || '').toLowerCase();
  const type = String(params.type || '').trim().toUpperCase();
  const sinceTs = params.since ? new Date(params.since).getTime() : 0;
  const unresolvedOnly = Boolean(params.unresolvedOnly);
  const limit = Math.max(1, Math.min(Number(params.limit || 200), 5000));

  return events
    .filter((item) => (severity ? item.severity === severity : true))
    .filter((item) => (type ? item.type === type : true))
    .filter((item) => (sinceTs ? item.createdAt.getTime() >= sinceTs : true))
    .filter((item) => (unresolvedOnly ? !item.resolvedAt : true))
    .slice(0, limit);
};

export const getSecurityStats = () => {
  const unresolved = events.filter((item) => !item.resolvedAt);
  const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  unresolved.forEach((item) => {
    bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
  });

  return {
    totalBuffered: events.length,
    unresolved: unresolved.length,
    bySeverity,
    latestAt: events[0]?.createdAt || null,
  };
};

export const resolveSecurityEvent = (id: string) => {
  const item = events.find((event) => event.id === id);
  if (!item) return null;
  if (!item.resolvedAt) item.resolvedAt = new Date();
  void ensureSecurityEventLogTable()
    .then(async () => {
      if (!tableReady) return;
      await prisma.$executeRawUnsafe(
        'UPDATE "SecurityEventLog" SET "resolvedAt" = NOW() WHERE "id" = $1',
        id,
      );
    })
    .catch(() => undefined);
  return item;
};

export const subscribeSecurityEvents = (cb: (event: SecurityEvent) => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const persistSecurityEvent = async (event: SecurityEvent) => {
  try {
    await ensureSecurityEventLogTable();
    if (!tableReady) return;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SecurityEventLog"
      ("id", "type", "severity", "message", "ip", "method", "path", "userAgent", "meta", "createdAt", "resolvedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
      event.id,
      event.type,
      event.severity,
      event.message,
      event.ip || null,
      event.method || null,
      event.path || null,
      event.userAgent || null,
      event.meta ? JSON.stringify(event.meta) : null,
      event.createdAt,
      event.resolvedAt || null,
    );
  } catch (_error) {
    // Keep in-memory monitoring alive even if DB logging fails.
  }
};

export const pruneSecurityEventLogs = async (force = false) => {
  const now = Date.now();
  if (!force && now - lastPruneAt < DB_PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  const policy = getLoggingPolicy();
  try {
    await ensureSecurityEventLogTable();
    if (policy.mode === 'OVERFLOW' || policy.retentionMs <= 0) {
      // Keep a small in-memory window of critical/client crashes for active debugging,
      // while still clearing DB logs immediately under storage pressure.
      const keep = events
        .filter((item) => item.severity === 'critical' || String(item.type || '').toUpperCase().includes('CLIENT'))
        .slice(0, MAX_OVERFLOW_EVENTS);
      events.length = 0;
      keep.forEach((item) => events.push(item));
      if (tableReady) {
        await prisma.$executeRawUnsafe('DELETE FROM "SecurityEventLog"');
      }
      return;
    }

    const floor = new Date(now - policy.retentionMs);
    if (tableReady) {
      await prisma.$executeRawUnsafe(
        'DELETE FROM "SecurityEventLog" WHERE "createdAt" < $1',
        floor,
      );
    }
  } catch (_error) {
    // Ignore pruning failures so primary request path is unaffected.
  }
};

export const listSecurityEventsFromDb = async (params: {
  severity?: string;
  type?: string;
  since?: string;
  limit?: number;
  unresolvedOnly?: boolean;
}) => {
  await ensureSecurityEventLogTable();
  if (!tableReady) return listSecurityEvents(params);
  const severity = String(params.severity || '').toLowerCase();
  const type = String(params.type || '').trim().toUpperCase();
  const unresolvedOnly = Boolean(params.unresolvedOnly);
  const limit = Math.max(1, Math.min(Number(params.limit || 200), 5000));
  const since = params.since ? new Date(params.since) : null;

  const whereParts: string[] = [];
  const values: any[] = [];
  let idx = 1;
  if (severity) {
    whereParts.push(`"severity" = $${idx++}`);
    values.push(severity);
  }
  if (type) {
    whereParts.push(`"type" = $${idx++}`);
    values.push(type);
  }
  if (since && !Number.isNaN(since.getTime())) {
    whereParts.push(`"createdAt" >= $${idx++}`);
    values.push(since);
  }
  if (unresolvedOnly) {
    whereParts.push('"resolvedAt" IS NULL');
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  values.push(limit);
  const limitIdx = idx;

  const rowsRaw = await prisma.$queryRawUnsafe(
    `SELECT "id","type","severity","message","ip","method","path","userAgent","meta","createdAt","resolvedAt"
     FROM "SecurityEventLog"
     ${whereSql}
     ORDER BY "createdAt" DESC
     LIMIT $${limitIdx}`,
    ...values,
  );
  const rows = (rowsRaw as Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
    ip: string | null;
    method: string | null;
    path: string | null;
    userAgent: string | null;
    meta: Record<string, any> | null;
    createdAt: Date;
    resolvedAt: Date | null;
  }>);

  const toMetaObject = (value: unknown): Record<string, any> | undefined => {
    if (!value) return undefined;
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, any>;
      } catch (_error) {
        return { raw: value.slice(0, 1000) };
      }
    }
    return undefined;
  };

  const mapped = rows.map((row) => ({
    id: row.id,
    type: row.type,
    severity: row.severity as SecuritySeverity,
    message: row.message,
    ip: row.ip || undefined,
    method: row.method || undefined,
    path: row.path || undefined,
    userAgent: row.userAgent || undefined,
    meta: toMetaObject(row.meta),
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  }));
  if (!mapped.length) return listSecurityEvents(params);
  return mapped;
};

export const getSecurityStatsFromDb = async () => {
  await ensureSecurityEventLogTable();
  if (!tableReady) return getSecurityStats();

  const [totalRowsRaw, unresolvedRowsRaw, groupsRaw, latestRowsRaw] = await Promise.all([
    prisma.$queryRawUnsafe('SELECT COUNT(*)::bigint AS count FROM "SecurityEventLog"'),
    prisma.$queryRawUnsafe('SELECT COUNT(*)::bigint AS count FROM "SecurityEventLog" WHERE "resolvedAt" IS NULL'),
    prisma.$queryRawUnsafe(
      'SELECT "severity", COUNT(*)::bigint AS count FROM "SecurityEventLog" WHERE "resolvedAt" IS NULL GROUP BY "severity"',
    ),
    prisma.$queryRawUnsafe(
      'SELECT "createdAt" FROM "SecurityEventLog" ORDER BY "createdAt" DESC LIMIT 1',
    ),
  ]);
  const totalRows = totalRowsRaw as Array<{ count: bigint | number }>;
  const unresolvedRows = unresolvedRowsRaw as Array<{ count: bigint | number }>;
  const groups = groupsRaw as Array<{ severity: string; count: bigint | number }>;
  const latestRows = latestRowsRaw as Array<{ createdAt: Date }>;

  const totalBuffered = Number(totalRows?.[0]?.count || 0);
  const unresolved = Number(unresolvedRows?.[0]?.count || 0);

  const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  groups.forEach((item) => {
    bySeverity[String(item.severity)] = Number(item.count || 0);
  });

  return {
    totalBuffered,
    unresolved,
    bySeverity,
    latestAt: latestRows?.[0]?.createdAt || null,
  };
};

export const resolveSecurityEventInDb = async (id: string) => {
  await ensureSecurityEventLogTable();
  if (!tableReady) return resolveSecurityEvent(id);
  const now = new Date();
  const updatedRows = await prisma.$executeRawUnsafe(
    'UPDATE "SecurityEventLog" SET "resolvedAt" = $1 WHERE "id" = $2 AND "resolvedAt" IS NULL',
    now,
    id,
  );
  if (!updatedRows) {
    const existsRaw = await prisma.$queryRawUnsafe(
      'SELECT "id" FROM "SecurityEventLog" WHERE "id" = $1 LIMIT 1',
      id,
    );
    const exists = existsRaw as Array<{ id: string }>;
    if (!exists.length) return null;
  }

  const item = events.find((event) => event.id === id);
  if (item && !item.resolvedAt) item.resolvedAt = now;

  const rowsRaw = await prisma.$queryRawUnsafe(
    `SELECT "id","type","severity","message","ip","method","path","userAgent","meta","createdAt","resolvedAt"
     FROM "SecurityEventLog" WHERE "id" = $1 LIMIT 1`,
    id,
  );
  const rows = rowsRaw as Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
    ip: string | null;
    method: string | null;
    path: string | null;
    userAgent: string | null;
    meta: Record<string, any> | null;
    createdAt: Date;
    resolvedAt: Date | null;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    severity: row.severity as SecuritySeverity,
    message: row.message,
    ip: row.ip || undefined,
    method: row.method || undefined,
    path: row.path || undefined,
    userAgent: row.userAgent || undefined,
    meta: (row.meta as Record<string, any> | null) || undefined,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
};

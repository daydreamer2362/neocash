import { getLoggingPolicy } from './storagePressure';

type RequestPoint = {
  at: number;
  ip: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId?: string;
  requestId?: string;
  origin?: string;
  userAgent?: string;
};

const startedAt = Date.now();
const MAX_RECENT = 8000;
const MAX_LAT_SAMPLES = 2000;

const recentRequests: RequestPoint[] = [];
const latencySamples: number[] = [];
const ipStats = new Map<string, { count: number; errors: number; lastAt: number }>();
const ipUserStats = new Map<string, Map<string, { count: number; lastAt: number }>>();
const pathStats = new Map<string, { count: number; errors: number }>();
const statusStats = new Map<number, number>();

let totalRequests = 0;
let total4xx = 0;
let total5xx = 0;

const listeners = new Set<(payload: any) => void>();

const cutoff = (ms: number) => Date.now() - ms;

const trim = () => {
  const policy = getLoggingPolicy();
  if (policy.retentionMs <= 0) {
    recentRequests.length = 0;
    latencySamples.length = 0;
    ipUserStats.clear();
    return;
  }
  const floor = cutoff(policy.retentionMs);
  while (recentRequests.length && recentRequests[0].at < floor) recentRequests.shift();
  if (latencySamples.length > MAX_LAT_SAMPLES) latencySamples.splice(0, latencySamples.length - MAX_LAT_SAMPLES);
  for (const [ip, users] of ipUserStats.entries()) {
    for (const [userId, stats] of users.entries()) {
      if (Number(stats.lastAt || 0) < floor) users.delete(userId);
    }
    if (!users.size) ipUserStats.delete(ip);
  }
};

const topEntries = <T>(map: Map<string, T>, mapper: (value: T, key: string) => any, limit = 10) => (
  Array.from(map.entries())
    .map(([key, value]) => mapper(value, key))
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
    .slice(0, limit)
);

const percentile = (list: number[], p: number) => {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
};

export const recordRequestTelemetry = (point: RequestPoint) => {
  const policy = getLoggingPolicy();
  if (!policy.realtimeLoggingEnabled) return;

  totalRequests += 1;
  if (point.status >= 400 && point.status < 500) total4xx += 1;
  if (point.status >= 500) total5xx += 1;

  recentRequests.push(point);
  if (recentRequests.length > MAX_RECENT) recentRequests.shift();
  latencySamples.push(point.durationMs);

  const currentIp = ipStats.get(point.ip) || { count: 0, errors: 0, lastAt: 0 };
  currentIp.count += 1;
  if (point.status >= 400) currentIp.errors += 1;
  currentIp.lastAt = point.at;
  ipStats.set(point.ip, currentIp);

  const normalizedUserId = String(point.userId || '').trim();
  if (point.ip && normalizedUserId) {
    const usersForIp = ipUserStats.get(point.ip) || new Map<string, { count: number; lastAt: number }>();
    const userStats = usersForIp.get(normalizedUserId) || { count: 0, lastAt: 0 };
    userStats.count += 1;
    userStats.lastAt = point.at;
    usersForIp.set(normalizedUserId, userStats);
    ipUserStats.set(point.ip, usersForIp);
  }

  const keyPath = `${point.method} ${point.path}`;
  const currentPath = pathStats.get(keyPath) || { count: 0, errors: 0 };
  currentPath.count += 1;
  if (point.status >= 400) currentPath.errors += 1;
  pathStats.set(keyPath, currentPath);

  statusStats.set(point.status, (statusStats.get(point.status) || 0) + 1);

  trim();
  const payload = {
    type: 'request',
    ts: new Date(point.at).toISOString(),
    method: point.method,
    path: point.path,
    status: point.status,
    ip: point.ip,
    durationMs: point.durationMs,
    requestId: point.requestId,
    origin: point.origin,
  };
  listeners.forEach((cb) => cb(payload));
};

export const getNetworkOverview = () => {
  trim();
  const oneMinute = cutoff(60 * 1000);
  const oneHour = cutoff(60 * 60 * 1000);
  const inMinute = recentRequests.filter((item) => item.at >= oneMinute);
  const inHour = recentRequests.filter((item) => item.at >= oneHour);
  const minuteErrors = inMinute.filter((item) => item.status >= 400).length;
  const activeIps = new Set(inHour.map((item) => item.ip).filter(Boolean));
  const meanLatency = latencySamples.length
    ? latencySamples.reduce((sum, item) => sum + item, 0) / latencySamples.length
    : 0;

  return {
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    totalRequests,
    total4xx,
    total5xx,
    requestsLast1m: inMinute.length,
    errorRateLast1m: inMinute.length ? (minuteErrors / inMinute.length) * 100 : 0,
    avgLatencyMs: meanLatency,
    p95LatencyMs: percentile(latencySamples, 95),
    activeIpsLast1h: activeIps.size,
  };
};

export const getNetworkTop = (limit = 10) => {
  trim();
  const byIp = topEntries(ipStats, (value, ip) => ({ ip, count: value.count, errors: value.errors, lastAt: value.lastAt }), limit);
  const byPath = topEntries(pathStats, (value, path) => ({ path, count: value.count, errors: value.errors }), limit);
  const byStatus = Array.from(statusStats.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  return { byIp, byPath, byStatus };
};

export const getRecentRequestErrors = (limit = 100) => {
  trim();
  const capped = Math.max(1, Math.min(Number(limit || 100), 500));
  return [...recentRequests]
    .filter((item) => Number(item.status || 0) >= 400)
    .sort((a, b) => b.at - a.at)
    .slice(0, capped)
    .map((item) => ({
      ts: new Date(item.at).toISOString(),
      ip: item.ip,
      method: item.method,
      path: item.path,
      status: item.status,
      durationMs: item.durationMs,
      requestId: item.requestId,
      origin: item.origin,
      userAgent: item.userAgent,
    }));
};

export const getIpUserHints = (ips: string[]) => {
  trim();
  const result: Record<string, Array<{ userId: string; count: number; lastAt: number }>> = {};
  const uniqueIps = Array.from(new Set((ips || []).map((ip) => String(ip || '').trim()).filter(Boolean)));

  for (const ip of uniqueIps) {
    const users = ipUserStats.get(ip);
    if (!users || !users.size) continue;
    result[ip] = Array.from(users.entries())
      .map(([userId, stats]) => ({
        userId,
        count: Number(stats.count || 0),
        lastAt: Number(stats.lastAt || 0),
      }))
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, 5);
  }

  return result;
};

export const getEndpointHealth = (params?: {
  minutes?: number;
  limit?: number;
  minRequests?: number;
  minErrors?: number;
}) => {
  trim();
  const minutes = Math.max(1, Math.min(Number(params?.minutes || 60), 24 * 24));
  const limit = Math.max(5, Math.min(Number(params?.limit || 50), 300));
  const minRequests = Math.max(1, Math.min(Number(params?.minRequests || 1), 1000));
  const minErrors = Math.max(0, Math.min(Number(params?.minErrors || 0), 1000));
  const floor = cutoff(minutes * 60 * 1000);
  const rows = recentRequests.filter((item) => item.at >= floor);

  const grouped = new Map<string, {
    method: string;
    path: string;
    count: number;
    errors: number;
    s4xx: number;
    s5xx: number;
    latencies: number[];
    lastAt: number;
    lastStatus: number;
  }>();

  for (const row of rows) {
    const key = `${row.method} ${row.path}`;
    const current = grouped.get(key) || {
      method: row.method,
      path: row.path,
      count: 0,
      errors: 0,
      s4xx: 0,
      s5xx: 0,
      latencies: [],
      lastAt: 0,
      lastStatus: 0,
    };
    current.count += 1;
    if (row.status >= 400) current.errors += 1;
    if (row.status >= 400 && row.status < 500) current.s4xx += 1;
    if (row.status >= 500) current.s5xx += 1;
    if (current.latencies.length < 300) current.latencies.push(Number(row.durationMs || 0));
    current.lastAt = Math.max(current.lastAt, row.at);
    current.lastStatus = row.status;
    grouped.set(key, current);
  }

  const records = Array.from(grouped.values())
    .filter((item) => item.count >= minRequests)
    .filter((item) => item.errors >= minErrors)
    .map((item) => ({
      method: item.method,
      path: item.path,
      count: item.count,
      errors: item.errors,
      s4xx: item.s4xx,
      s5xx: item.s5xx,
      errorRate: item.count ? (item.errors / item.count) * 100 : 0,
      avgLatencyMs: item.latencies.length
        ? item.latencies.reduce((sum, n) => sum + n, 0) / item.latencies.length
        : 0,
      p95LatencyMs: percentile(item.latencies, 95),
      lastAt: item.lastAt ? new Date(item.lastAt).toISOString() : null,
      lastStatus: item.lastStatus || 0,
    }))
    .sort((a, b) =>
      (Number(b.errors || 0) - Number(a.errors || 0))
      || (Number(b.errorRate || 0) - Number(a.errorRate || 0))
      || (Number(b.count || 0) - Number(a.count || 0)))
    .slice(0, limit);

  return {
    windowMinutes: minutes,
    totalEndpoints: records.length,
    records,
  };
};

export const getFailureTimeline = (params?: {
  minutes?: number;
  bucketMinutes?: number;
  minStatus?: number;
}) => {
  trim();
  const minutes = Math.max(5, Math.min(Number(params?.minutes || 120), 24 * 24));
  const bucketMinutes = Math.max(1, Math.min(Number(params?.bucketMinutes || 5), 60));
  const minStatus = Math.max(400, Math.min(Number(params?.minStatus || 400), 599));
  const floor = cutoff(minutes * 60 * 1000);
  const bucketMs = bucketMinutes * 60 * 1000;
  const now = Date.now();
  const start = Math.floor(floor / bucketMs) * bucketMs;
  const bucketCount = Math.max(1, Math.ceil((now - start) / bucketMs) + 1);

  const buckets: Array<{
    ts: string;
    total: number;
    s4xx: number;
    s5xx: number;
    byStatus: Record<string, number>;
  }> = Array.from({ length: bucketCount }).map((_, idx) => ({
    ts: new Date(start + (idx * bucketMs)).toISOString(),
    total: 0,
    s4xx: 0,
    s5xx: 0,
    byStatus: {},
  }));

  for (const row of recentRequests) {
    if (row.at < floor) continue;
    if (Number(row.status || 0) < minStatus) continue;
    const idx = Math.floor((row.at - start) / bucketMs);
    if (idx < 0 || idx >= buckets.length) continue;
    const bucket = buckets[idx];
    bucket.total += 1;
    if (row.status >= 400 && row.status < 500) bucket.s4xx += 1;
    if (row.status >= 500) bucket.s5xx += 1;
    const key = String(row.status || 0);
    bucket.byStatus[key] = Number(bucket.byStatus[key] || 0) + 1;
  }

  return {
    windowMinutes: minutes,
    bucketMinutes,
    minStatus,
    points: buckets,
  };
};

export const subscribeNetworkTelemetry = (cb: (payload: any) => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

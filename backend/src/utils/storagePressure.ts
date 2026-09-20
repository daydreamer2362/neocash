import prisma from './prisma';

export type LogMode = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OVERFLOW';

export type StorageStatus = {
  usedMB: number;
  totalMB: number;
  usagePercent: number;
  mode: LogMode;
  retentionHours: number;
  realtimeLoggingEnabled: boolean;
  updatedAt: string;
  source: 'database' | 'fallback';
};

const TOTAL_MB = Number(process.env.DB_TOTAL_MB || 500);
const REFRESH_MS = Math.max(15_000, Number(process.env.STORAGE_STATUS_REFRESH_MS || 60_000));

const toMode = (usagePercent: number): LogMode => {
  if (usagePercent < 70) return 'NORMAL';
  if (usagePercent < 85) return 'WARNING';
  if (usagePercent < 95) return 'CRITICAL';
  return 'OVERFLOW';
};

const retentionHoursForMode = (mode: LogMode): number => {
  if (mode === 'NORMAL') return 12;
  if (mode === 'WARNING') return 6;
  if (mode === 'CRITICAL') return 2;
  return 0;
};

const buildStatus = (usedMB: number, source: 'database' | 'fallback'): StorageStatus => {
  const usagePercent = TOTAL_MB > 0 ? (usedMB / TOTAL_MB) * 100 : 0;
  const mode = toMode(usagePercent);
  const retentionHours = retentionHoursForMode(mode);
  return {
    usedMB: Number(usedMB.toFixed(2)),
    totalMB: TOTAL_MB,
    usagePercent: Number(usagePercent.toFixed(2)),
    mode,
    retentionHours,
    realtimeLoggingEnabled: mode !== 'OVERFLOW',
    updatedAt: new Date().toISOString(),
    source,
  };
};

let currentStatus: StorageStatus = buildStatus(0, 'fallback');

const queryUsedMb = async (): Promise<number> => {
  const rowsRaw = await prisma.$queryRawUnsafe(
    'SELECT pg_database_size(current_database()) AS bytes',
  );
  const rows = rowsRaw as Array<{ bytes: bigint | number | string }>;
  const raw = rows?.[0]?.bytes ?? 0;
  const bytes = typeof raw === 'bigint' ? Number(raw) : Number(raw || 0);
  if (!Number.isFinite(bytes) || bytes < 0) return 0;
  return bytes / (1024 * 1024);
};

export const refreshStorageStatus = async () => {
  try {
    const usedMB = await queryUsedMb();
    currentStatus = buildStatus(usedMB, 'database');
  } catch (error) {
    currentStatus = {
      ...currentStatus,
      updatedAt: new Date().toISOString(),
      source: 'fallback',
    };
  }
  return currentStatus;
};

export const getStorageStatus = () => currentStatus;

export const getLoggingPolicy = () => ({
  mode: currentStatus.mode,
  retentionMs: currentStatus.retentionHours > 0 ? currentStatus.retentionHours * 60 * 60 * 1000 : 0,
  realtimeLoggingEnabled: currentStatus.realtimeLoggingEnabled,
});

let started = false;
export const startStorageStatusMonitor = () => {
  if (started) return;
  started = true;
  refreshStorageStatus().catch(() => undefined);
  setInterval(() => {
    refreshStorageStatus().catch(() => undefined);
  }, REFRESH_MS);
};

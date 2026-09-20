import { PrismaClient } from '../../generated/prisma-client';

// Free-tier Postgres plans cap total connections low (often 20-100 shared across
// everything hitting the DB). Without a limit, Prisma's default pool sizing
// (num_cpus * 2 + 1) plus any bursts can exhaust that cap and take the DB down
// for every instance, not just this one. Pin it explicitly and fail fast
// (pool_timeout) instead of letting requests queue indefinitely under load.
const buildDatabaseUrl = (): string => {
  const raw = String(process.env.DATABASE_URL || '');
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', String(process.env.DATABASE_CONNECTION_LIMIT || 5));
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', String(process.env.DATABASE_POOL_TIMEOUT || 10));
    }
    return url.toString();
  } catch {
    return raw;
  }
};
process.env.DATABASE_URL = buildDatabaseUrl();

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  transactionOptions: {
    maxWait: Number(process.env.PRISMA_TX_MAX_WAIT_MS || 5000),
    timeout: Number(process.env.PRISMA_TX_TIMEOUT_MS || 15000),
  },
});

export default prisma;

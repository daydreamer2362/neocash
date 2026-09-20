import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma';
import { authenticateAdmin, authenticateAdminStream, AuthRequest, signAdminToken } from '../middleware/auth';
import {
  generateOrderCode, generateReferenceNo, generateOrderNumber, generateReferralCode,
  successResponse, errorResponse, ORDER_EXPIRY_MINUTES,
} from '../utils/helpers';
import { findUserIdByPublicUserId, getPublicUserIdMap } from '../utils/publicUserId';
import { calculateCommissions } from './order';
import { pushOrderUpdate } from '../utils/wsServer';
import { getReferralRates, setReferralRates } from '../utils/referralSettings';
import { getSystemSettings, updateSystemSettings } from '../utils/systemSettings';
import {
  listSecurityEvents,
  getSecurityStats,
  resolveSecurityEvent,
  subscribeSecurityEvents,
  listSecurityEventsFromDb,
  getSecurityStatsFromDb,
  resolveSecurityEventInDb,
  pruneSecurityEventLogs,
} from '../utils/securityMonitor';
import { getIpUserHints } from '../utils/networkTelemetry';

const router = Router();
const SELL_START_KEY_PREFIX = 'SELL_START_TS_';
const READY_SELL_TAG_PREFIX = 'TRANSFER:READYSELL:';
const READY_SELL_OPEN_USER_ORDER_STATUSES = new Set(['PENDING', 'SUBMITTED']);
const READY_SELL_DEBIT_TX_TYPES = new Set(['PAYOUT', 'REVERSAL']);
const ADMIN_ACCOUNT_CREATION_PASS = String(process.env.ADMIN_ACCOUNT_CREATION_PASS || 'admin@Gold11').trim() || 'admin@Gold11';

const createUniqueReferralCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generateReferralCode();
    const exists = await prisma.user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  throw new Error('REFERRAL_CODE_GENERATION_FAILED');
};


const readySellTagForUser = (userId: string) => `${READY_SELL_TAG_PREFIX}${userId}:${Date.now()}`;

const parseReadySellSourceUserId = (rawTag: unknown) => {
  const tag = String(rawTag || '');
  if (!tag.startsWith(READY_SELL_TAG_PREFIX)) return null;
  const rest = tag.slice(READY_SELL_TAG_PREFIX.length);
  const [userId] = rest.split(':');
  return userId ? String(userId) : null;
};

const mapReadySellOrderStatus = (order: any) => {
  const userOrder = Array.isArray(order?.userOrders) ? order.userOrders[0] : null;
  if (!userOrder) return 'IN_POOL';
  if (userOrder.status === 'PENDING') return 'CLAIMED';
  if (userOrder.status === 'SUBMITTED') return 'IN_COLLECTION';
  if (userOrder.status === 'COMPLETED' && userOrder.voucherStatus === 'APPROVED') return 'APPROVED';
  return String(userOrder.status || 'UNKNOWN');
};

const getReadySellOpenAmountMap = async (userIds: string[]) => {
  const openAmountByUser = new Map<string, number>();
  if (!userIds.length) return openAmountByUser;

  const orders = await prisma.order.findMany({
    where: {
      payoutWallet: { startsWith: READY_SELL_TAG_PREFIX },
      payoutAccount: { in: userIds },
    },
    select: {
      amount: true,
      payoutAccount: true,
      userOrders: {
        select: { status: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  for (const item of orders) {
    const ownerId = String(item.payoutAccount || '');
    if (!ownerId) continue;

    const claimed = item.userOrders[0] || null;
    const isOpen = !claimed || READY_SELL_OPEN_USER_ORDER_STATUSES.has(String(claimed.status || ''));
    if (!isOpen) continue;

    const running = Number(openAmountByUser.get(ownerId) || 0);
    openAmountByUser.set(ownerId, running + Number(item.amount || 0));
  }

  return openAmountByUser;
};

const attachUsersByIp = async <T extends { ip?: string }>(rows: T[]) => {
  const ips = Array.from(new Set(rows.map((row) => String(row?.ip || '').trim()).filter(Boolean)));
  if (!ips.length) return rows.map((row) => ({ ...row, users: [] as any[] }));

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

  return rows.map((row) => {
    const ip = String(row?.ip || '').trim();
    const matched = (byIp[ip] || []).map((entry) => {
      const user = userMap.get(String(entry.userId || ''));
      return {
        userId: entry.userId,
        userName: user?.userName || null,
        mail: user?.userName || null,
        phone: user?.phone || null,
        hitCount: Number(entry.count || 0),
        lastAt: entry.lastAt ? new Date(entry.lastAt).toISOString() : null,
      };
    });
    return { ...row, users: matched };
  });
};

const extractOrderRefFromDescription = (text: unknown) => {
  const raw = String(text || '');
  const match = raw.match(/\border\s+([A-Za-z0-9-]+)/i);
  return match ? String(match[1] || '').trim() : '';
};

const getReadySellTxnDirection = (type: unknown) =>
  READY_SELL_DEBIT_TX_TYPES.has(String(type || '').toUpperCase()) ? 'DEBIT' : 'CREDIT';

const getReadySellTxnLabel = (txn: any) => {
  const type = String(txn?.type || '').toUpperCase();
  const description = String(txn?.description || '');

  if (type === 'WELCOME_BONUS') return 'Welcome Bonus';
  if (type === 'PURCHASE') return 'Order Payment Approved';
  if (type === 'COMMISSION') return 'Referral Commission';
  if (type === 'DEPOSIT') return 'USDT Deposit';
  if (type === 'REVERSAL') return 'Order Reversal';
  if (type === 'REWARD') {
    return description.startsWith('Admin add balance')
      ? 'Admin Credit'
      : 'Reward';
  }
  if (type === 'PAYOUT') {
    return description.startsWith('Admin deduct balance')
      ? 'Admin Deduct'
      : 'Payout';
  }
  return type || 'Transaction';
};

// ═══════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════

// POST /admin/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    const userName = String(req.body?.userName ?? req.body?.username ?? '').trim();
    const password = String(req.body?.password || '');
    const creationPass = String(req.body?.creationPass || '').trim();

    if (!phone || !userName || !password || !creationPass) {
      res.status(400).json(errorResponse(5090, 'Phone, username, password and creation pass are required'));
      return;
    }

    if (creationPass !== ADMIN_ACCOUNT_CREATION_PASS) {
      res.status(403).json(errorResponse(5091, 'Invalid admin creation pass'));
      return;
    }

    if (password.length < 6) {
      res.status(400).json(errorResponse(5092, 'Password must be at least 6 characters'));
      return;
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { phone },
          { userName },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      res.status(409).json(errorResponse(5093, 'Admin account already exists with this phone or username'));
      return;
    }

    const referralCode = await createUniqueReferralCode();
    const hashedPassword = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        phone,
        userName,
        password: hashedPassword,
        referralCode,
        role: 'ADMIN',
        welcomeBonusClaimed: true,
      },
      select: {
        id: true,
        phone: true,
        userName: true,
      },
    });

    res.json(successResponse(created, 'Admin account created'));
  } catch (error) {
    if (error instanceof Error && error.message === 'REFERRAL_CODE_GENERATION_FAILED') {
      res.status(500).json(errorResponse(5094, 'Unable to generate referral code for admin account'));
      return;
    }
    res.status(500).json(errorResponse(5095, 'Failed to create admin account'));
  }
});

// POST /admin/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const rawIdentifier = req.body?.phone ?? req.body?.userName ?? req.body?.username;
    const identifier = String(rawIdentifier || '').trim();
    const password = String(req.body?.password || '');
    if (!identifier || !password) {
      res.status(403).json(errorResponse(5001, 'Invalid admin credentials'));
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: identifier },
          { userName: identifier },
        ],
      },
    });

    if (!user || user.role !== 'ADMIN') {
      res.status(403).json(errorResponse(5001, 'Invalid admin credentials'));
      return;
    }

    let passwordMatches = false;
    const hashedLikeBcrypt = /^\$2[aby]\$/.test(String(user.password || ''));
    if (hashedLikeBcrypt) {
      passwordMatches = await bcrypt.compare(password, user.password);
    } else {
      // Backward compatibility for legacy plaintext admin passwords.
      passwordMatches = password === String(user.password || '');
      if (passwordMatches) {
        const hashed = await bcrypt.hash(password, 10);
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
      }
    }

    if (!passwordMatches) {
      res.status(403).json(errorResponse(5001, 'Invalid admin credentials'));
      return;
    }

    const token = signAdminToken({ id: user.id, phone: user.phone, role: user.role });
    res.json(successResponse({ token, userId: user.id, userName: user.userName }));
  } catch (error) {
    res.status(500).json(errorResponse(5002, 'Admin login failed'));
  }
});

// ═══════════════════════════════════════════════════════
//  DASHBOARD / STATISTICS
// ═══════════════════════════════════════════════════════

// GET /admin/dashboard
router.get('/dashboard', authenticateAdmin, async (_req: AuthRequest, res: Response) => {
  const [
    totalUsers, totalOrders, activeOrders, pendingOrders,
    successOrders, failedOrders, cancelledOrders,
    approvedOrders, approvedRevenue, totalPayoutOrders, pendingPayouts,
    totalUPIAccounts, onlineUPIAccounts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.order.count({ where: { status: 'READY' } }),
    prisma.userOrder.count({ where: { status: { in: ['PENDING', 'SUBMITTED'] } } }),
    prisma.userOrder.count({ where: { status: 'SUCCESS' } }),
    prisma.userOrder.count({ where: { status: 'FAILED' } }),
    prisma.userOrder.count({ where: { status: 'CANCELLED' } }),
    prisma.userOrder.count({ where: { voucherStatus: 'APPROVED' } }),
    prisma.userOrder.aggregate({ where: { voucherStatus: 'APPROVED' }, _sum: { amount: true } }),
    prisma.paymentOrder.count(),
    prisma.paymentOrder.count({ where: { status: 'PENDING' } }),
    prisma.adminUPIAccount.count(),
    prisma.adminUPIAccount.count({ where: { isOnline: true } }),
  ]);

  res.json(successResponse({
    totalUsers,
    totalOrders,
    activeOrders,
    pendingOrders,
    successOrders,
    failedOrders,
    cancelledOrders,
    approvedOrders,
    approvedRevenue: approvedRevenue._sum.amount || 0,
    totalRevenue: approvedRevenue._sum.amount || 0,
    totalPayoutOrders,
    pendingPayouts,
    totalUPIAccounts,
    onlineUPIAccounts,
  }));
});

// GET /admin/statistics — extended stats with date range
router.get('/statistics', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : new Date(Date.now() - 30 * 86400000);
  const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : new Date();

  const [ordersInRange, approvedOrdersInRange, approvedRevenueInRange, payoutsInRange, newUsers] = await Promise.all([
    prisma.userOrder.count({
      where: { createdAt: { gte: startDate, lte: endDate } },
    }),
    prisma.userOrder.count({
      where: {
        voucherStatus: 'APPROVED',
        createdAt: { gte: startDate, lte: endDate },
      },
    }),
    prisma.userOrder.aggregate({
      where: {
        voucherStatus: 'APPROVED',
        createdAt: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    }),
    prisma.paymentOrder.aggregate({
      where: { status: 'SUCCESS', createdAt: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    }),
    prisma.user.count({
      where: { createdAt: { gte: startDate, lte: endDate } },
    }),
  ]);

  const dailyRevenueRaw = await prisma.$queryRaw<any[]>`
    SELECT DATE("createdAt") as date, COALESCE(SUM(amount), 0) as total
    FROM "UserOrder"
    WHERE "voucherStatus" = 'APPROVED' AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
    GROUP BY DATE("createdAt")
    ORDER BY DATE("createdAt") ASC
  `;

  const dailyPayoutsRaw = await prisma.$queryRaw<any[]>`
    SELECT DATE("createdAt") as date, COALESCE(SUM(amount), 0) as total
    FROM "PaymentOrder"
    WHERE status = 'SUCCESS' AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
    GROUP BY DATE("createdAt")
    ORDER BY DATE("createdAt") ASC
  `;

  const serializeDaily = (raw: any[]) => raw.map((r: any) => ({
    date: r.date.toISOString().split('T')[0],
    total: Number(r.total || 0),
  }));

  res.json(successResponse({
    dateRange: { start: startDate, end: endDate },
    ordersInRange,
    approvedOrdersInRange,
    approvedRevenueInRange: approvedRevenueInRange._sum.amount || 0,
    revenueInRange: approvedRevenueInRange._sum.amount || 0,
    payoutsInRange: payoutsInRange._sum.amount || 0,
    newUsers,
    dailyRevenue: serializeDaily(dailyRevenueRaw),
    dailyPayouts: serializeDaily(dailyPayoutsRaw),
  }));
});

// GET /admin/referral/settings
router.get('/referral/settings', authenticateAdmin, async (_req: AuthRequest, res: Response) => {
  const settings = await getReferralRates();
  res.json(successResponse(settings));
});

// POST /admin/referral/settings
router.post('/referral/settings', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { levelBPercent, levelCPercent } = req.body;
    if (levelBPercent === undefined || levelCPercent === undefined) {
      res.status(400).json(errorResponse(5400, 'Both levelBPercent and levelCPercent are required'));
      return;
    }
    const updated = await setReferralRates(levelBPercent, levelCPercent);
    res.json(successResponse(updated, 'Referral commission settings updated'));
  } catch (error) {
    res.status(500).json(errorResponse(5401, 'Failed to update referral settings'));
  }
});

// GET /admin/system/settings
router.get('/system/settings', authenticateAdmin, async (_req: AuthRequest, res: Response) => {
  const settings = await getSystemSettings();
  res.json(successResponse(settings));
});

// POST /admin/system/settings
router.post('/system/settings', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const updated = await updateSystemSettings({
      welcomeBonus: req.body?.welcomeBonus,
      orderIncomePercent: req.body?.orderIncomePercent,
      payoutFeeRate: req.body?.payoutFeeRate,
      orderLockMinutes: req.body?.orderLockMinutes,
      messageWelcomeTitle: req.body?.messageWelcomeTitle,
      messageWelcomeBody: req.body?.messageWelcomeBody,
      appVersion: req.body?.appVersion,
      appForceUpdate: req.body?.appForceUpdate,
      appDownloadUrl: req.body?.appDownloadUrl,
      apiBaseUrl: req.body?.apiBaseUrl,
      supportTelegramUrl: req.body?.supportTelegramUrl,
    });
    res.json(successResponse(updated, 'System settings updated'));
  } catch (error) {
    res.status(500).json(errorResponse(5402, 'Failed to update system settings'));
  }
});

// ═══════════════════════════════════════════════════════
//  READY TO SELL
// ═══════════════════════════════════════════════════════

// GET /admin/ready-to-sell
router.get('/ready-to-sell', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const search = req.query.search ? String(req.query.search) : '';
  const publicSearchUserId = search ? await findUserIdByPublicUserId(search) : null;

  const where: any = { isSell: true };
  if (search) {
    where.OR = [
      ...(publicSearchUserId ? [{ id: publicSearchUserId }] : []),
      { id: { contains: search, mode: 'insensitive' } },
      { userName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { referralCode: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        userName: true,
        phone: true,
        referralCode: true,
        availableBalance: true,
        savedUpis: {
          where: { isDefault: true },
          select: { upiId: true, holderName: true, bankName: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.user.count({ where }),
  ]);

  const userIds = users.map((u) => u.id);
  const sellStartKeys = userIds.map((id) => `${SELL_START_KEY_PREFIX}${id}`);

  const [sellStartRows, readySellOrders, openAmountByUser] = await Promise.all([
    sellStartKeys.length
      ? prisma.setting.findMany({
        where: { key: { in: sellStartKeys } },
        select: { key: true, value: true },
      })
      : Promise.resolve([]),
    userIds.length
      ? prisma.order.findMany({
        where: {
          payoutWallet: { startsWith: READY_SELL_TAG_PREFIX },
          payoutAccount: { in: userIds },
        },
        select: {
          id: true,
          code: true,
          amount: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          payoutAccount: true,
          userOrders: {
            select: {
              buyId: true,
              status: true,
              voucherStatus: true,
              createdAt: true,
              user: { select: { userName: true, phone: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      : Promise.resolve([]),
    getReadySellOpenAmountMap(userIds),
  ]);

  const startedAtByUser = new Map<string, string>();
  for (const row of sellStartRows) {
    if (!row?.key?.startsWith(SELL_START_KEY_PREFIX)) continue;
    startedAtByUser.set(row.key.slice(SELL_START_KEY_PREFIX.length), String(row.value || ''));
  }

  const ordersByUser = new Map<string, any[]>();
  for (const order of readySellOrders) {
    const ownerId = String(order.payoutAccount || '');
    if (!ownerId) continue;
    if (!ordersByUser.has(ownerId)) ordersByUser.set(ownerId, []);

    const linkedUserOrder = order.userOrders[0] || null;
    ordersByUser.get(ownerId)!.push({
      orderId: order.id,
      code: order.code,
      amount: Number(order.amount || 0),
      orderPoolStatus: order.status,
      flowStatus: mapReadySellOrderStatus(order),
      buyId: linkedUserOrder?.buyId || null,
      buyerName: linkedUserOrder?.user?.userName || null,
      buyerPhone: linkedUserOrder?.user?.phone || null,
      userOrderStatus: linkedUserOrder?.status || null,
      voucherStatus: linkedUserOrder?.voucherStatus || null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
  }

  res.json(successResponse({
    records: users.map((user) => {
      const defaultUpi = user.savedUpis[0] || null;
      const availableAmount = Number(user.availableBalance || 0);
      const openAmount = Number(openAmountByUser.get(user.id) || 0);
      const sellableAmount = Math.max(availableAmount - openAmount, 0);
      return {
        userId: user.id,
        userName: user.userName,
        phone: user.phone,
        memberCode: user.referralCode,
        availableAmount,
        openSellAmount: openAmount,
        sellableAmount,
        payoutUpi: defaultUpi?.upiId || null,
        payoutHolderName: defaultUpi?.holderName || null,
        payoutWalletType: defaultUpi?.bankName || 'UPI',
        sellStartedAt: startedAtByUser.get(user.id) || null,
        sellOrders: ordersByUser.get(user.id) || [],
      };
    }),
    total,
    page,
    size,
  }));
});

// GET /admin/ready-to-sell/:userId/balance-history
router.get('/ready-to-sell/:userId/balance-history', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.params.userId || '').trim();
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(5, Math.min(Math.trunc(rawLimit), 100)) : 25;

    if (!userId) {
      res.status(400).json(errorResponse(5085, 'userId is required'));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userName: true,
        phone: true,
        referralCode: true,
        availableBalance: true,
      },
    });
    if (!user) {
      res.status(404).json(errorResponse(5086, 'User not found'));
      return;
    }

    const [latestTransactions, groupedTotals] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.transaction.groupBy({
        by: ['type'],
        where: { userId },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const refCandidates = new Set<string>();
    for (const txn of latestTransactions) {
      const refId = String(txn.refId || '').trim();
      if (refId) refCandidates.add(refId);

      const orderRefFromDesc = extractOrderRefFromDescription(txn.description);
      if (orderRefFromDesc) refCandidates.add(orderRefFromDesc);
    }

    const orderRefRows = refCandidates.size
      ? await prisma.userOrder.findMany({
        where: { buyId: { in: Array.from(refCandidates) } },
        select: {
          buyId: true,
          order: { select: { code: true } },
        },
      })
      : [];
    const orderCodeByRef = new Map(orderRefRows.map((row) => [String(row.buyId), String(row.order?.code || '')]));

    const records = latestTransactions.map((txn) => {
      const refId = String(txn.refId || '').trim();
      const orderRefFromDesc = extractOrderRefFromDescription(txn.description);
      const orderRef = refId || orderRefFromDesc || '';
      const orderCode = orderRef ? (orderCodeByRef.get(orderRef) || '') : '';
      const direction = getReadySellTxnDirection(txn.type);

      return {
        id: txn.id,
        type: txn.type,
        label: getReadySellTxnLabel(txn),
        direction,
        amount: Number(txn.amount || 0),
        description: txn.description || null,
        refId: refId || null,
        orderRef: orderRef || null,
        orderCode: orderCode || null,
        createdAt: txn.createdAt,
      };
    });

    const sourceTotals = groupedTotals
      .map((row) => {
        const direction = getReadySellTxnDirection(row.type);
        return {
          type: row.type,
          label: getReadySellTxnLabel({ type: row.type }),
          direction,
          amount: Number(row._sum.amount || 0),
          count: Number(row._count?._all || 0),
        };
      })
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const creditTotal = sourceTotals
      .filter((row) => row.direction === 'CREDIT')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const debitTotal = sourceTotals
      .filter((row) => row.direction === 'DEBIT')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    res.json(successResponse({
      userId: user.id,
      userName: user.userName,
      phone: user.phone,
      memberCode: user.referralCode,
      availableAmount: Number(user.availableBalance || 0),
      summary: {
        creditTotal,
        debitTotal,
        netTotal: creditTotal - debitTotal,
        sourceTotals,
      },
      records,
    }));
  } catch (error) {
    console.error('[Ready To Sell Balance History Error]', error);
    res.status(500).json(errorResponse(5087, 'Failed to load balance history'));
  }
});

// POST /admin/ready-to-sell/create-order
router.post('/ready-to-sell/create-order', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const amount = Number(req.body?.amount);

    if (!userId || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json(errorResponse(5080, 'userId and valid amount are required'));
      return;
    }

    const systemSettings = await getSystemSettings();
    const defaultIncomePercent = Number(systemSettings.orderIncomePercent || 4);
    const incomePercent = Number.isFinite(defaultIncomePercent) && defaultIncomePercent > 0
      ? defaultIncomePercent
      : 4;
    const reward = (amount * incomePercent) / 100;

    const created = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, userName: true, phone: true, isSell: true, availableBalance: true },
      });
      if (!user || !user.isSell) {
        throw new Error('READY_SELL_USER_NOT_ACTIVE');
      }

      const defaultUpi = await tx.savedUPI.findFirst({
        where: { userId: user.id, isDefault: true },
        select: { upiId: true, holderName: true, bankName: true },
      });
      if (!defaultUpi?.upiId) {
        throw new Error('READY_SELL_DEFAULT_UPI_REQUIRED');
      }

      const openOrders = await tx.order.findMany({
        where: {
          payoutWallet: { startsWith: READY_SELL_TAG_PREFIX },
          payoutAccount: user.id,
        },
        select: {
          amount: true,
          userOrders: {
            select: { status: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      let openAmount = 0;
      for (const item of openOrders) {
        const userOrder = item.userOrders[0] || null;
        const isOpen = !userOrder || READY_SELL_OPEN_USER_ORDER_STATUSES.has(String(userOrder.status || ''));
        if (isOpen) openAmount += Number(item.amount || 0);
      }

      const availableAmount = Number(user.availableBalance || 0);
      const sellableAmount = Math.max(availableAmount - openAmount, 0);
      if (amount > sellableAmount) {
        throw new Error('READY_SELL_AMOUNT_EXCEEDS_BALANCE');
      }

      return tx.order.create({
        data: {
          code: generateOrderCode(),
          amount,
          reward,
          incomePercent,
          status: 'READY',
          paymentType: 'UPI',
          payeeAccount: defaultUpi.upiId,
          payeeName: defaultUpi.holderName || user.userName,
          ifscCode: null,
          referenceNo: generateReferenceNo(),
          payoutAccount: user.id, // exclude owner from seeing this order
          payoutUPI: defaultUpi.upiId,
          payoutWallet: readySellTagForUser(user.id),
        },
      });
    });

    res.json(successResponse(created, 'Ready-to-sell order created'));
  } catch (error: any) {
    if (error?.message === 'READY_SELL_USER_NOT_ACTIVE') {
      res.status(400).json(errorResponse(5081, 'User is not in ready-to-sell mode'));
      return;
    }
    if (error?.message === 'READY_SELL_DEFAULT_UPI_REQUIRED') {
      res.status(400).json(errorResponse(5082, 'User default payout UPI is required'));
      return;
    }
    if (error?.message === 'READY_SELL_AMOUNT_EXCEEDS_BALANCE') {
      res.status(400).json(errorResponse(5083, 'Amount exceeds user sellable balance'));
      return;
    }

    console.error('[Ready To Sell Create Error]', error);
    res.status(500).json(errorResponse(5084, 'Failed to create ready-to-sell order'));
  }
});

// ═══════════════════════════════════════════════════════
//  ORDER MANAGEMENT (Purchase Orders)
// ═══════════════════════════════════════════════════════

// POST /admin/orders/generate — create order(s) with full bank details
router.post('/orders/generate', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const {
      amount, reward, incomePercent, count,
      payeeAccount, payeeName, ifscCode, paymentType,
      adminUPIAccountId, referenceNo,
    } = req.body;

    if (!amount) {
      res.status(400).json(errorResponse(5003, 'Amount is required'));
      return;
    }
    const systemSettings = await getSystemSettings();
    const configuredPercent = Number(systemSettings.orderIncomePercent || 4);
    const normalizedPaymentType = String(paymentType || 'IMPS').toUpperCase();
    if (normalizedPaymentType === 'UPI') {
      const hasCustomUpi = Boolean(payeeAccount && payeeName);
      if (!adminUPIAccountId && !hasCustomUpi) {
        res.status(400).json(errorResponse(5003, 'Admin UPI account or custom UPI details are required for UPI orders'));
        return;
      }
    } else {
      if (!payeeAccount || !payeeName || !ifscCode) {
        res.status(400).json(errorResponse(5003, 'Payee account, name, and IFSC are required'));
        return;
      }
    }

    const created: any[] = [];
    const amountNum = Number(amount);
    const hasRewardInput = reward !== undefined && reward !== null && String(reward).trim() !== '';
    const requestedPercent = incomePercent !== undefined && incomePercent !== null && String(incomePercent).trim() !== ''
      ? Number(incomePercent)
      : configuredPercent;
    const normalizedPercent = Number.isFinite(requestedPercent) && requestedPercent > 0 ? requestedPercent : configuredPercent;
    const normalizedReward = hasRewardInput ? Number(reward) : (amountNum * normalizedPercent) / 100;

    for (let i = 0; i < (count || 1); i++) {
      const code = generateOrderCode();
      const refNo = referenceNo || generateReferenceNo();

      const order = await prisma.order.create({
        data: {
          code,
          amount: amountNum,
          reward: normalizedReward,
          incomePercent: normalizedPercent,
          payeeAccount: payeeAccount || null,
          payeeName: payeeName || null,
          ifscCode: ifscCode || null,
          paymentType: normalizedPaymentType,
          referenceNo: refNo,
          adminUPIAccountId: adminUPIAccountId || null,
        },
      });
      created.push(order);
    }

    res.json(successResponse({ created: created.length, orders: created }, `${created.length} orders generated`));
  } catch (error) {
    console.error('[Generate Order Error]', error);
    res.status(500).json(errorResponse(5004, 'Failed to generate orders'));
  }
});

// GET /admin/orders/list — all orders (pool) with filters
router.get('/orders/list', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;

  const where: any = {};
  if (status) {
    where.status = status;
  } else {
    // Claimed orders are already in purchase flow and should not stay in pool view.
    where.status = { in: ['READY', 'CANCELLED'] };
  }
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { payeeName: { contains: search, mode: 'insensitive' } },
      { referenceNo: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [records, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        adminUPIAccount: { select: { accountName: true, walletType: true } },
        _count: { select: { userOrders: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.order.count({ where }),
  ]);

  res.json(successResponse({ records, total, page, size }));
});

// PUT /admin/orders/:id — edit order
router.put('/orders/:id', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      amount, reward, incomePercent, payeeAccount, payeeName,
      ifscCode, paymentType,
      status, adminUPIAccountId,
    } = req.body;

    const data: any = {};
    if (amount !== undefined) data.amount = Number(amount);
    if (reward !== undefined) data.reward = Number(reward);
    if (incomePercent !== undefined) data.incomePercent = Number(incomePercent);
    if (payeeAccount !== undefined) data.payeeAccount = payeeAccount;
    if (payeeName !== undefined) data.payeeName = payeeName;
    if (ifscCode !== undefined) data.ifscCode = ifscCode;
    if (paymentType !== undefined) data.paymentType = paymentType;
    if (req.body.referenceNo !== undefined) data.referenceNo = req.body.referenceNo;
    if (status !== undefined) data.status = status;
    if (adminUPIAccountId !== undefined) data.adminUPIAccountId = adminUPIAccountId;

    const order = await prisma.order.update({ where: { id }, data });
    res.json(successResponse(order, 'Order updated'));
  } catch (error) {
    res.status(500).json(errorResponse(5013, 'Failed to update order'));
  }
});

// DELETE /admin/orders/:id — cancel/delete order
router.delete('/orders/:id', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        _count: { select: { userOrders: true } },
      },
    });
    if (!order) { res.status(404).json(errorResponse(5014, 'Order not found')); return; }

    // If an order has claim history, keep referential integrity and soft-cancel.
    if (order.status === 'CLAIMED' || Number(order._count?.userOrders || 0) > 0) {
      await prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } });
      res.json(successResponse(null, 'Order marked as cancelled'));
    } else {
      await prisma.order.delete({ where: { id } });
      res.json(successResponse(null, 'Order deleted'));
    }
  } catch (error) {
    res.status(500).json(errorResponse(5015, 'Failed to delete order'));
  }
});

// GET /admin/orders/purchased — user-claimed orders (Purchase Orders table)
router.get('/orders/purchased', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;

  const where: any = {};
  if (status) {
    if (['APPROVED', 'REJECTED', 'TRANSFERRED', 'SUBMITTED', 'NONE'].includes(status)) {
      where.voucherStatus = status;
    } else {
      where.status = status;
    }
  }
  if (search) {
    where.OR = [
      { buyId: { contains: search, mode: 'insensitive' } },
      { user: { userName: { contains: search, mode: 'insensitive' } } },
      { user: { phone: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [records, total] = await Promise.all([
    prisma.userOrder.findMany({
      where,
      include: {
        user: { select: { userName: true, phone: true, referralCode: true } },
        order: {
          select: {
            code: true, payeeAccount: true, payeeName: true, ifscCode: true,
            paymentType: true, referenceNo: true, payoutWallet: true,
            adminUPIAccount: { select: { upiId: true, accountName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.userOrder.count({ where }),
  ]);

  const upiPairs = records
    .filter(r => r.payoutUPI)
    .map(r => ({ userId: r.userId, upiId: r.payoutUPI as string }));
  const upiRecords = upiPairs.length
    ? await prisma.savedUPI.findMany({ where: { OR: upiPairs } })
    : [];
  const upiMap = new Map(upiRecords.map(u => [`${u.userId}|${u.upiId}`, u.holderName]));

  res.json(successResponse({
    records: records.map((r: any) => ({
      transferSourceBuyId: String(r.order?.payoutWallet || '').startsWith('TRANSFER:')
        ? String(r.order.payoutWallet).replace('TRANSFER:', '')
        : null,
      id: r.id,
      buyId: r.buyId,
      code: r.order.code,
      userName: r.user.userName,
      phone: r.user.phone,
      memberCode: r.user.referralCode,
      userId: r.userId,
      amount: r.amount,
      reward: r.reward,
      status: r.status,
      voucherStatus: r.voucherStatus,
      displayStatus: r.status,
      isTransfer: r.voucherStatus === 'TRANSFERRED' || String(r.order?.payoutWallet || '').startsWith('TRANSFER:'),
      voucher: r.voucher,
      utr: r.utr,
      payeeAccount: r.order.payeeAccount,
      payeeName: r.order.payeeName,
      ifscCode: r.order.ifscCode,
      paymentType: r.order.paymentType,
      payoutWallet: r.payoutWallet,
      payoutAccount: r.payoutAccount,
      payoutAccountName: upiMap.get(`${r.userId}|${r.payoutUPI}`) || r.user.userName,
      payoutUPI: r.payoutUPI,
      paidToUpi: String(r.order.paymentType || '').toUpperCase() === 'UPI'
        ? (r.order.payeeAccount || r.order.adminUPIAccount?.upiId || null)
        : null,
      paidToName: String(r.order.paymentType || '').toUpperCase() === 'UPI'
        ? (r.order.payeeName || r.order.adminUPIAccount?.accountName || null)
        : null,
      referenceNo: r.order.referenceNo,
      expiresAt: r.expiresAt,
      soldAt: r.soldAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total, page, size,
  }));
});

// POST /admin/orders/mark-sold — mark user order as SUCCESS
router.post('/orders/mark-sold', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { buyId } = req.body;
    if (!buyId) { res.status(400).json(errorResponse(5005, 'buyId required')); return; }

    const userOrder = await prisma.userOrder.findUnique({
      where: { buyId },
      include: { user: true },
    });

    if (!userOrder) { res.status(404).json(errorResponse(5006, 'Order not found')); return; }
    if (userOrder.status === 'SUCCESS') {
      res.status(400).json(errorResponse(5007, 'Order already marked as sold'));
      return;
    }
    if (userOrder.status !== 'COMPLETED') {
      res.status(400).json(errorResponse(5008, `Cannot mark ${userOrder.status} order as sold`));
      return;
    }
    if (userOrder.voucherStatus !== 'APPROVED') {
      res.status(400).json(errorResponse(5008, 'Payment must be APPROVED in Collection before marking sold'));
      return;
    }

    const amount = Number(userOrder.amount);
    const reward = Number(userOrder.reward);

    await prisma.$transaction([
      prisma.userOrder.update({
        where: { buyId },
        data: {
          status: 'SUCCESS',
          soldAt: new Date(),
          voucherStatus: 'APPROVED',
          verifiedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: userOrder.userId },
        data: {
          availableBalance: { increment: reward },
          withdrawalBalance: { increment: amount },
          totalReward: { increment: reward },
          totalPayment: { increment: amount },
          totalReceive: { increment: amount },
        },
      }),
      prisma.transaction.create({
        data: {
          userId: userOrder.userId,
          amount,
          type: 'PAYOUT',
          description: `Order ${buyId} sold`,
          refId: buyId,
        },
      }),
      prisma.paymentOrder.create({
        data: {
          userId: userOrder.userId,
          memberCode: userOrder.user.userName,
          amount,
          upiId: userOrder.payoutUPI || null,
          accountNumber: userOrder.payoutAccount || null,
          walletType: userOrder.payoutWallet || null,
          status: 'PENDING',
          remark: `Auto payout for order ${buyId}`,
        },
      }),
      prisma.userNotification.create({
        data: {
          userId: userOrder.userId,
          title: 'Order Sold',
          body: `Your order ${buyId} has been marked sold. Payout is being processed.`,
          type: 'ORDER',
        },
      }),
    ]);

    await calculateCommissions(userOrder.userId, amount, buyId);
    pushOrderUpdate(userOrder.userId, { buyId, status: 'SUCCESS' });
    res.json(successResponse({ buyId, newStatus: 'SUCCESS' }, 'Order marked as sold'));
  } catch (error) {
    console.error('[Mark Sold Error]', error);
    res.status(500).json(errorResponse(5009, 'Failed to mark order as sold'));
  }
});

// POST /admin/orders/transfer — create a transfer order (UPI) based on a user order
router.post('/orders/transfer', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { buyId } = req.body;
    if (!buyId) { res.status(400).json(errorResponse(5016, 'buyId required')); return; }

    const userOrder = await prisma.userOrder.findUnique({
      where: { buyId },
      include: { user: true, order: true },
    });
    if (!userOrder) { res.status(404).json(errorResponse(5017, 'Order not found')); return; }
    if (userOrder.status !== 'COMPLETED') {
      res.status(400).json(errorResponse(5018, 'Only COMPLETED orders can be transferred'));
      return;
    }
    if (userOrder.voucherStatus === 'TRANSFERRED') {
      res.status(400).json(errorResponse(5018, 'Order already transferred'));
      return;
    }

    const savedUpi = await prisma.savedUPI.findFirst({
      where: { userId: userOrder.userId, upiId: userOrder.payoutUPI || '' },
    });
    const payeeAccount = userOrder.payoutUPI || '';
    const payeeName = savedUpi?.holderName || userOrder.user.userName;

    if (!payeeAccount || !payeeName) {
      res.status(400).json(errorResponse(5019, 'User UPI details are required for transfer'));
      return;
    }

    const order = await prisma.order.create({
      data: {
        code: generateOrderCode(),
        amount: userOrder.amount,
        reward: userOrder.reward,
        incomePercent: userOrder.order?.incomePercent || ((Number(userOrder.reward) / Number(userOrder.amount)) * 100),
        status: 'READY',
        paymentType: 'UPI',
        payeeAccount,
        payeeName,
        ifscCode: null,
        referenceNo: generateReferenceNo(),
        payoutAccount: userOrder.userId, // exclude original user from seeing this order
        payoutWallet: `TRANSFER:${userOrder.buyId}`,
      },
    });

    await prisma.userOrder.update({
      where: { buyId: userOrder.buyId },
      data: { voucherStatus: 'TRANSFERRED' },
    });

    res.json(successResponse(order, 'Transfer order created'));
  } catch (error) {
    console.error('[Transfer Order Error]', error);
    res.status(500).json(errorResponse(5020, 'Transfer order failed'));
  }
});

// POST /admin/orders/mark-failed — mark user order as FAILED
router.post('/orders/mark-failed', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { buyId, reason } = req.body;
    if (!buyId) { res.status(400).json(errorResponse(5005, 'buyId required')); return; }

    const userOrder = await prisma.userOrder.findUnique({ where: { buyId }, include: { order: true } });
    if (!userOrder) { res.status(404).json(errorResponse(5006, 'Order not found')); return; }

    const operations: any[] = [
      prisma.userOrder.update({
        where: { buyId },
        data: {
          status: 'FAILED',
          voucherStatus: 'REJECTED',
          rejectedAt: new Date(),
          rejectReason: reason || 'Rejected',
        },
      }),
      prisma.order.update({ where: { id: userOrder.orderId }, data: { status: 'READY' } }),
      prisma.userNotification.create({
        data: {
          userId: userOrder.userId,
          title: 'Order Rejected',
          body: `Your order ${buyId} was rejected. ${reason || 'Please contact support.'}`,
          type: 'ORDER',
        },
      }),
    ];

    if (userOrder.status === 'COMPLETED') {
      operations.push(
        prisma.user.update({
          where: { id: userOrder.userId },
          data: {
            availableBalance: { decrement: Number(userOrder.amount) + Number(userOrder.reward) },
            totalReward: { decrement: Number(userOrder.reward) },
            totalPayment: { decrement: Number(userOrder.amount) },
          },
        }),
        prisma.transaction.create({
          data: {
            userId: userOrder.userId,
            amount: userOrder.amount,
            type: 'REVERSAL',
            description: `Order ${buyId} sold`,
            refId: buyId,
          },
        }),
      );
    }

    await prisma.$transaction(operations);

    pushOrderUpdate(userOrder.userId, { buyId, status: 'FAILED' });
    res.json(successResponse({ buyId, newStatus: 'FAILED' }, 'Order marked as failed'));
  } catch (error) {
    console.error('[Mark Failed Error]', error);
    res.status(500).json(errorResponse(5016, 'Failed to mark order'));
  }
});

// ═══════════════════════════════════════════════════════
//  COLLECTION ORDERS (voucher verification)
// ═══════════════════════════════════════════════════════

// GET /admin/collection/list — orders with vouchers submitted for review
router.get('/collection/list', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;

  const where: any = { voucherStatus: { not: 'NONE' } };
  if (status) {
    where.voucherStatus = status;
  }

  const [records, total, totalPending, totalSuccess, totalFailed] = await Promise.all([
    prisma.userOrder.findMany({
      where,
      include: {
        user: { select: { userName: true, phone: true, referralCode: true } },
        order: {
          select: {
            code: true, amount: true, payeeAccount: true, payeeName: true,
            ifscCode: true, referenceNo: true, payoutWallet: true,
            paymentType: true,
            adminUPIAccount: { select: { upiId: true, accountName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.userOrder.count({ where }),
    prisma.userOrder.count({ where: { voucherStatus: 'SUBMITTED' } }),
    prisma.userOrder.count({ where: { voucherStatus: 'APPROVED' } }),
    prisma.userOrder.count({ where: { voucherStatus: 'REJECTED' } }),
  ]);

  res.json(successResponse({
    records: records.map((r: any) => ({
      transferSourceBuyId: String(r.order?.payoutWallet || '').startsWith('TRANSFER:')
        ? String(r.order.payoutWallet).replace('TRANSFER:', '')
        : null,
      id: r.id,
      buyId: r.buyId,
      code: r.order.code,
      userName: r.user.userName,
      phone: r.user.phone,
      memberCode: r.user.referralCode,
      amount: r.amount,
      reward: r.reward,
      status: r.voucherStatus,
      orderStatus: r.status,
      isTransfer: String(r.order?.payoutWallet || '').startsWith('TRANSFER:'),
      voucher: r.voucher,
      utr: r.utr,
      payeeAccount: r.order.payeeAccount,
      payeeName: r.order.payeeName,
      payoutWallet: r.payoutWallet,
      payoutAccount: r.payoutAccount,
      payoutUPI: r.payoutUPI,
      paidToUpi: String(r.order.paymentType || '').toUpperCase() === 'UPI'
        ? (r.order.payeeAccount || r.order.adminUPIAccount?.upiId || null)
        : null,
      paidToName: String(r.order.paymentType || '').toUpperCase() === 'UPI'
        ? (r.order.payeeName || r.order.adminUPIAccount?.accountName || null)
        : null,
      referenceNo: r.order.referenceNo,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total, page, size,
    summary: { totalPending, totalSuccess, totalFailed },
  }));
});

// POST /admin/collection/:id/verify — approve or reject voucher
router.post('/collection/:id/verify', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { action, reason } = req.body; // action: 'approve' | 'reject'

    const userOrder = await prisma.userOrder.findUnique({ where: { id }, include: { order: true } });
    if (!userOrder) { res.status(404).json(errorResponse(5020, 'Collection order not found')); return; }

    if (action === 'approve') {
      if (userOrder.status !== 'SUBMITTED') {
        res.status(400).json(errorResponse(5021, `Cannot approve order in ${userOrder.status} state`));
        return;
      }

      const amount = Number(userOrder.amount);
      const reward = Number(userOrder.reward);

      await prisma.$transaction([
        prisma.userOrder.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            voucherStatus: 'APPROVED',
            verifiedAt: new Date(),
          },
        }),
        prisma.user.update({
          where: { id: userOrder.userId },
          data: {
            availableBalance: { increment: amount + reward },
            totalReward: { increment: reward },
            totalPayment: { increment: amount },
          },
        }),
        prisma.transaction.create({
          data: {
            userId: userOrder.userId,
            amount,
            type: 'PURCHASE',
            description: `Order ${userOrder.buyId} sold`,
            refId: userOrder.buyId,
          },
        }),
        prisma.userNotification.create({
          data: {
            userId: userOrder.userId,
            title: 'Payment Verified',
            body: `Your payment for order ${userOrder.buyId} has been verified and order is completed.`,
            type: 'ORDER',
          },
        }),
      ]);
      await calculateCommissions(userOrder.userId, amount, userOrder.buyId);

      const transferTag = String(userOrder.order?.payoutWallet || '');
      const readySellSourceUserId = parseReadySellSourceUserId(transferTag);

      if (readySellSourceUserId) {
        const sourceUser = await prisma.user.findUnique({
          where: { id: readySellSourceUserId },
          select: { id: true, userName: true, phone: true },
        });

        if (sourceUser) {
          const sourceUpiIdRaw = String(userOrder.order?.payoutUPI || userOrder.order?.payeeAccount || '').trim();
          const sourceUpiId = sourceUpiIdRaw || null;
          const sourceUpi = sourceUpiId
            ? await prisma.savedUPI.findFirst({
              where: { userId: sourceUser.id, upiId: sourceUpiId },
              select: { bankName: true },
            })
            : null;

          await prisma.$transaction([
            prisma.user.update({
              where: { id: sourceUser.id },
              data: {
                availableBalance: { decrement: amount },
                withdrawalBalance: { increment: amount },
                totalReceive: { increment: amount },
              },
            }),
            prisma.transaction.create({
              data: {
                userId: sourceUser.id,
                amount,
                type: 'PAYOUT',
                description: `Order ${userOrder.order?.code || userOrder.buyId} sold`,
                refId: userOrder.buyId,
              },
            }),
            prisma.paymentOrder.create({
              data: {
                userId: sourceUser.id,
                memberCode: sourceUser.userName,
                amount,
                upiId: sourceUpiId,
                accountNumber: sourceUser.phone || null,
                walletType: sourceUpi?.bankName || 'UPI',
                payoutType: 'AUTO_TRANSFER',
                status: 'PENDING',
                remark: `Order ${userOrder.buyId} sold`,
              },
            }),
            prisma.userNotification.create({
              data: {
                userId: sourceUser.id,
                title: 'Order Sold',
                body: `Your ready-to-sell order has been approved. ₹${amount} moved to withdrawal balance.`,
                type: 'ORDER',
              },
            }),
          ]);
          await calculateCommissions(sourceUser.id, amount, userOrder.buyId);
          pushOrderUpdate(sourceUser.id, { buyId: userOrder.buyId, status: 'SUCCESS' });
        }
      } else if (transferTag.startsWith('TRANSFER:')) {
        const originalBuyId = transferTag.replace('TRANSFER:', '');
        const originalOrder = await prisma.userOrder.findUnique({
          where: { buyId: originalBuyId },
          include: { user: true },
        });

        if (originalOrder && originalOrder.status === 'COMPLETED' && originalOrder.voucherStatus === 'TRANSFERRED') {
          const originalAmount = Number(originalOrder.amount);
          await prisma.$transaction([
            prisma.userOrder.update({
              where: { buyId: originalBuyId },
              data: {
                status: 'SUCCESS',
                soldAt: new Date(),
              },
            }),
            prisma.user.update({
              where: { id: originalOrder.userId },
              data: {
                availableBalance: { decrement: originalAmount },
                withdrawalBalance: { increment: originalAmount },
                totalReceive: { increment: originalAmount },
              },
            }),
            prisma.transaction.create({
              data: {
                userId: originalOrder.userId,
                amount: originalAmount,
                type: 'PAYOUT',
                description: `Order ${originalBuyId} sold`,
                refId: originalBuyId,
              },
            }),
            prisma.paymentOrder.create({
              data: {
                userId: originalOrder.userId,
                memberCode: originalOrder.user.userName,
                amount: originalAmount,
                upiId: originalOrder.payoutUPI || null,
                accountNumber: originalOrder.payoutAccount || null,
                walletType: originalOrder.payoutWallet || null,
                payoutType: 'AUTO_TRANSFER',
                status: 'PENDING',
                remark: `Auto payout via transfer order approval (${userOrder.buyId})`,
              },
            }),
            prisma.userNotification.create({
              data: {
                userId: originalOrder.userId,
                title: 'Order Sold',
                body: `Your transfer order ${originalBuyId} is marked sold after payment approval.`,
                type: 'ORDER',
              },
            }),
          ]);
          await calculateCommissions(originalOrder.userId, originalAmount, originalBuyId);
          pushOrderUpdate(originalOrder.userId, { buyId: originalBuyId, status: 'SUCCESS' });
        }
      }

      pushOrderUpdate(userOrder.userId, { buyId: userOrder.buyId, status: 'COMPLETED' });
      res.json(successResponse({ id, status: 'APPROVED', orderStatus: 'COMPLETED' }, 'Collection approved'));
    } else if (action === 'reject') {
      const operations: any[] = [
        prisma.userOrder.update({
          where: { id },
          data: {
            status: 'FAILED',
            voucherStatus: 'REJECTED',
            rejectedAt: new Date(),
            rejectReason: reason || 'Rejected',
          },
        }),
        prisma.order.update({ where: { id: userOrder.orderId }, data: { status: 'READY' } }),
        prisma.userNotification.create({
          data: {
            userId: userOrder.userId,
            title: 'Payment Rejected',
            body: `Your payment for order ${userOrder.buyId} was rejected.`,
            type: 'ORDER',
          },
        }),
      ];

      await prisma.$transaction(operations);
      pushOrderUpdate(userOrder.userId, { buyId: userOrder.buyId, status: 'FAILED' });
      res.json(successResponse({ id, status: 'REJECTED', orderStatus: 'FAILED' }, `Collection rejected: ${reason || 'No reason'}`));
    } else {
      res.status(400).json(errorResponse(5022, 'Action must be "approve" or "reject"'));
    }
  } catch (error) {
    console.error('[Verify Collection Error]', error);
    res.status(500).json(errorResponse(5023, 'Verification failed'));
  }
});

// ═══════════════════════════════════════════════════════
//  PAYMENT ORDERS (admin payouts to users)
// ═══════════════════════════════════════════════════════

// GET /admin/payment-orders/list
router.get('/payment-orders/list', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const status = req.query.status ? String(req.query.status) : undefined;

  const where: any = {};
  if (status) where.status = status;

  const [records, total] = await Promise.all([
    prisma.paymentOrder.findMany({
      where,
      include: { user: { select: { userName: true, phone: true, referralCode: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.paymentOrder.count({ where }),
  ]);

  res.json(successResponse({ records, total, page, size }));
});

// POST /admin/payment-orders/create — create manual payout
router.post('/payment-orders/create', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, amount, upiId, bankName, accountNumber, ifsc, walletType, payoutType, remark } = req.body;
    if (!userId || !amount) {
      res.status(400).json(errorResponse(5030, 'userId and amount required'));
      return;
    }

    let user;
    const publicMappedUserId = await findUserIdByPublicUserId(String(userId || ''));
    if (userId && userId.length === 36 && userId.includes('-')) {
      user = await prisma.user.findUnique({ where: { id: userId } });
    }
    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            ...(publicMappedUserId ? [{ id: publicMappedUserId }] : []),
            { phone: userId },
            { referralCode: userId },
          ],
        },
      });
    }

    if (!user) { res.status(404).json(errorResponse(5031, 'User not found')); return; }

    const paymentOrder = await prisma.paymentOrder.create({
      data: {
        userId: user.id,
        memberCode: user.referralCode,
        amount: Number(amount),
        upiId: upiId || null,
        bankName: bankName || null,
        accountNumber: accountNumber || null,
        ifsc: ifsc || null,
        walletType: walletType || null,
        payoutType: payoutType || null,
        remark: remark || null,
      },
    });

    res.json(successResponse(paymentOrder, 'Payment order created'));
  } catch (error) {
    console.error('[Create Payment Order Error]', error);
    res.status(500).json(errorResponse(5032, 'Failed to create payment order'));
  }
});

// PUT /admin/payment-orders/:id/status — update payout status
router.put('/payment-orders/:id/status', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status, merchantId, utr } = req.body;

    const data: any = { status };
    if (merchantId) data.merchantId = merchantId;
    if (utr) data.utr = utr;
    if (status === 'SUCCESS') data.settlementTime = new Date();

    const updated = await prisma.paymentOrder.update({ where: { id }, data });
    if (status === 'SUCCESS') {
      await prisma.userNotification.create({
        data: {
          userId: updated.userId,
          title: 'Payout Completed',
          body: `Your payout of ₹${updated.amount} has been completed.`,
          type: 'PAYOUT',
        },
      });
    }
    res.json(successResponse(updated, `Payment order status updated to ${status}`));
  } catch (error) {
    res.status(500).json(errorResponse(5033, 'Failed to update payment order'));
  }
});

// ═══════════════════════════════════════════════════════
//  HISTORY
// ═══════════════════════════════════════════════════════

// GET /admin/history/list
router.get('/history/list', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const type = req.query.type ? String(req.query.type).toUpperCase() : '';
  const search = req.query.search ? String(req.query.search).toLowerCase() : '';
  const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : new Date();
  const startDate = req.query.startDate
    ? new Date(String(req.query.startDate))
    : new Date(endDate.getTime() - 30 * 86400000);
  const cap = Math.max(50, Math.min(Number(req.query.cap || 800), 2000));

  const [orders, userOrders, paymentOrders, offlineOrders] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, code: true, amount: true, reward: true, status: true,
        paymentType: true, referenceNo: true, createdAt: true, updatedAt: true,
      },
      take: cap,
    }),
    prisma.userOrder.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: {
        user: { select: { userName: true, phone: true, referralCode: true } },
        order: { select: { code: true, referenceNo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: cap,
    }),
    prisma.paymentOrder.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: { user: { select: { userName: true, phone: true, referralCode: true } } },
      orderBy: { createdAt: 'desc' },
      take: cap,
    }),
    prisma.offlineOrder.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(cap, 1200),
    }),
  ]);

  const events: Array<{
    eventType: string;
    eventTime: Date;
    code: string;
    member: string;
    amount: number;
    status: string;
    detail: string;
  }> = [];

  const pushEvent = (
    eventType: string,
    eventTime: Date | null | undefined,
    code: string,
    member: string,
    amount: number,
    status: string,
    detail: string,
  ) => {
    if (!eventTime) return;
    events.push({ eventType, eventTime, code, member, amount, status, detail });
  };

  orders.forEach((o: any) => {
    pushEvent(
      'ORDER_CREATED',
      o.createdAt,
      o.code,
      'SYSTEM',
      Number(o.amount || 0),
      o.status,
      `Order pool entry created (${o.paymentType || 'N/A'})`,
    );
    if (o.status === 'CANCELLED' && new Date(o.updatedAt).getTime() !== new Date(o.createdAt).getTime()) {
      pushEvent(
        'ORDER_DELETED',
        o.updatedAt,
        o.code,
        'SYSTEM',
        Number(o.amount || 0),
        o.status,
        'Order removed/cancelled from pool',
      );
    }
  });

  userOrders.forEach((u: any) => {
    const member = `${u.user?.userName || 'Unknown'} (${u.user?.phone || '—'})`;
    const code = u.order?.code || u.buyId;
    const amount = Number(u.amount || 0);

    pushEvent('ORDER_ON_SELL', u.createdAt, code, member, amount, u.status, `Order claimed by ${member}`);
    pushEvent('PAYMENT_SUBMITTED', u.submittedAt, code, member, amount, u.status, 'User submitted voucher/payment proof');
    pushEvent('ORDER_SOLD', u.soldAt, code, member, amount, u.status, 'Order marked sold');

    if (u.status === 'FAILED') {
      pushEvent('PAYMENT_NOT_PAID', u.rejectedAt || u.updatedAt, code, member, amount, u.status, u.rejectReason || 'Payment rejected/failed');
    }
    if ((u.status === 'CANCELLED' || u.status === 'TIMEOUT') && !u.submittedAt) {
      pushEvent('PAYMENT_NOT_PAID', u.updatedAt, code, member, amount, u.status, 'Claim window expired/cancelled before payment');
    }
  });

  paymentOrders.forEach((p: any) => {
    const member = `${p.user?.userName || 'Unknown'} (${p.user?.phone || '—'})`;
    const code = p.memberCode || p.id;
    const amount = Number(p.amount || 0);

    pushEvent('PAYOUT_CREATED', p.createdAt, code, member, amount, p.status, 'Payout order created');
    if (p.status === 'SUCCESS') {
      pushEvent('PAYOUT_SUCCESS', p.settlementTime || p.updatedAt, code, member, amount, p.status, 'Payout completed');
    }
    if (p.status === 'FAILED') {
      pushEvent('PAYOUT_FAILED', p.updatedAt, code, member, amount, p.status, 'Payout failed');
    }
  });

  offlineOrders.forEach((o: any) => {
    const code = o.orderNumber || o.id;
    pushEvent('OFFLINE_CREATED', o.createdAt, code, o.payerName || 'Offline', Number(o.amount || 0), o.status, `Offline ${o.walletType} order created`);
    if (o.status !== 'PENDING') {
      pushEvent('OFFLINE_STATUS', o.updatedAt, code, o.payerName || 'Offline', Number(o.amount || 0), o.status, `Offline order marked ${o.status}`);
    }
  });

  const filtered = events
    .filter((e) => (type ? e.eventType === type : true))
    .filter((e) => {
      if (!search) return true;
      return [
        e.eventType,
        e.code,
        e.member,
        e.status,
        e.detail,
      ].join(' ').toLowerCase().includes(search);
    })
    .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());

  const total = filtered.length;
  const start = (page - 1) * size;
  const records = filtered.slice(start, start + size);

  res.json(successResponse({ records, total, page, size }));
});

// GET /admin/security/events
router.get('/security/events', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await pruneSecurityEventLogs();
    const events = await listSecurityEventsFromDb({
      severity: req.query.severity ? String(req.query.severity) : undefined,
      type: req.query.type ? String(req.query.type) : undefined,
      since: req.query.since ? String(req.query.since) : undefined,
      unresolvedOnly: String(req.query.unresolvedOnly || '').toLowerCase() === 'true',
      limit: Number(req.query.limit || 200),
    });
    const enriched = await attachUsersByIp(events as any[]);
    res.json(successResponse(enriched));
  } catch (_error) {
    const fallback = listSecurityEvents({
      severity: req.query.severity ? String(req.query.severity) : undefined,
      type: req.query.type ? String(req.query.type) : undefined,
      since: req.query.since ? String(req.query.since) : undefined,
      unresolvedOnly: String(req.query.unresolvedOnly || '').toLowerCase() === 'true',
      limit: Number(req.query.limit || 200),
    });
    const enriched = await attachUsersByIp(fallback as any[]);
    res.json(successResponse(enriched));
  }
});

// GET /admin/security/stats
router.get('/security/stats', authenticateAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    await pruneSecurityEventLogs();
    res.json(successResponse(await getSecurityStatsFromDb()));
  } catch (_error) {
    res.json(successResponse(getSecurityStats()));
  }
});

// POST /admin/security/:id/resolve
router.post('/security/:id/resolve', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || '');
  let resolved = null as ReturnType<typeof resolveSecurityEvent> | Awaited<ReturnType<typeof resolveSecurityEventInDb>>;
  try {
    resolved = await resolveSecurityEventInDb(id);
  } catch (_error) {
    resolved = resolveSecurityEvent(id);
  }
  if (!resolved) {
    res.status(404).json(errorResponse(5601, 'Security event not found'));
    return;
  }
  res.json(successResponse(resolved, 'Security event resolved'));
});

// GET /admin/security/stream (SSE)
router.get('/security/stream', authenticateAdminStream, async (_req: AuthRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('hello', { ts: new Date().toISOString(), stats: getSecurityStats() });
  const unsubscribe = subscribeSecurityEvents((event) => send('security-event', event));

  const heartbeat = setInterval(() => {
    send('heartbeat', { ts: new Date().toISOString() });
  }, 15000);

  _req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

// ═══════════════════════════════════════════════════════
//  OFFLINE ORDERS
// ═══════════════════════════════════════════════════════

// GET /admin/offline/list
router.get('/offline/list', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const status = req.query.status ? String(req.query.status) : undefined;

  const where: any = {};
  if (status) where.status = status;

  const [records, total] = await Promise.all([
    prisma.offlineOrder.findMany({
      where,
      include: { adminUPIAccount: { select: { accountName: true, walletType: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.offlineOrder.count({ where }),
  ]);

  res.json(successResponse({ records, total, page, size }));
});

// POST /admin/offline/create
router.post('/offline/create', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { walletType, amount, utr, payerUPI, payerName, payerPhone, adminUPIAccountId, remark } = req.body;
    if (!walletType || !amount) {
      res.status(400).json(errorResponse(5040, 'walletType and amount required'));
      return;
    }

    const orderNumber = generateOrderNumber();
    const order = await prisma.offlineOrder.create({
      data: {
        orderNumber,
        walletType,
        amount: Number(amount),
        utr: utr || null,
        payerUPI: payerUPI || null,
        payerName: payerName || null,
        payerPhone: payerPhone || null,
        adminUPIAccountId: adminUPIAccountId || null,
        remark: remark || null,
      },
    });

    res.json(successResponse(order, 'Offline order created'));
  } catch (error) {
    res.status(500).json(errorResponse(5041, 'Failed to create offline order'));
  }
});

// PUT /admin/offline/:id/status
router.put('/offline/:id/status', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status, remark } = req.body;

    const data: any = { status };
    if (remark) data.remark = remark;

    const updated = await prisma.offlineOrder.update({ where: { id }, data });
    res.json(successResponse(updated, `Offline order updated to ${status}`));
  } catch (error) {
    res.status(500).json(errorResponse(5042, 'Failed to update offline order'));
  }
});

// ═══════════════════════════════════════════════════════
//  UPI ACCOUNT MANAGEMENT
// ═══════════════════════════════════════════════════════

// GET /admin/upi-accounts/list
router.get('/upi-accounts/list', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const isOnline = req.query.isOnline !== undefined
    ? req.query.isOnline === 'true'
    : undefined;

  const where: any = {};
  if (isOnline !== undefined) where.isOnline = isOnline;

  const [records, total] = await Promise.all([
    prisma.adminUPIAccount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.adminUPIAccount.count({ where }),
  ]);

  // Calculate success rate for each
  const enhancedRecords = records.map((r: any) => ({
    ...r,
    successRate: r.totalCount > 0
      ? ((r.successCount / r.totalCount) * 100).toFixed(2) + '%'
      : '0%',
  }));

  res.json(successResponse({ records: enhancedRecords, total, page, size }));
});

// POST /admin/upi-accounts/create
router.post('/upi-accounts/create', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const {
      loginNumber, accountName, walletType, upiId,
      bankName, accountNumber, ifsc, dailyLimit, minAmount, maxAmount,
    } = req.body;

    if (!loginNumber || !accountName || !walletType) {
      res.status(400).json(errorResponse(5050, 'loginNumber, accountName, walletType required'));
      return;
    }

    const account = await prisma.adminUPIAccount.create({
      data: {
        loginNumber,
        accountName,
        walletType,
        upiId: upiId || null,
        bankName: bankName || null,
        accountNumber: accountNumber || null,
        ifsc: ifsc || null,
        dailyLimit: dailyLimit ? Number(dailyLimit) : 100000,
        minAmount: minAmount ? Number(minAmount) : 100,
        maxAmount: maxAmount ? Number(maxAmount) : 100000,
      },
    });

    res.json(successResponse(account, 'UPI account created'));
  } catch (error) {
    console.error('[Create UPI Account Error]', error);
    res.status(500).json(errorResponse(5051, 'Failed to create UPI account'));
  }
});

// PUT /admin/upi-accounts/:id
router.put('/upi-accounts/:id', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      loginNumber, accountName, walletType, upiId,
      bankName, accountNumber, ifsc, dailyLimit, minAmount, maxAmount,
    } = req.body;

    const data: any = {};
    if (loginNumber !== undefined) data.loginNumber = loginNumber;
    if (accountName !== undefined) data.accountName = accountName;
    if (walletType !== undefined) data.walletType = walletType;
    if (upiId !== undefined) data.upiId = upiId;
    if (bankName !== undefined) data.bankName = bankName;
    if (accountNumber !== undefined) data.accountNumber = accountNumber;
    if (ifsc !== undefined) data.ifsc = ifsc;
    if (dailyLimit !== undefined) data.dailyLimit = Number(dailyLimit);
    if (minAmount !== undefined) data.minAmount = Number(minAmount);
    if (maxAmount !== undefined) data.maxAmount = Number(maxAmount);

    const updated = await prisma.adminUPIAccount.update({ where: { id }, data });
    res.json(successResponse(updated, 'UPI account updated'));
  } catch (error) {
    res.status(500).json(errorResponse(5052, 'Failed to update UPI account'));
  }
});

// DELETE /admin/upi-accounts/:id
router.delete('/upi-accounts/:id', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.adminUPIAccount.delete({ where: { id: String(req.params.id) } });
    res.json(successResponse(null, 'UPI account deleted'));
  } catch (error) {
    res.status(500).json(errorResponse(5053, 'Failed to delete UPI account'));
  }
});

// POST /admin/upi-accounts/:id/toggle — toggle online/offline
router.post('/upi-accounts/:id/toggle', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.adminUPIAccount.findUnique({ where: { id: String(req.params.id) } });
    if (!account) { res.status(404).json(errorResponse(5054, 'Account not found')); return; }

    const updated = await prisma.adminUPIAccount.update({
      where: { id: String(req.params.id) },
      data: { isOnline: !account.isOnline },
    });

    res.json(successResponse(updated, `Account ${updated.isOnline ? 'online' : 'offline'}`));
  } catch (error) {
    res.status(500).json(errorResponse(5055, 'Toggle failed'));
  }
});

// ═══════════════════════════════════════════════════════
//  TASK / MISSION MANAGEMENT
// ═══════════════════════════════════════════════════════

// GET /admin/tasks/list
router.get('/tasks/list', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const search = req.query.search ? String(req.query.search) : undefined;

  const where: any = {};
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { taskNumber: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [records, total] = await Promise.all([
    prisma.mission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.mission.count({ where }),
  ]);

  res.json(successResponse({ records, total, page, size }));
});

// POST /admin/tasks/create
router.post('/tasks/create', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { taskNumber, title, description, type, taskType, targetValue, rewardValue } = req.body;
    if (!title || !type) {
      res.status(400).json(errorResponse(5060, 'title and type required'));
      return;
    }

    const mission = await prisma.mission.create({
      data: {
        taskNumber: taskNumber || title.toLowerCase().replace(/\s+/g, '_'),
        title,
        description: description || null,
        type,
        taskType: taskType || 'daily_tasks',
        targetValue: targetValue ? Number(targetValue) : 0,
        rewardValue: rewardValue ? Number(rewardValue) : 0,
      },
    });

    res.json(successResponse(mission, 'Task created'));
  } catch (error) {
    console.error('[Create Task Error]', error);
    res.status(500).json(errorResponse(5061, 'Failed to create task'));
  }
});

// PUT /admin/tasks/:id
router.put('/tasks/:id', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { taskNumber, title, description, type, taskType, targetValue, rewardValue } = req.body;

    const data: any = {};
    if (taskNumber !== undefined) data.taskNumber = taskNumber;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (type !== undefined) data.type = type;
    if (taskType !== undefined) data.taskType = taskType;
    if (targetValue !== undefined) data.targetValue = Number(targetValue);
    if (rewardValue !== undefined) data.rewardValue = Number(rewardValue);

    const updated = await prisma.mission.update({ where: { id }, data });
    res.json(successResponse(updated, 'Task updated'));
  } catch (error) {
    res.status(500).json(errorResponse(5062, 'Failed to update task'));
  }
});

// DELETE /admin/tasks/:id
router.delete('/tasks/:id', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.mission.delete({ where: { id: String(req.params.id) } });
    res.json(successResponse(null, 'Task deleted'));
  } catch (error) {
    res.status(500).json(errorResponse(5063, 'Failed to delete task'));
  }
});

// POST /admin/tasks/:id/toggle — enable/disable
router.post('/tasks/:id/toggle', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const task = await prisma.mission.findUnique({ where: { id: String(req.params.id) } });
    if (!task) { res.status(404).json(errorResponse(5064, 'Task not found')); return; }

    const updated = await prisma.mission.update({
      where: { id: String(req.params.id) },
      data: { isActive: !task.isActive },
    });

    res.json(successResponse(updated, `Task ${updated.isActive ? 'enabled' : 'disabled'}`));
  } catch (error) {
    res.status(500).json(errorResponse(5065, 'Toggle failed'));
  }
});

// ═══════════════════════════════════════════════════════
//  USER MANAGEMENT
// ═══════════════════════════════════════════════════════

// GET /admin/users
router.get('/users', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const search = req.query.search ? String(req.query.search) : undefined;
  const publicSearchUserId = search ? await findUserIdByPublicUserId(search) : null;

  const where: any = {};
  if (search) {
    where.OR = [
      ...(publicSearchUserId ? [{ id: publicSearchUserId }] : []),
      { id: { contains: search, mode: 'insensitive' } },
      { userName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { referralCode: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, userName: true, phone: true, availableBalance: true,
        withdrawalBalance: true, totalPayment: true, totalReward: true,
        totalReceive: true, integralScore: true,
        isSell: true, role: true, isActive: true, createdAt: true,
        referralCode: true,
        _count: { select: { invitees: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.user.count({ where }),
  ]);

  const publicUserIdMap = await getPublicUserIdMap(users.map((u) => u.id));
  const records = users.map((u) => ({ ...u, userId: publicUserIdMap.get(u.id) || u.id }));

  res.json(successResponse({ records, total, page, size }));
});

// POST /admin/users/update-balance
router.post('/users/update-balance', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, amount, type } = req.body;
    if (!userId || !amount) {
      res.status(400).json(errorResponse(5010, 'userId and amount required'));
      return;
    }

    const data: any = {};
    if (type === 'add') {
      data.availableBalance = { increment: Number(amount) };
    } else {
      data.availableBalance = { decrement: Number(amount) };
    }

    await prisma.user.update({ where: { id: userId }, data });
    await prisma.transaction.create({
      data: {
        userId,
        amount: Number(amount),
        type: type === 'add' ? 'REWARD' : 'PAYOUT',
        description: `Admin ${type} balance: ₹${amount}`,
      },
    });

    res.json(successResponse(null, `Balance ${type === 'add' ? 'added' : 'deducted'}`));
  } catch (error) {
    res.status(500).json(errorResponse(5011, 'Balance update failed'));
  }
});

// POST /admin/users/:id/toggle-active — enable/disable user
router.post('/users/:id/toggle-active', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!user) { res.status(404).json(errorResponse(5070, 'User not found')); return; }

    const updated = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: { isActive: !user.isActive },
    });

    res.json(successResponse({ id: updated.id, isActive: updated.isActive },
      `User ${updated.isActive ? 'activated' : 'deactivated'}`));
  } catch (error) {
    res.status(500).json(errorResponse(5071, 'Failed to toggle user'));
  }
});

// ═══════════════════════════════════════════════════════
//  CAROUSEL MANAGEMENT
// ═══════════════════════════════════════════════════════

// GET /admin/carousel/config
router.get('/carousel/config', authenticateAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const enabledSetting = await prisma.setting.findUnique({ where: { key: 'CAROUSEL_ENABLED' } });
    const enabled = enabledSetting?.value === 'true';

    const orders = await prisma.order.findMany({
      where: { isCarousel: true },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { userOrders: true } } },
    });

    res.json(successResponse({
      enabled,
      orders: orders.map((o: any) => ({
        id: o.id,
        code: o.code,
        amount: Number(o.amount),
        reward: Number(o.reward),
        incomePercent: Number(o.incomePercent),
        status: o.status,
        claims: o._count?.userOrders || 0,
        paymentType: o.paymentType,
        createdAt: o.createdAt,
      })),
    }));
  } catch (error) {
    res.status(500).json(errorResponse(5100, 'Failed to fetch carousel config'));
  }
});

// POST /admin/carousel/config — toggle enabled/disabled
router.post('/carousel/config', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    await prisma.setting.upsert({
      where: { key: 'CAROUSEL_ENABLED' },
      update: { value: String(enabled) },
      create: { key: 'CAROUSEL_ENABLED', value: String(enabled) },
    });
    res.json(successResponse({ enabled }, `Carousel ${enabled ? 'enabled' : 'disabled'}`));
  } catch (error) {
    res.status(500).json(errorResponse(5101, 'Failed to update carousel config'));
  }
});

// POST /admin/carousel/orders/add — tag existing orders as carousel
router.post('/carousel/orders/add', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const rawIdentifiers = [
      ...(Array.isArray(req.body?.orderIds) ? req.body.orderIds : []),
      ...(Array.isArray(req.body?.orderCodes) ? req.body.orderCodes : []),
      req.body?.orderId,
      req.body?.orderCode,
    ];
    const identifiers = rawIdentifiers
      .map((value: any) => String(value || '').trim())
      .filter(Boolean);

    if (!identifiers.length) {
      res.status(400).json(errorResponse(5102, 'orderId/orderCode or orderIds/orderCodes required'));
      return;
    }

    const matchedOrders = await prisma.order.findMany({
      where: {
        OR: [
          { id: { in: identifiers } },
          { code: { in: identifiers } },
        ],
      },
      select: { id: true },
    });

    if (!matchedOrders.length) {
      res.status(404).json(errorResponse(5102, 'Order not found'));
      return;
    }

    const matchedOrderIds = matchedOrders.map((order: any) => order.id);
    await prisma.order.updateMany({
      where: { id: { in: matchedOrderIds } },
      data: { isCarousel: true },
    });
    res.json(successResponse({ tagged: matchedOrderIds.length }, 'Orders added to carousel'));
  } catch (error) {
    res.status(500).json(errorResponse(5103, 'Failed to add orders to carousel'));
  }
});

// POST /admin/carousel/orders/remove — un-tag order from carousel
router.post('/carousel/orders/remove', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const orderId = String(req.body?.orderId || '').trim();
    if (!orderId) {
      res.status(400).json(errorResponse(5104, 'orderId required'));
      return;
    }
    await prisma.order.update({
      where: { id: orderId },
      data: { isCarousel: false },
    });
    res.json(successResponse({ orderId }, 'Order removed from carousel'));
  } catch (error) {
    res.status(500).json(errorResponse(5105, 'Failed to remove order from carousel'));
  }
});

// POST /admin/carousel/orders/create — create new carousel-specific order
router.post('/carousel/orders/create', authenticateAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const amount = Number(req.body?.amount);
    const reward = Number(req.body?.reward);
    const incomePercent = Number(req.body?.incomePercent || 4);
    const count = Math.min(Number(req.body?.count || 1), 20);
    const paymentType = String(req.body?.paymentType || 'IMPS').toUpperCase();
    const adminUPIAccountId = req.body?.adminUPIAccountId;

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json(errorResponse(5106, 'Valid amount is required'));
      return;
    }
    const finalReward = Number.isFinite(reward) && reward > 0 ? reward : (amount * incomePercent) / 100;

    let finalPayeeAccount = req.body?.payeeAccount || null;
    let finalPayeeName = req.body?.payeeName || null;
    let finalIfscCode = req.body?.ifscCode || null;

    if (paymentType === 'UPI' && adminUPIAccountId) {
      const upiAccount = await prisma.adminUPIAccount.findUnique({ where: { id: adminUPIAccountId } });
      if (upiAccount) {
        finalPayeeAccount = upiAccount.upiId;
        finalPayeeName = upiAccount.accountName;
      }
    }

    const created: any[] = [];
    for (let i = 0; i < count; i++) {
      const order = await prisma.order.create({
        data: {
          code: generateOrderCode(),
          amount,
          reward: finalReward,
          incomePercent,
          status: 'READY',
          isCarousel: true,
          paymentType,
          payeeAccount: finalPayeeAccount,
          payeeName: finalPayeeName,
          ifscCode: finalIfscCode,
          referenceNo: generateReferenceNo(),
          adminUPIAccountId: adminUPIAccountId || null,
          payoutUPI: req.body?.payoutUPI || null,
        },
      });
      created.push(order);
    }

    res.json(successResponse({ count: created.length, orders: created.map((o) => ({ id: o.id, code: o.code, amount: Number(o.amount) })) }, 'Carousel orders created'));
  } catch (error) {
    console.error('[Carousel Create Error]', error);
    res.status(500).json(errorResponse(5107, 'Failed to create carousel orders'));
  }
});

// ═══════════════════════════════════════════════════════
//  Hero Carousel Management
// ═══════════════════════════════════════════════════════

router.get('/carousel/hero', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const slides = await prisma.heroCarousel.findMany({ orderBy: { sortOrder: 'asc' } });
    const setting = await prisma.setting.findUnique({ where: { key: 'HERO_CAROUSEL_ENABLED' } });
    const enabled = setting?.value === 'true';
    res.json(successResponse({ enabled, slides }));
  } catch (e) {
    console.error('[HeroCarousel List]', e);
    res.status(500).json(errorResponse(5200, 'Failed to fetch hero carousel'));
  }
});

router.post('/carousel/hero', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { id, type, mediaUrl, linkUrl, title, isActive, sortOrder } = req.body;
    if (!mediaUrl) {
      res.status(400).json(errorResponse(5201, 'mediaUrl is required'));
      return;
    }
    const data = {
      type: String(type || 'IMAGE').toUpperCase(),
      mediaUrl: String(mediaUrl).trim(),
      linkUrl: linkUrl ? String(linkUrl).trim() : null,
      title: title ? String(title).trim() : null,
      isActive: isActive !== false,
      sortOrder: Number(sortOrder || 0),
    };
    let slide;
    if (id) {
      slide = await prisma.heroCarousel.update({ where: { id: String(id) }, data });
    } else {
      slide = await prisma.heroCarousel.create({ data });
    }
    res.json(successResponse(slide, id ? 'Slide updated' : 'Slide created'));
  } catch (e) {
    console.error('[HeroCarousel Save]', e);
    res.status(500).json(errorResponse(5202, 'Failed to save hero carousel slide'));
  }
});

router.post('/carousel/hero/delete', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.body.id || '').trim();
    if (!id) { res.status(400).json(errorResponse(5203, 'id required')); return; }
    await prisma.heroCarousel.delete({ where: { id } });
    res.json(successResponse(null, 'Slide deleted'));
  } catch (e) {
    console.error('[HeroCarousel Delete]', e);
    res.status(500).json(errorResponse(5204, 'Failed to delete slide'));
  }
});

router.post('/carousel/hero/toggle', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const enabled = req.body.enabled === true;
    await prisma.setting.upsert({
      where: { key: 'HERO_CAROUSEL_ENABLED' },
      update: { value: String(enabled) },
      create: { key: 'HERO_CAROUSEL_ENABLED', value: String(enabled) },
    });
    res.json(successResponse({ enabled }, `Hero carousel ${enabled ? 'enabled' : 'disabled'}`));
  } catch (e) {
    console.error('[HeroCarousel Toggle]', e);
    res.status(500).json(errorResponse(5205, 'Failed to toggle hero carousel'));
  }
});

export default router;

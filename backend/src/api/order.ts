import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { generateBuyId, USDT_TO_INR, successResponse, errorResponse } from '../utils/helpers';
import { getReferralRates } from '../utils/referralSettings';
import { getSystemSettings } from '../utils/systemSettings';
import { recordSecurityEvent } from '../utils/securityMonitor';
import { pushOrderUpdate } from '../utils/wsServer';

const router = Router();

const ACTIVE_USER_ORDER_STATUSES = ['PENDING', 'SUBMITTED'];
const EXPIRABLE_USER_ORDER_STATUSES = ['PENDING'];
const ONE_TIME_ORDER_AMOUNT = 100;
const READY_SELL_TAG_PREFIX = 'TRANSFER:READYSELL:';
const ORDER_SUBMIT_TIMEOUT_MS = Math.max(4000, Number(process.env.ORDER_SUBMIT_TIMEOUT_MS || 15000));
const normalizeUtr = (value: unknown) =>
  String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .trim();
const STATUS_CODE_MAP: Record<string, number> = {
  PENDING: 1,
  SUBMITTED: 2,
  SUCCESS: 3,
  FAILED: 4,
  CANCELLED: 5,
  TIMEOUT: 6,
  COMPLETED: 7,
};
const isOneTimeAmountOrder = (amount: unknown) => Number(amount) === ONE_TIME_ORDER_AMOUNT;
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, marker: string): Promise<T> => {
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

const resolveStatusFilter = (rawStatus: unknown) => {
  const value = String(rawStatus || '').trim();
  if (!value) return undefined;

  const numericMap: Record<string, string> = {
    '1': 'PENDING',
    '2': 'SUBMITTED',
    '3': 'SUCCESS',
    '4': 'FAILED',
    '5': 'CANCELLED',
    '6': 'TIMEOUT',
    '7': 'COMPLETED',
  };

  if (numericMap[value]) return numericMap[value];
  return value.toUpperCase();
};

const mapReadySellFlowStatus = (order: any) => {
  const userOrder = Array.isArray(order?.userOrders) ? order.userOrders[0] : null;
  if (!userOrder) return 'IN_POOL';
  if (userOrder.status === 'PENDING') return 'CLAIMED';
  if (userOrder.status === 'SUBMITTED') return 'IN_COLLECTION';
  if (userOrder.status === 'COMPLETED' && userOrder.voucherStatus === 'APPROVED') return 'APPROVED';
  return String(userOrder.status || 'UNKNOWN');
};

const toUserOrderDto = (userOrder: any) => {
  const statusCode = STATUS_CODE_MAP[userOrder.status] || 0;
  const code = userOrder.order?.code || userOrder.code || userOrder.buyId;
  const order = userOrder.order || {};
  const adminUPI = order.adminUPIAccount || null;
  const isUpi = String(order.paymentType || '').toUpperCase() === 'UPI';
  const payeeAccount = isUpi ? (order.payeeAccount || adminUPI?.upiId || null) : (order.payeeAccount || null);
  const payeeName = isUpi ? (order.payeeName || adminUPI?.accountName || null) : (order.payeeName || null);

  return {
    id: userOrder.buyId,
    entityId: userOrder.id,
    buyId: userOrder.buyId,
    orderNo: code,
    code,
    amount: Number(userOrder.amount || 0),
    reward: Number(userOrder.reward || 0),
    income: Number(userOrder.reward || 0),
    type: '+',
    title: 'Purchase',
    orderType: 1,
    incomePercent: userOrder.order?.incomePercent != null ? Number(userOrder.order.incomePercent) : undefined,
    status: userOrder.status,
    statusCode,
    statusName: userOrder.status,
    voucherStatus: userOrder.voucherStatus,
    voucher: userOrder.voucher,
    utr: userOrder.utr,
    payerUPI: userOrder.payerUPI,
    payerName: userOrder.payerName,
    soldAt: userOrder.soldAt,
    createdAt: userOrder.createdAt,
    createTime: userOrder.createdAt,
    updatedAt: userOrder.updatedAt,
    expiresAt: userOrder.status === 'PENDING' ? userOrder.expiresAt : null,
    expireTime: userOrder.status === 'PENDING' ? userOrder.expiresAt : null,
    payoutWallet: userOrder.payoutWallet,
    payoutAccount: userOrder.payoutAccount,
    payoutUPI: userOrder.payoutUPI,
    payeeAccount,
    payeeName,
    ifsc: order.ifscCode || null,
    paymentType: order.paymentType || 'IMPS',
    referenceNo: order.referenceNo || null,
    adminUpiId: adminUPI?.upiId || null,
    adminUpiName: adminUPI?.accountName || null,
    adminWalletType: adminUPI?.walletType || null,
  };
};

const shouldReverseSubmittedCredit = (userOrder: any) => Boolean(userOrder?.submittedAt);

const findUserOrder = async (params: {
  buyId?: string;
  id?: string;
  userId?: string;
  include?: Record<string, any>;
}) => {
  const where: any[] = [];
  if (params.buyId) where.push({ buyId: params.buyId });
  if (params.id) where.push({ id: params.id }, { buyId: params.id });
  if (!where.length) return null;

  return prisma.userOrder.findFirst({
    where: {
      OR: where,
      ...(params.userId ? { userId: params.userId } : {}),
    },
    include: params.include,
  });
};

const autoExpireIfNeeded = async (userOrder: any) => {
  if (!userOrder?.expiresAt) return userOrder;
  if (!EXPIRABLE_USER_ORDER_STATUSES.includes(userOrder.status)) return userOrder;
  if (new Date(userOrder.expiresAt).getTime() > Date.now()) return userOrder;

  const operations: any[] = [
    prisma.userOrder.update({
      where: { buyId: userOrder.buyId },
      data: { status: 'TIMEOUT' },
    }),
    prisma.order.update({
      where: { id: userOrder.orderId },
      data: { status: 'READY' },
    }),
  ];

  if (shouldReverseSubmittedCredit(userOrder)) {
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
          description: `Order ${userOrder.buyId} expired`,
          refId: userOrder.buyId,
        },
      }),
    );
  }

  await prisma.$transaction(operations);
  return { ...userOrder, status: 'TIMEOUT' };
};

router.get('/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const [user, pendingOrders] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          availableBalance: true,
          totalReward: true,
          withdrawalBalance: true,
        },
      }),
      prisma.userOrder.findMany({
        where: { userId, status: { in: ACTIVE_USER_ORDER_STATUSES } },
        select: { amount: true },
      }),
    ]);

    const frozenAmount = pendingOrders.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    res.json(successResponse({
      balance: Number(user?.availableBalance || 0),
      commission: Number(user?.totalReward || 0),
      frozenAmount,
      withdrawalBalance: Number(user?.withdrawalBalance || 0),
    }));
  } catch (error) {
    res.status(500).json(errorResponse(2001, 'Failed to fetch summary'));
  }
});

router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page || req.query.pageNum) || 1;
  const size = Number(req.query.size || req.query.pageSize) || 20;
  const userId = req.user!.id;
  const readySellPoolOnly = ['1', 'true', 'yes'].includes(String(req.query.readySellPool || '').toLowerCase())
    || String(req.query.source || '').toLowerCase() === 'ready-sell';

  const baseWhere: any = {
    status: 'READY',
    OR: [
      { payoutAccount: null },
      { payoutAccount: { not: userId } },
    ],
  };
  if (readySellPoolOnly) {
    baseWhere.payoutWallet = { startsWith: READY_SELL_TAG_PREFIX };
  }

  const hasUsedOneTimeAmountOrder = (await prisma.userOrder.count({
    where: { userId, amount: ONE_TIME_ORDER_AMOUNT },
  })) > 0;

  let orders: any[] = [];
  let total = 0;

  if (readySellPoolOnly) {
    [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: baseWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.order.count({ where: baseWhere }),
    ]);
  } else if (hasUsedOneTimeAmountOrder) {
    const filteredWhere = { ...baseWhere, amount: { not: ONE_TIME_ORDER_AMOUNT } };
    [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: filteredWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.order.count({ where: filteredWhere }),
    ]);
  } else {
    const oneTimeWhere = { ...baseWhere, amount: ONE_TIME_ORDER_AMOUNT };
    const nonOneTimeWhere = { ...baseWhere, amount: { not: ONE_TIME_ORDER_AMOUNT } };

    const featuredOneTimeOrder = await prisma.order.findFirst({
      where: oneTimeWhere,
      orderBy: { createdAt: 'desc' },
    });

    if (!featuredOneTimeOrder) {
      [orders, total] = await Promise.all([
        prisma.order.findMany({
          where: baseWhere,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * size,
          take: size,
        }),
        prisma.order.count({ where: baseWhere }),
      ]);
    } else {
      const nonOneTimeTotal = await prisma.order.count({ where: nonOneTimeWhere });
      total = nonOneTimeTotal + 1;

      if (page === 1) {
        const remainingSlots = Math.max(size - 1, 0);
        const nonOneTimeOrders = remainingSlots > 0
          ? await prisma.order.findMany({
              where: nonOneTimeWhere,
              orderBy: { createdAt: 'desc' },
              skip: 0,
              take: remainingSlots,
            })
          : [];
        orders = [featuredOneTimeOrder, ...nonOneTimeOrders];
      } else {
        const nonOneTimeSkip = Math.max(((page - 1) * size) - 1, 0);
        orders = await prisma.order.findMany({
          where: nonOneTimeWhere,
          orderBy: { createdAt: 'desc' },
          skip: nonOneTimeSkip,
          take: size,
        });
      }
    }
  }

  res.json(successResponse({
    records: orders.map((order: any) => ({
      id: order.id,
      orderId: order.id,
      orderNo: order.code,
      code: order.code,
      amount: Number(order.amount),
      reward: Number(order.reward),
      income: Number(order.reward),
      incomePercent: Number(order.incomePercent),
      status: order.status,
      createTime: order.createdAt,
      payoutWallet: order.payoutWallet || null,
      isReadySellPool: String(order.payoutWallet || '').startsWith(READY_SELL_TAG_PREFIX),
    })),
    total,
    page,
    size,
  }));
});

router.post('/create', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      orderId,
      id,
      orderNo,
      code,
      payoutWallet,
      payoutUpiId,
      payoutUpi,
      payoutUPI,
    } = req.body;
    const userId = req.user!.id;

    const orderLookup = String(orderId || id || '').trim();
    const codeLookup = String(orderNo || code || '').trim();

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          ...(orderLookup ? [{ id: orderLookup }] : []),
          ...(codeLookup ? [{ code: codeLookup }] : []),
        ],
      },
    });

    if (!order || order.status !== 'READY') {
      res.status(400).json(errorResponse(2002, 'Order not available'));
      return;
    }
    if (order.payoutAccount && order.payoutAccount === userId) {
      res.status(400).json(errorResponse(2002, 'Order not available'));
      return;
    }
    if (isOneTimeAmountOrder(order.amount)) {
      const existingOneTimeOrder = await prisma.userOrder.count({
        where: { userId, amount: ONE_TIME_ORDER_AMOUNT },
      });
      if (existingOneTimeOrder > 0) {
        res.status(400).json(errorResponse(2002, 'Order not available'));
        return;
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, userName: true },
    });
    if (!user) {
      res.status(404).json(errorResponse(2003, 'User not found'));
      return;
    }

    let selectedUpi: any = null;
    if (payoutUpiId) {
      selectedUpi = await prisma.savedUPI.findFirst({
        where: { id: String(payoutUpiId), userId },
      });
    } else if (payoutUpi || payoutUPI) {
      selectedUpi = await prisma.savedUPI.findFirst({
        where: { userId, upiId: String(payoutUpi || payoutUPI) },
      });
    } else {
      selectedUpi = await prisma.savedUPI.findFirst({
        where: { userId, isDefault: true },
      });
    }

    if (!selectedUpi?.upiId) {
      res.status(400).json(errorResponse(2004, 'Please add a payout UPI before claiming an order'));
      return;
    }

    const buyId = generateBuyId();
    const { orderLockMinutes } = await getSystemSettings();
    const lockMinutes = Number(orderLockMinutes || 30);
    const expiresAt = new Date(Date.now() + lockMinutes * 60 * 1000);

    let result: any;

    try {
      result = await prisma.$transaction(async (tx: any) => {
        if (isOneTimeAmountOrder(order.amount)) {
          const existingOneTimeOrder = await tx.userOrder.count({
            where: { userId, amount: ONE_TIME_ORDER_AMOUNT },
          });
          if (existingOneTimeOrder > 0) {
            throw new Error('ORDER_NOT_AVAILABLE');
          }
        }

        const claimResult = await tx.order.updateMany({
          where: { id: order.id, status: 'READY' },
          data: { status: 'CLAIMED' },
        });
        if (claimResult.count === 0) {
          throw new Error('ORDER_NOT_AVAILABLE');
        }

        const newUserOrder = await tx.userOrder.create({
          data: {
            buyId,
            userId,
            orderId: order.id,
            amount: order.amount,
            reward: order.reward,
            status: 'PENDING',
            expiresAt,
            payoutWallet: payoutWallet || selectedUpi.bankName || 'UPI',
            payoutAccount: user.phone,
            payoutUPI: selectedUpi.upiId,
          },
          include: { order: true },
        });

        return newUserOrder;
      });
    } catch (error: any) {
      if (error?.message === 'ORDER_NOT_AVAILABLE') {
        res.status(400).json(errorResponse(2002, 'Order not available'));
        return;
      }
      throw error;
    }

    pushOrderUpdate(userId, { buyId: result.buyId, orderNo: result.order.code, status: result.status });

    res.json(successResponse({
      id: result.buyId,
      buyId: result.buyId,
      orderNo: result.order.code,
      amount: Number(result.amount),
      reward: Number(result.reward),
      status: result.status,
      expiresAt: result.expiresAt,
      payoutWallet: result.payoutWallet,
      payoutAccount: result.payoutAccount,
      payoutUPI: result.payoutUPI,
    }, 'Order claimed successfully'));
  } catch (error) {
    console.error('[Order Create Error]', error);
    res.status(500).json(errorResponse(2005, 'Order claim failed'));
  }
});

router.post('/submit', authenticateToken, async (req: AuthRequest, res: Response) => {
  const requestId = String((req as any)?.requestId || req.headers['x-client-request-id'] || req.headers['x-request-id'] || '').slice(0, 120);
  try {
    const { buyId, id, utr, payerUPI, payerName } = req.body;
    const userOrder = await findUserOrder({
      buyId: String(buyId || ''),
      id: String(id || ''),
      userId: req.user!.id,
    });

    if (!userOrder) {
      recordSecurityEvent({
        type: 'UTR_SUBMIT_REJECTED',
        severity: 'medium',
        message: 'UTR submit rejected: order not found',
        ip: String(req.ip || req.socket.remoteAddress || ''),
        method: req.method,
        path: req.originalUrl || req.url,
        userAgent: String(req.headers['user-agent'] || ''),
        meta: { code: 2007, status: 404, reason: 'ORDER_NOT_FOUND', requestId, userId: req.user?.id || null },
      });
      res.status(404).json(errorResponse(2007, 'Order not found'));
      return;
    }

    const updatedOrder = await autoExpireIfNeeded(userOrder);
    if (updatedOrder.status === 'TIMEOUT') {
      recordSecurityEvent({
        type: 'UTR_SUBMIT_REJECTED',
        severity: 'medium',
        message: 'UTR submit rejected: order expired',
        ip: String(req.ip || req.socket.remoteAddress || ''),
        method: req.method,
        path: req.originalUrl || req.url,
        userAgent: String(req.headers['user-agent'] || ''),
        meta: { code: 2007, status: 400, reason: 'ORDER_EXPIRED', requestId, buyId: updatedOrder.buyId },
      });
      res.status(400).json(errorResponse(2007, 'Order expired'));
      return;
    }
    if (!ACTIVE_USER_ORDER_STATUSES.includes(updatedOrder.status)) {
      recordSecurityEvent({
        type: 'UTR_SUBMIT_REJECTED',
        severity: 'medium',
        message: 'UTR submit rejected: invalid order status',
        ip: String(req.ip || req.socket.remoteAddress || ''),
        method: req.method,
        path: req.originalUrl || req.url,
        userAgent: String(req.headers['user-agent'] || ''),
        meta: { code: 2008, status: 400, reason: 'STATUS_INVALID', requestId, buyId: updatedOrder.buyId, orderStatus: updatedOrder.status },
      });
      res.status(400).json(errorResponse(2008, 'This order can no longer accept payment proof'));
      return;
    }

    const normalizedUtr = normalizeUtr(utr);
    if (!normalizedUtr) {
      res.status(400).json(errorResponse(2009, 'UTR is required'));
      return;
    }
    if (!/^[A-Z0-9]{8,30}$/.test(normalizedUtr)) {
      recordSecurityEvent({
        type: 'UTR_SUBMIT_REJECTED',
        severity: 'medium',
        message: 'UTR submit rejected: invalid UTR format',
        ip: String(req.ip || req.socket.remoteAddress || ''),
        method: req.method,
        path: req.originalUrl || req.url,
        userAgent: String(req.headers['user-agent'] || ''),
        meta: { code: 2015, status: 400, reason: 'UTR_FORMAT_INVALID', requestId, buyId: updatedOrder.buyId },
      });
      res.status(400).json(errorResponse(2015, 'UTR must be alphanumeric, 8-30 characters'));
      return;
    }

    try {
      await withTimeout(prisma.$transaction(async (tx: any) => {
        // Serialize same UTR submissions across concurrent requests (PostgreSQL scoped lock).
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          normalizedUtr,
        );

        const duplicateOrder = await tx.userOrder.findFirst({
          where: {
            buyId: { not: updatedOrder.buyId },
            utr: { equals: normalizedUtr, mode: 'insensitive' },
          },
          select: { buyId: true },
        });
        if (duplicateOrder) {
          const err: any = new Error('UTR_ALREADY_USED');
          err.code = 'UTR_ALREADY_USED';
          throw err;
        }

        await tx.userOrder.update({
          where: { buyId: updatedOrder.buyId },
          data: {
            status: 'SUBMITTED',
            expiresAt: null,
            voucher: null,
            utr: normalizedUtr,
            payerUPI: payerUPI || null,
            payerName: payerName || null,
            voucherStatus: 'SUBMITTED',
            submittedAt: updatedOrder.submittedAt || new Date(),
          },
        });
      }), ORDER_SUBMIT_TIMEOUT_MS, 'ORDER_SUBMIT_TIMEOUT');
    } catch (updateError: any) {
      if (updateError?.code === 'UTR_ALREADY_USED') {
        recordSecurityEvent({
          type: 'UTR_SUBMIT_REJECTED',
          severity: 'medium',
          message: 'UTR submit rejected: duplicate UTR',
          ip: String(req.ip || req.socket.remoteAddress || ''),
          method: req.method,
          path: req.originalUrl || req.url,
          userAgent: String(req.headers['user-agent'] || ''),
          meta: { code: 2016, status: 409, reason: 'UTR_ALREADY_USED', requestId, buyId: updatedOrder.buyId },
        });
        res.status(409).json(errorResponse(2016, 'This UTR is already used'));
        return;
      }
      if (updateError?.code === 'P2002') {
        recordSecurityEvent({
          type: 'UTR_SUBMIT_REJECTED',
          severity: 'medium',
          message: 'UTR submit rejected: duplicate UTR unique constraint',
          ip: String(req.ip || req.socket.remoteAddress || ''),
          method: req.method,
          path: req.originalUrl || req.url,
          userAgent: String(req.headers['user-agent'] || ''),
          meta: { code: 2016, status: 409, reason: 'UTR_DUPLICATE_UNIQUE', requestId, buyId: updatedOrder.buyId },
        });
        res.status(409).json(errorResponse(2016, 'This UTR is already used'));
        return;
      }
      if (String(updateError?.message || '') === 'ORDER_SUBMIT_TIMEOUT') {
        recordSecurityEvent({
          type: 'UTR_SUBMIT_TIMEOUT',
          severity: 'high',
          message: 'UTR submit transaction timed out',
          ip: String(req.ip || req.socket.remoteAddress || ''),
          method: req.method,
          path: req.originalUrl || req.url,
          userAgent: String(req.headers['user-agent'] || ''),
          meta: { code: 2017, status: 503, reason: 'ORDER_SUBMIT_TIMEOUT', requestId, buyId: updatedOrder.buyId, timeoutMs: ORDER_SUBMIT_TIMEOUT_MS },
        });
        res.status(503).json(errorResponse(2017, 'Submission service busy. Please retry'));
        return;
      }
      throw updateError;
    }
    pushOrderUpdate(req.user!.id, { buyId: updatedOrder.buyId, orderNo: (updatedOrder as any)?.order?.code || null, status: 'SUBMITTED' });
    res.json(successResponse({ buyId: updatedOrder.buyId }, 'UTR submitted'));
  } catch (error) {
    console.error('[Order Submit Error]', error);
    recordSecurityEvent({
      type: 'UTR_SUBMIT_ERROR',
      severity: 'high',
      message: 'Unhandled UTR submit error',
      ip: String(req.ip || req.socket.remoteAddress || ''),
      method: req.method,
      path: req.originalUrl || req.url,
      userAgent: String(req.headers['user-agent'] || ''),
      meta: {
        error: String((error as any)?.message || 'unknown'),
        requestId,
        status: 500,
      },
    });
    res.status(500).json(errorResponse(2008, 'Submission failed'));
  }
});

router.get('/orderInfo', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userOrder: any = await findUserOrder({
      buyId: String(req.query.buyId || ''),
      id: String(req.query.id || ''),
      userId: req.user!.id,
      include: {
        order: {
          include: {
            adminUPIAccount: {
              select: { upiId: true, accountName: true, walletType: true }
            }
          },
        },
        user: {
          select: {
            savedUpis: { where: { isDefault: true }, take: 1 },
          },
        },
      },
    });

    if (!userOrder) {
      res.status(404).json(errorResponse(2009, 'Order not found'));
      return;
    }

    const updatedOrder: any = await autoExpireIfNeeded(userOrder);
    res.json(successResponse({
      ...toUserOrderDto(updatedOrder),
      userDefaultUpi: userOrder.user.savedUpis[0]?.upiId || null,
      userDefaultUpiName: userOrder.user.savedUpis[0]?.holderName || null,
      longNo: updatedOrder.order.referenceNo || null,
    }));
  } catch (error) {
    console.error('[Order Info Error]', error);
    res.status(500).json(errorResponse(2010, 'Failed to fetch order info'));
  }
});

router.post('/cancel', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userOrder = await findUserOrder({
      buyId: String(req.body.buyId || ''),
      id: String(req.body.id || ''),
      userId: req.user!.id,
    });

    if (!userOrder || userOrder.status !== 'PENDING') {
      res.status(400).json(errorResponse(2011, 'Cannot cancel this order'));
      return;
    }

    await prisma.$transaction([
      prisma.userOrder.update({
        where: { buyId: userOrder.buyId },
        data: { status: 'CANCELLED' },
      }),
      prisma.order.update({
        where: { id: userOrder.orderId },
        data: { status: 'READY' },
      }),
    ]);

    pushOrderUpdate(req.user!.id, { buyId: userOrder.buyId, status: 'CANCELLED' });
    res.json(successResponse({ buyId: userOrder.buyId }, 'Order cancelled'));
  } catch (error) {
    console.error('[Order Cancel Error]', error);
    res.status(500).json(errorResponse(2012, 'Cancel failed'));
  }
});

router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page || req.query.pageNum) || 1;
  const size = Number(req.query.size || req.query.pageSize) || 20;
  const status = resolveStatusFilter(req.query.status);

  const where: any = { userId: req.user!.id };
  if (status) where.status = status;

  const records = await prisma.userOrder.findMany({
    where,
    include: { order: true },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * size,
    take: size,
  });
  const total = await prisma.userOrder.count({ where });

  res.json(successResponse({
    records: records.map(toUserOrderDto),
    total,
    page,
    size,
    pageNum: page,
    pageSize: size,
  }));
});

// Track orders created from Admin Ready-to-Sell for current user.
router.get('/readySellTrack', authenticateToken, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page || req.query.pageNum) || 1;
  const size = Number(req.query.size || req.query.pageSize) || 20;

  const where: any = {
    payoutWallet: { startsWith: READY_SELL_TAG_PREFIX },
    payoutAccount: req.user!.id,
  };

  const [records, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        code: true,
        amount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        payoutWallet: true,
        userOrders: {
          select: {
            buyId: true,
            status: true,
            voucherStatus: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.order.count({ where }),
  ]);

  res.json(successResponse({
    records: records.map((order: any) => {
      const linkedUserOrder = order.userOrders[0] || null;
      return {
        id: order.id,
        orderId: order.id,
        orderNo: order.code,
        code: order.code,
        amount: Number(order.amount || 0),
        status: order.status,
        orderPoolStatus: order.status,
        flowStatus: mapReadySellFlowStatus(order),
        buyId: linkedUserOrder?.buyId || null,
        userOrderStatus: linkedUserOrder?.status || null,
        voucherStatus: linkedUserOrder?.voucherStatus || null,
        createTime: order.createdAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    }),
    total,
    page,
    size,
    pageNum: page,
    pageSize: size,
  }));
});

router.get('/nightBonusStatus', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse({ status: false, enabled: false, bonusPercent: 0 }));
});

router.post('/createUsdt', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = req.body;
    if (!amount || Number(amount) <= 0) {
      res.status(400).json(errorResponse(2013, 'Valid USDT amount required'));
      return;
    }

    const inrValue = Number(amount) * USDT_TO_INR;
    const userId = req.user!.id;

    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          amount: inrValue,
          type: 'DEPOSIT',
          description: `USDT Deposit: ${amount} USDT -> Rs.${inrValue}`,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          integralScore: { increment: inrValue },
          availableBalance: { increment: inrValue },
        },
      }),
    ]);

    res.json(successResponse({ usdtAmount: amount, inrValue, rate: USDT_TO_INR }, 'USDT deposit successful'));
  } catch (error) {
    console.error('[USDT Create Error]', error);
    res.status(500).json(errorResponse(2014, 'USDT deposit failed'));
  }
});

router.get('/usdtInfo', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse({ rate: USDT_TO_INR, minDeposit: 1, maxDeposit: 10000 }));
});

export const calculateCommissions = async (userId: string, orderAmount: number, orderRef?: string) => {
  const { levelBRate, levelCRate } = await getReferralRates();

  const normalizedOrderRef = String(orderRef || '').trim();
  if (normalizedOrderRef) {
    const existing = await prisma.commission.count({
      where: { fromUserId: userId, orderId: normalizedOrderRef },
    });
    if (existing > 0) return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { inviter: { include: { inviter: true } } },
  });
  if (!user?.inviter) return;

  const levelB = orderAmount * levelBRate;
  await prisma.$transaction([
    prisma.commission.create({
      data: { userId: user.inviter.id, fromUserId: userId, amount: levelB, level: 'B', orderId: normalizedOrderRef || null },
    }),
    prisma.user.update({
      where: { id: user.inviter.id },
      data: { availableBalance: { increment: levelB }, totalReward: { increment: levelB } },
    }),
    prisma.transaction.create({
      data: {
        userId: user.inviter.id,
        amount: levelB,
        type: 'COMMISSION',
        description: `Level B commission from ${user.userName}`,
        refId: normalizedOrderRef || undefined,
      },
    }),
  ]);

  if (user.inviter.inviter) {
    const levelC = orderAmount * levelCRate;
    await prisma.$transaction([
      prisma.commission.create({
        data: { userId: user.inviter.inviter.id, fromUserId: userId, amount: levelC, level: 'C', orderId: normalizedOrderRef || null },
      }),
      prisma.user.update({
        where: { id: user.inviter.inviter.id },
        data: { availableBalance: { increment: levelC }, totalReward: { increment: levelC } },
      }),
      prisma.transaction.create({
        data: {
          userId: user.inviter.inviter.id,
          amount: levelC,
          type: 'COMMISSION',
          description: `Level C commission from ${user.userName}`,
          refId: normalizedOrderRef || undefined,
        },
      }),
    ]);
  }
};

// ═══════════════════════════════════════════════════════
//  CAROUSEL ORDERS (public user-facing)
// ═══════════════════════════════════════════════════════
router.get('/carousel', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const enabledSetting = await prisma.setting.findUnique({ where: { key: 'CAROUSEL_ENABLED' } });
    const enabled = enabledSetting?.value === 'true';
    if (!enabled) {
      res.json(successResponse({ enabled: false, orders: [] }));
      return;
    }

    const userId = req.user!.id;
    const orders = await prisma.order.findMany({
      where: {
        isCarousel: true,
        status: 'READY',
        userOrders: {
          none: { userId }
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    res.json(successResponse({
      enabled: true,
      orders: orders.map((order: any) => ({
        id: order.id,
        orderId: order.id,
        orderNo: order.code,
        code: order.code,
        amount: Number(order.amount),
        reward: Number(order.reward),
        income: Number(order.reward),
        incomePercent: Number(order.incomePercent),
        status: order.status,
        createTime: order.createdAt,
      })),
    }));
  } catch (error) {
    console.error('[Carousel Error]', error);
    res.status(500).json(errorResponse(2020, 'Failed to fetch carousel orders'));
  }
});

export default router;

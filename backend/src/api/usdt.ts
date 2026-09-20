import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticateToken, AuthRequest, authenticateAdmin } from '../middleware/auth';
import { successResponse, errorResponse, generateReferenceNo } from '../utils/helpers';
import { getSystemSettings, updateSystemSettings } from '../utils/systemSettings';
import { guardRoute, withRouteTimeout } from '../utils/routeGuard';

export const userUsdtRoutes = Router();
export const adminUsdtRoutes = Router();

const fetchUserUsdtOrders = async (userId: string) => withRouteTimeout(
  prisma.uSDTOrder.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  }),
  'USDT_USER_ORDERS_TIMEOUT',
);

// User: Get Settings
userUsdtRoutes.get('/settings', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 500,
  errorMessage: 'Failed to fetch USDT settings',
  busyCode: 501,
  busyMessage: 'USDT settings service busy. Please retry',
  eventType: 'USDT_USER_SETTINGS',
}, async (_req: AuthRequest, res: Response) => {
  const settings = await withRouteTimeout(getSystemSettings(), 'USDT_SETTINGS_TIMEOUT');
  res.json(successResponse({
    usdtInInr: settings.usdtInInr,
    usdtBonus: settings.usdtBonus,
    usdtWalletAddress: settings.usdtWalletAddress,
  }));
}));

// User: Create Order
userUsdtRoutes.post('/order', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 500,
  errorMessage: 'Failed to create USDT order',
  busyCode: 502,
  busyMessage: 'USDT order service busy. Please retry',
  eventType: 'USDT_USER_CREATE',
}, async (req: AuthRequest, res: Response) => {
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) {
    res.status(400).json(errorResponse(400, 'Invalid amount'));
    return;
  }

  const settings = await withRouteTimeout(getSystemSettings(), 'USDT_CREATE_SETTINGS_TIMEOUT');
  const rate = settings.usdtInInr || 103;
  const bonus = settings.usdtBonus || 0;
  const walletAddress = settings.usdtWalletAddress;

  if (!walletAddress) {
    res.status(400).json(errorResponse(400, 'USDT deposit is currently unavailable. No Wallet Address configured.'));
    return;
  }

  const totalReceive = (amount * rate) + (amount * bonus);

  const order = await withRouteTimeout(prisma.uSDTOrder.create({
    data: {
      userId: req.user!.id,
      amount,
      rate,
      bonus: amount * bonus,
      totalReceive,
      walletAddress,
      referenceNo: generateReferenceNo(),
    },
  }), 'USDT_CREATE_ORDER_TIMEOUT');

  res.json(successResponse(order, 'USDT Order created successfully'));
}));

// User: Get Orders
userUsdtRoutes.get('/order', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 500,
  errorMessage: 'Failed to fetch USDT orders',
  busyCode: 503,
  busyMessage: 'USDT history service busy. Please retry',
  eventType: 'USDT_USER_HISTORY',
}, async (req: AuthRequest, res: Response) => {
  const orders = await fetchUserUsdtOrders(req.user!.id);
  res.json(successResponse(orders));
}));

// User: Get Orders (compat route for frontend)
userUsdtRoutes.get('/order/history', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 500,
  errorMessage: 'Failed to fetch USDT orders',
  busyCode: 503,
  busyMessage: 'USDT history service busy. Please retry',
  eventType: 'USDT_USER_HISTORY',
}, async (req: AuthRequest, res: Response) => {
  const orders = await fetchUserUsdtOrders(req.user!.id);
  res.json(successResponse(orders));
}));

// User: Get Order by ID or Reference No
userUsdtRoutes.get('/order/:id', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 500,
  errorMessage: 'Failed to fetch USDT order',
  busyCode: 504,
  busyMessage: 'USDT order lookup service busy. Please retry',
  eventType: 'USDT_USER_ORDER_BY_ID',
}, async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json(errorResponse(400, 'Order id is required'));
    return;
  }

  const order = await withRouteTimeout(prisma.uSDTOrder.findFirst({
    where: {
      userId: req.user!.id,
      OR: [{ id }, { referenceNo: id }],
    },
  }), 'USDT_ORDER_BY_ID_TIMEOUT');

  if (!order) {
    res.status(404).json(errorResponse(404, 'USDT order not found'));
    return;
  }

  res.json(successResponse(order));
}));

// Admin: Get Settings
adminUsdtRoutes.get('/settings', authenticateAdmin, guardRoute<AuthRequest>({
  errorCode: 500,
  errorMessage: 'Failed to fetch USDT settings',
  busyCode: 505,
  busyMessage: 'USDT admin settings busy. Please retry',
  eventType: 'USDT_ADMIN_SETTINGS',
}, async (_req: AuthRequest, res: Response) => {
  const settings = await withRouteTimeout(getSystemSettings(), 'USDT_ADMIN_SETTINGS_TIMEOUT');
  res.json(successResponse({
    usdtInInr: settings.usdtInInr,
    usdtBonus: settings.usdtBonus,
    usdtWalletAddress: settings.usdtWalletAddress,
  }));
}));

// Admin: Update Settings
adminUsdtRoutes.post('/settings', authenticateAdmin, guardRoute<AuthRequest>({
  errorCode: 500,
  errorMessage: 'Failed to update USDT settings',
  busyCode: 506,
  busyMessage: 'USDT settings update busy. Please retry',
  eventType: 'USDT_ADMIN_SETTINGS_UPDATE',
}, async (req: AuthRequest, res: Response) => {
  const { usdtInInr, usdtBonus, usdtWalletAddress } = req.body;
  const updated = await withRouteTimeout(updateSystemSettings({
    usdtInInr, usdtBonus, usdtWalletAddress,
  }), 'USDT_ADMIN_SETTINGS_UPDATE_TIMEOUT');
  res.json(successResponse(updated));
}));

// Admin: Get Orders
adminUsdtRoutes.get('/orders', authenticateAdmin, guardRoute<AuthRequest>({
  errorCode: 500,
  errorMessage: 'Failed to fetch orders',
  busyCode: 507,
  busyMessage: 'USDT order listing busy. Please retry',
  eventType: 'USDT_ADMIN_LIST',
}, async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const whereClause = status ? { status: String(status) } : {};

  const orders = await withRouteTimeout(prisma.uSDTOrder.findMany({
    where: whereClause,
    include: { user: { select: { phone: true, userName: true } } },
    orderBy: { createdAt: 'desc' },
  }), 'USDT_ADMIN_LIST_TIMEOUT');
  res.json(successResponse(orders));
}));

// Admin: Approve
adminUsdtRoutes.post('/orders/:id/approve', authenticateAdmin, guardRoute<AuthRequest>({
  errorCode: 500,
  errorMessage: 'Failed to approve order',
  busyCode: 508,
  busyMessage: 'USDT approval service busy. Please retry',
  eventType: 'USDT_ADMIN_APPROVE',
}, async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);

  try {
    const result = await withRouteTimeout(prisma.$transaction(async (tx) => {
      const order = await tx.uSDTOrder.findUnique({ where: { id } });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status !== 'PENDING') throw new Error('ORDER_ALREADY_PROCESSED');

      const updatedOrder = await tx.uSDTOrder.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      await tx.user.update({
        where: { id: order.userId },
        data: {
          availableBalance: { increment: order.totalReceive },
          totalUSDTTraded: { increment: order.amount },
          totalPayment: { increment: order.totalReceive },
        },
      });

      await tx.transaction.create({
        data: {
          userId: order.userId,
          amount: order.totalReceive,
          type: 'DEPOSIT_USDT',
          description: `USDT Deposit Approved: ${order.amount} USDT`,
          refId: order.id,
        },
      });

      return updatedOrder;
    }), 'USDT_ADMIN_APPROVE_TIMEOUT');

    res.json(successResponse(result, 'Order approved successfully'));
  } catch (error: any) {
    const reason = String(error?.message || '');
    if (reason === 'ORDER_NOT_FOUND') {
      res.status(400).json(errorResponse(400, 'Order not found'));
      return;
    }
    if (reason === 'ORDER_ALREADY_PROCESSED') {
      res.status(400).json(errorResponse(400, 'Order already processed'));
      return;
    }
    throw error;
  }
}));

// Admin: Reject
adminUsdtRoutes.post('/orders/:id/reject', authenticateAdmin, guardRoute<AuthRequest>({
  errorCode: 500,
  errorMessage: 'Failed to reject order',
  busyCode: 509,
  busyMessage: 'USDT rejection service busy. Please retry',
  eventType: 'USDT_ADMIN_REJECT',
}, async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  const { rejectReason } = req.body;

  try {
    const result = await withRouteTimeout(prisma.$transaction(async (tx) => {
      const order = await tx.uSDTOrder.findUnique({ where: { id } });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status !== 'PENDING') throw new Error('ORDER_ALREADY_PROCESSED');

      const updatedOrder = await tx.uSDTOrder.update({
        where: { id },
        data: { status: 'REJECTED', rejectReason: rejectReason || null },
      });

      return updatedOrder;
    }), 'USDT_ADMIN_REJECT_TIMEOUT');

    res.json(successResponse(result, 'Order rejected'));
  } catch (error: any) {
    const reason = String(error?.message || '');
    if (reason === 'ORDER_NOT_FOUND') {
      res.status(400).json(errorResponse(400, 'Order not found'));
      return;
    }
    if (reason === 'ORDER_ALREADY_PROCESSED') {
      res.status(400).json(errorResponse(400, 'Order already processed'));
      return;
    }
    throw error;
  }
}));


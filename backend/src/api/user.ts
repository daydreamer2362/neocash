import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { successResponse, errorResponse, buildInviteUrl } from '../utils/helpers';
import { ensurePublicUserId } from '../utils/publicUserId';
import { guardRoute, withRouteTimeout } from '../utils/routeGuard';

const router = Router();
const SELL_START_KEY_PREFIX = 'SELL_START_TS_';
const sellStartKey = (userId: string) => `${SELL_START_KEY_PREFIX}${userId}`;

// ─── GET /app/user/info/person ──────────────────────
router.get('/person', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    const user = await withRouteTimeout(prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { _count: { select: { invitees: true, orders: true } } },
    }), 'USER_PERSON_TIMEOUT');
    if (!user) { res.status(404).json(errorResponse(1008, 'User not found')); return; }

    const publicUserId = await ensurePublicUserId(user.id);

    res.json(successResponse({
      userId: publicUserId,
      userName: user.userName,
      username: user.userName,
      phone: user.phone,
      availableBalance: user.availableBalance,
      total_amount_inr: user.availableBalance,
      withdrawalBalance: user.withdrawalBalance,
      cashbackAmount: user.withdrawalBalance,
      cashback_amount: user.withdrawalBalance,
      withdrawAmount: user.withdrawalBalance,
      totalReward: user.totalReward,
      totalPayment: user.totalPayment,
      totalReceive: user.totalReceive,
      integralScore: user.integralScore,
      rechargeAmount: user.totalPayment,
      depositAmount: user.totalPayment,
      depositPrincipal: user.totalPayment,
      hasPin: Boolean(user.pin),
      isSell: user.isSell,
      referralCode: user.referralCode,
      inviteCode: user.referralCode,
      inviteUrl: buildInviteUrl(user.referralCode, requestOrigin),
      teamCount: user._count.invitees,
      orderCount: user._count.orders,
      totalUSDTTraded: user.totalUSDTTraded,
      welcomeBonusClaimed: user.welcomeBonusClaimed,
      role: user.role,
    }));
  } catch (error) {
    res.status(500).json(errorResponse(1009, 'Failed to fetch profile'));
  }
});

// ─── GET /app/user/info/personV2 ────────────────────
router.get('/personV2', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    const user = await withRouteTimeout(prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        _count: { select: { invitees: true, orders: true } },
        savedUpis: { where: { isDefault: true }, take: 1 },
      },
    }), 'USER_PERSON_V2_TIMEOUT');
    if (!user) { res.status(404).json(errorResponse(1008, 'User not found')); return; }

    const recentOrders = await withRouteTimeout(prisma.userOrder.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { order: true },
    }), 'USER_PERSON_V2_ORDERS_TIMEOUT');

    const publicUserId = await ensurePublicUserId(user.id);

    res.json(successResponse({
      userId: publicUserId,
      userName: user.userName,
      username: user.userName,           // alias for Home.vue
      phone: user.phone,
      availableBalance: user.availableBalance,
      total_amount_inr: user.availableBalance,  // alias for Home.vue balance card
      withdrawalBalance: user.withdrawalBalance,
      cashbackAmount: user.withdrawalBalance,   // alias for Home.vue withdrawal strip
      cashback_amount: user.withdrawalBalance,
      withdrawAmount: user.withdrawalBalance,
      totalReward: user.totalReward,
      integralScore: user.integralScore,
      rechargeAmount: user.totalPayment,       // principal only (excludes reward/profit)
      depositAmount: user.totalPayment,
      depositPrincipal: user.totalPayment,
      hasPin: Boolean(user.pin),
      isSell: user.isSell,
      referralCode: user.referralCode,
      inviteCode: user.referralCode,
      inviteUrl: buildInviteUrl(user.referralCode, requestOrigin),
      teamCount: user._count.invitees,
      hasUpi: user.savedUpis.length > 0,
      recentOrders: recentOrders.map(o => ({
        buyId: o.buyId,
        code: o.order.code,
        amount: o.amount,
        status: o.status,
        createdAt: o.createdAt,
      })),
      totalUSDTTraded: user.totalUSDTTraded,
    }));
  } catch (error) {
    res.status(500).json(errorResponse(1009, 'Failed to fetch profile'));
  }
});

// ─── POST /app/user/info/onSell/1 ───────────────────
router.post('/onSell/1', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 1028,
  errorMessage: 'Failed to enable selling',
  busyCode: 1029,
  busyMessage: 'Sell service busy. Please retry',
  eventType: 'USER_ON_SELL',
}, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const startedAt = new Date().toISOString();
  await withRouteTimeout(prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { isSell: true } }),
    prisma.setting.upsert({
      where: { key: sellStartKey(userId) },
      create: { key: sellStartKey(userId), value: startedAt },
      update: { value: startedAt },
    }),
  ]), 'USER_ON_SELL_TIMEOUT');
  res.json(successResponse(null, 'Selling enabled'));
}));
router.post('/onSell/', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 1028,
  errorMessage: 'Failed to enable selling',
  busyCode: 1029,
  busyMessage: 'Sell service busy. Please retry',
  eventType: 'USER_ON_SELL',
}, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const startedAt = new Date().toISOString();
  await withRouteTimeout(prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { isSell: true } }),
    prisma.setting.upsert({
      where: { key: sellStartKey(userId) },
      create: { key: sellStartKey(userId), value: startedAt },
      update: { value: startedAt },
    }),
  ]), 'USER_ON_SELL_TIMEOUT');
  res.json(successResponse(null, 'Selling enabled'));
}));

// ─── POST /app/user/info/offSell/1 ──────────────────
router.post('/offSell/1', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 1030,
  errorMessage: 'Failed to disable selling',
  busyCode: 1031,
  busyMessage: 'Sell service busy. Please retry',
  eventType: 'USER_OFF_SELL',
}, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  await withRouteTimeout(prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { isSell: false } }),
    prisma.setting.deleteMany({ where: { key: sellStartKey(userId) } }),
  ]), 'USER_OFF_SELL_TIMEOUT');
  res.json(successResponse(null, 'Selling disabled'));
}));
router.post('/offSell/', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 1030,
  errorMessage: 'Failed to disable selling',
  busyCode: 1031,
  busyMessage: 'Sell service busy. Please retry',
  eventType: 'USER_OFF_SELL',
}, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  await withRouteTimeout(prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { isSell: false } }),
    prisma.setting.deleteMany({ where: { key: sellStartKey(userId) } }),
  ]), 'USER_OFF_SELL_TIMEOUT');
  res.json(successResponse(null, 'Selling disabled'));
}));

// ─── POST /app/user/info/updatePassword ─────────────
router.post('/updatePassword', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await withRouteTimeout(prisma.user.findUnique({ where: { id: req.user!.id } }), 'USER_PASSWORD_FIND_TIMEOUT');
    if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
      res.status(400).json(errorResponse(1020, 'Current password incorrect'));
      return;
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await withRouteTimeout(prisma.user.update({ where: { id: user.id }, data: { password: hashed } }), 'USER_PASSWORD_UPDATE_TIMEOUT');
    res.json(successResponse(null, 'Password updated'));
  } catch (error) {
    res.status(500).json(errorResponse(1021, 'Password update failed'));
  }
});

// ─── POST /app/user/info/verifyPin ──────────────────
router.post('/verifyPin', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 1026,
  errorMessage: 'PIN verification failed',
  busyCode: 1027,
  busyMessage: 'PIN verification service busy. Please retry',
  eventType: 'USER_VERIFY_PIN',
}, async (req: AuthRequest, res: Response) => {
  const { pin } = req.body;
  const user = await withRouteTimeout(prisma.user.findUnique({ where: { id: req.user!.id } }), 'USER_VERIFY_PIN_TIMEOUT');
  if (!user || !user.pin) {
    res.status(400).json(errorResponse(1022, 'PIN not set'));
    return;
  }
  const match = await bcrypt.compare(String(pin), user.pin);
  res.json(successResponse({ verified: match }));
}));

// ─── POST /app/user/info/updatePin ──────────────────
router.post('/updatePin', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 1023,
  errorMessage: 'PIN update failed',
  busyCode: 1032,
  busyMessage: 'PIN update service busy. Please retry',
  eventType: 'USER_UPDATE_PIN',
}, async (req: AuthRequest, res: Response) => {
  const { pin } = req.body;
  if (!pin || String(pin).length !== 6) {
    res.status(400).json(errorResponse(1023, 'PIN must be 6 digits'));
    return;
  }
  const hashed = await bcrypt.hash(String(pin), 10);
  await withRouteTimeout(prisma.user.update({ where: { id: req.user!.id }, data: { pin: hashed } }), 'USER_UPDATE_PIN_TIMEOUT');
  res.json(successResponse(null, 'PIN updated'));
}));

// ─── GET /app/user/info/getInviterUrl ───────────────
router.get('/getInviterUrl', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 1033,
  errorMessage: 'Failed to fetch invite URL',
  busyCode: 1034,
  busyMessage: 'Invite URL service busy. Please retry',
  eventType: 'USER_INVITE_URL',
}, async (req: AuthRequest, res: Response) => {
  const user = await withRouteTimeout(prisma.user.findUnique({ where: { id: req.user!.id } }), 'USER_INVITE_URL_TIMEOUT');
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  res.json(successResponse({
    url: buildInviteUrl(user?.referralCode, requestOrigin),
    referralCode: user?.referralCode,
    inviteCode: user?.referralCode,
    inviteUrl: buildInviteUrl(user?.referralCode, requestOrigin),
  }));
}));

// ─── POST /app/user/info/checkSendOtp ───────────────
router.post('/checkSendOtp', authenticateToken, async (req: AuthRequest, res: Response) => {
  console.log(`[OTP] Verification OTP sent to user ${req.user!.id}`);
  res.json(successResponse(null, 'OTP sent'));
});

// ─── POST /app/user/info/appLogout ──────────────────
router.post('/appLogout', authenticateToken, async (req: AuthRequest, res: Response) => {
  // Stateless JWT — just acknowledge logout
  res.json(successResponse(null, 'Logged out'));
});

// ─── POST /app/user/update ──────────────────────────
router.post('/update', authenticateToken, async (req: AuthRequest, res: Response) => {
  // Not under /info, but user-scoped
  res.json(successResponse(null, 'Profile updated'));
});

// ─── GET /app/user/token/page ───────────────────────
router.get('/token/page', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 1035,
  errorMessage: 'Failed to fetch transactions',
  busyCode: 1036,
  busyMessage: 'Transaction service busy. Please retry',
  eventType: 'USER_TOKEN_PAGE',
}, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const records = await withRouteTimeout(prisma.transaction.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * size,
    take: size,
  }), 'USER_TOKEN_LIST_TIMEOUT');
  const total = await withRouteTimeout(prisma.transaction.count({ where: { userId: req.user!.id } }), 'USER_TOKEN_COUNT_TIMEOUT');
  res.json(successResponse({ records, total, page, size }));
}));

// ─── GET /app/user/info/notice/list ─────────────────
router.get('/notice/list', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 1037,
  errorMessage: 'Failed to fetch notices',
  busyCode: 1038,
  busyMessage: 'Notice service busy. Please retry',
  eventType: 'USER_NOTICE_LIST',
}, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const records = await withRouteTimeout(prisma.userNotification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * size,
    take: size,
  }), 'USER_NOTICE_LIST_TIMEOUT');
  const total = await withRouteTimeout(prisma.userNotification.count({ where: { userId: req.user!.id } }), 'USER_NOTICE_COUNT_TIMEOUT');
  res.json(successResponse({ records, total, page, size }));
}));

// ─── POST /app/user/info/notice/read ────────────────
router.post('/notice/read', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 1039,
  errorMessage: 'Failed to mark notice as read',
  busyCode: 1040,
  busyMessage: 'Notice service busy. Please retry',
  eventType: 'USER_NOTICE_READ',
}, async (req: AuthRequest, res: Response) => {
  const { id } = req.body;
  if (!id) {
    res.status(400).json(errorResponse(1024, 'Notification id required'));
    return;
  }
  const updated = await withRouteTimeout(prisma.userNotification.updateMany({
    where: { id: String(id), userId: req.user!.id },
    data: { isRead: true, readAt: new Date() },
  }), 'USER_NOTICE_READ_TIMEOUT');
  if (!updated.count) {
    res.status(404).json(errorResponse(1025, 'Notification not found'));
    return;
  }
  res.json(successResponse(null, 'Notification marked as read'));
}));

// ─── GET /app/user/active/activeInfo ────────────────
router.get('/active/activeInfo', authenticateToken, async (req: AuthRequest, res: Response) => {
  res.json(successResponse({ isActive: true, message: 'Account is active' }));
});

export default router;

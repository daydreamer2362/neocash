import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { successResponse, buildInviteUrl } from '../utils/helpers';
import { getReferralRates } from '../utils/referralSettings';
import { getPublicUserIdMap } from '../utils/publicUserId';

const router = Router();

const startOfDay = (base = new Date()) => new Date(base.getFullYear(), base.getMonth(), base.getDate());

const mapMember = (m: any) => {
  const publicUserId = String(m.userId || '').trim();
  return {
    id: m.id,
    userId: publicUserId || m.id,
    userName: m.userName,
    phone: m.phone,
    createTime: m.createdAt,
    createdAt: m.createdAt,
    deposit: Number(m.totalPayment || 0),
    rechargeAmount: Number(m.totalPayment || 0),
    totalPayment: Number(m.totalPayment || 0),
  };
};

const getDirectMemberIds = async (userId: string) => {
  const directMembers = await prisma.user.findMany({
    where: { inviterId: userId },
    select: { id: true },
  });
  return directMembers.map((m) => m.id);
};

// ─── GET /app/user/team/details ─────────────────────
router.get('/details', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  const todayStart = startOfDay();
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const [user, directIds, directAgg, todaySize1, yestordaySize1, totalCommissionAgg, levelBAgg, levelCAgg, todayCommissionAgg, yesterdayCommissionAgg, rates] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    }),
    getDirectMemberIds(userId),
    prisma.user.aggregate({
      where: { inviterId: userId },
      _count: { id: true },
      _sum: { totalPayment: true },
    }),
    prisma.user.count({
      where: { inviterId: userId, createdAt: { gte: todayStart } },
    }),
    prisma.user.count({
      where: { inviterId: userId, createdAt: { gte: yesterdayStart, lt: todayStart } },
    }),
    prisma.commission.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.commission.aggregate({ where: { userId, level: 'B' }, _sum: { amount: true } }),
    prisma.commission.aggregate({ where: { userId, level: 'C' }, _sum: { amount: true } }),
    prisma.commission.aggregate({ where: { userId, createdAt: { gte: todayStart } }, _sum: { amount: true } }),
    prisma.commission.aggregate({ where: { userId, createdAt: { gte: yesterdayStart, lt: todayStart } }, _sum: { amount: true } }),
    getReferralRates(),
  ]);

  const directCount = Number((directAgg as any)?._count?.id || 0);
  const level1Deposit = Number((directAgg as any)?._sum?.totalPayment || 0);

  const [secondAgg, todaySize2, yestordaySize2] = directIds.length
    ? await Promise.all([
      prisma.user.aggregate({
        where: { inviterId: { in: directIds } },
        _count: { id: true },
        _sum: { totalPayment: true },
      }),
      prisma.user.count({
        where: { inviterId: { in: directIds }, createdAt: { gte: todayStart } },
      }),
      prisma.user.count({
        where: { inviterId: { in: directIds }, createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
    ])
    : [{ _count: { id: 0 }, _sum: { totalPayment: 0 } }, 0, 0];

  const level2Size = Number((secondAgg as any)?._count?.id || 0);
  const level2Deposit = Number((secondAgg as any)?._sum?.totalPayment || 0);

  const secondLevelUserFilter = directIds.length
    ? { inviterId: { in: directIds } }
    : { inviterId: { in: ['__none__'] } };
  const [todayLevelBAgg, todayLevelCAgg, yesterdayLevelBAgg, yesterdayLevelCAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { user: { inviterId: userId }, type: 'PURCHASE', createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { user: secondLevelUserFilter, type: 'PURCHASE', createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { user: { inviterId: userId }, type: 'PURCHASE', createdAt: { gte: yesterdayStart, lt: todayStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { user: secondLevelUserFilter, type: 'PURCHASE', createdAt: { gte: yesterdayStart, lt: todayStart } },
      _sum: { amount: true },
    }),
  ]);

  const todayLevelBRecharge = Number(todayLevelBAgg._sum.amount || 0);
  const todayLevelCRecharge = Number(todayLevelCAgg._sum.amount || 0);
  const yesterdayLevelBRecharge = Number(yesterdayLevelBAgg._sum.amount || 0);
  const yesterdayLevelCRecharge = Number(yesterdayLevelCAgg._sum.amount || 0);

  const levelBCommissionRaw = Number(levelBAgg._sum.amount || 0);
  const levelCCommissionRaw = Number(levelCAgg._sum.amount || 0);
  const totalCommissionRaw = Number(totalCommissionAgg._sum.amount || 0);
  const todayCommissionRaw = Number(todayCommissionAgg._sum.amount || 0);
  const yesterdayCommissionRaw = Number(yesterdayCommissionAgg._sum.amount || 0);

  const levelBCommissionFallback = level1Deposit * Number(rates.levelBRate || 0);
  const levelCCommissionFallback = level2Deposit * Number(rates.levelCRate || 0);
  const todayCommissionFallback =
    todayLevelBRecharge * Number(rates.levelBRate || 0) +
    todayLevelCRecharge * Number(rates.levelCRate || 0);
  const yesterdayCommissionFallback =
    yesterdayLevelBRecharge * Number(rates.levelBRate || 0) +
    yesterdayLevelCRecharge * Number(rates.levelCRate || 0);

  const levelBCommission = Math.max(levelBCommissionRaw, levelBCommissionFallback);
  const levelCCommission = Math.max(levelCCommissionRaw, levelCCommissionFallback);
  const totalCommission = Math.max(totalCommissionRaw, levelBCommission + levelCCommission);
  const todayCommission = todayCommissionRaw > 0 ? todayCommissionRaw : todayCommissionFallback;
  const yesterdayCommission = yesterdayCommissionRaw > 0 ? yesterdayCommissionRaw : yesterdayCommissionFallback;

  res.json(successResponse({
    referralCode: user?.referralCode || req.user!.phone,
    inviteCode: user?.referralCode || req.user!.phone,
    inviteUrl: buildInviteUrl(user?.referralCode || req.user!.phone, requestOrigin),

    directInvites: directCount,
    size: directCount + level2Size,

    totalCommission: Number(totalCommission.toFixed(2)),
    todayCommission: Number(todayCommission.toFixed(2)),
    yesterdayCommission: Number(yesterdayCommission.toFixed(2)),
    totalTeamDeposit: level1Deposit + level2Deposit,

    levelBCommission: Number(levelBCommission.toFixed(2)),
    levelCCommission: Number(levelCCommission.toFixed(2)),
    level1Commission: Number(levelBCommission.toFixed(2)),
    level2Commission: Number(levelCCommission.toFixed(2)),

    level1Size: directCount,
    level2Size,
    todaySize1,
    yesterdaySize1: yestordaySize1,
    todaySize2,
    yesterdaySize2: yestordaySize2,

    level1Deposit,
    level2Deposit,
    todayRecharge: todayLevelBRecharge + todayLevelCRecharge,
    levelBRate: rates.levelBRate,
    levelCRate: rates.levelCRate,
    levelBRatePercent: rates.levelBPercent,
    levelCRatePercent: rates.levelCPercent,
  }));
});

// ─── GET /app/user/team/members ─────────────────────
router.get('/members', authenticateToken, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;

  const [members, total] = await Promise.all([
    prisma.user.findMany({
      where: { inviterId: req.user!.id },
      select: { id: true, userName: true, phone: true, createdAt: true, totalPayment: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.user.count({ where: { inviterId: req.user!.id } }),
  ]);

  const publicUserIdMap = await getPublicUserIdMap(members.map((m) => m.id));
  const records = members.map((m) => mapMember({ ...m, userId: publicUserIdMap.get(m.id) || m.id }));
  res.json(successResponse({ records, total, page, size }));
});

// ─── GET /app/user/team/subMembers ──────────────────
router.get('/subMembers', authenticateToken, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const size = Number(req.query.size) || 20;
  const level = Number(req.query.level || 2);

  const directIds = (await prisma.user.findMany({
    where: { inviterId: req.user!.id },
    select: { id: true },
  })).map((d) => d.id);

  if (level === 1) {
    const [members, total] = await Promise.all([
      prisma.user.findMany({
        where: { inviterId: req.user!.id },
        select: { id: true, userName: true, phone: true, createdAt: true, totalPayment: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.user.count({ where: { inviterId: req.user!.id } }),
    ]);
    const publicUserIdMap = await getPublicUserIdMap(members.map((m) => m.id));
    const records = members.map((m) => mapMember({ ...m, userId: publicUserIdMap.get(m.id) || m.id }));
    res.json(successResponse({ records, total, page, size }));
    return;
  }

  const where = directIds.length ? { inviterId: { in: directIds } } : { inviterId: { in: ['__none__'] } };
  const [subMembers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, userName: true, phone: true, createdAt: true, totalPayment: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.user.count({ where }),
  ]);

  const publicUserIdMap = await getPublicUserIdMap(subMembers.map((m) => m.id));
  const records = subMembers.map((m) => mapMember({ ...m, userId: publicUserIdMap.get(m.id) || m.id }));
  res.json(successResponse({ records, total, page, size }));
});

// ─── GET /app/user/team/invites ─────────────────────
router.get('/invites', authenticateToken, async (req: AuthRequest, res: Response) => {
  const invites = await prisma.user.findMany({
    where: { inviterId: req.user!.id },
    select: { id: true, userName: true, phone: true, createdAt: true, totalPayment: true, availableBalance: true },
    orderBy: { createdAt: 'desc' },
  });
  const publicUserIdMap = await getPublicUserIdMap(invites.map((m) => m.id));
  const records = invites.map((m) => mapMember({ ...m, userId: publicUserIdMap.get(m.id) || m.id }));
  res.json(successResponse(records));
});

// ─── POST /app/user/team/invites ────────────────────
router.post('/invites', authenticateToken, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { referralCode: true } });
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  res.json(successResponse({
    inviteCode: user?.referralCode,
    inviteUrl: buildInviteUrl(user?.referralCode, requestOrigin),
  }));
});

// ─── POST /app/user/team/invites/delete ─────────────
router.post('/invites/delete', authenticateToken, async (_req: AuthRequest, res: Response) => {
  // Not a real delete — just acknowledge
  res.json(successResponse(null, 'Invite removed'));
});

// ─── GET /app/user/team/getTeamTurnoverBars ─────────
router.get('/getTeamTurnoverBars', authenticateToken, async (req: AuthRequest, res: Response) => {
  const directIds = await getDirectMemberIds(req.user!.id);
  const secondIds = directIds.length
    ? (await prisma.user.findMany({
      where: { inviterId: { in: directIds } },
      select: { id: true },
    })).map((m) => m.id)
    : [];
  const allIds = [req.user!.id, ...directIds, ...secondIds];

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const txns = await prisma.transaction.findMany({
    where: { userId: { in: allIds }, type: 'PURCHASE', createdAt: { gte: sevenDaysAgo } },
    select: { amount: true, createdAt: true, userId: true },
  });

  res.json(successResponse({ bars: txns }));
});

// ─── GET /app/user/team/members/ratio ───────────────
router.get('/members/ratio', authenticateToken, async (req: AuthRequest, res: Response) => {
  const total = await prisma.user.count({ where: { inviterId: req.user!.id } });
  const active = await prisma.user.count({ where: { inviterId: req.user!.id, isSell: true } });
  res.json(successResponse({ total, active, ratio: total > 0 ? (active / total * 100).toFixed(1) : '0' }));
});

export default router;

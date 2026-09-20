import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { successResponse } from '../utils/helpers';
import { guardRoute, withRouteTimeout } from '../utils/routeGuard';

const router = Router();

// Task progress must count only payment-verified orders.
const COMPLETED_ORDER_STATUSES = ['COMPLETED', 'SUCCESS'];
const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const resolveProgressFromType = (
  mission: any,
  stats: {
    inviteCount: number;
    totalOrderCount: number;
    todayOrderCount: number;
    totalOrderAmount: number;
    todayOrderAmount: number;
  },
) => {
  const taskType = String(mission.taskType || '').toLowerCase();
  const type = String(mission.type || '').toUpperCase();
  const target = Number(mission.targetValue || 0);
  const isDaily = taskType === 'daily_tasks' || type.includes('DAILY');

  if (type.includes('INVITE') || taskType === 'invite_tasks' || taskType === 'team_growth') {
    return stats.inviteCount;
  }

  if (type.includes('LOGIN')) {
    return 1;
  }

  if (type.includes('FIRST_ORDER')) {
    return isDaily ? stats.todayOrderCount : stats.totalOrderCount;
  }

  if (type.includes('COUNT') || type.includes('ORDER')) {
    return isDaily ? stats.todayOrderCount : stats.totalOrderCount;
  }

  if (type.includes('AMOUNT') || type.includes('TURNOVER') || type.includes('TRADE') || type.includes('PURCHASE')) {
    return isDaily ? stats.todayOrderAmount : stats.totalOrderAmount;
  }

  if (type.includes('VOLUME')) {
    // Backward compatibility: old tasks used VOLUME for count, admin may use it for amount.
    if (target >= 1000) return isDaily ? stats.todayOrderAmount : stats.totalOrderAmount;
    return isDaily ? stats.todayOrderCount : stats.totalOrderCount;
  }

  if (target <= 1) return isDaily ? stats.todayOrderCount : stats.totalOrderCount;
  if (target >= 1000) return isDaily ? stats.todayOrderAmount : stats.totalOrderAmount;
  return isDaily ? stats.todayOrderCount : stats.totalOrderCount;
};

const buildMissionDto = (mission: any, claimedMissionIds: Set<string>, progressValue: number) => {
  const targetValue = Number(mission.targetValue || 0);
  const rewardValue = Number(mission.rewardValue || 0);
  const totalNum = targetValue > 0 ? targetValue : 1;
  const currentNum = Math.max(0, progressValue);
  const completed = currentNum >= totalNum;
  const claimed = claimedMissionIds.has(mission.id);
  const claimable = completed && !claimed;
  const status = claimed ? 2 : (claimable ? 1 : 0);

  return {
    ...mission,
    name: mission.title,
    content: mission.description,
    commission: rewardValue,
    reward: rewardValue,
    currentNum,
    totalNum,
    progress: totalNum > 0 ? Math.min(100, (currentNum / totalNum) * 100) : 0,
    completed,
    claimed,
    claimable,
    status,
  };
};

const getMissionStats = async (userId: string) => {
  const todayStart = startOfToday();
  const [inviteCount, totalOrderCount, todayOrderCount, totalOrderAmount, todayOrderAmount] = await withRouteTimeout(Promise.all([
    prisma.user.count({ where: { inviterId: userId } }),
    prisma.userOrder.count({
      where: { userId, status: { in: COMPLETED_ORDER_STATUSES } },
    }),
    prisma.userOrder.count({
      where: { userId, status: { in: COMPLETED_ORDER_STATUSES }, createdAt: { gte: todayStart } },
    }),
    prisma.userOrder.aggregate({
      where: { userId, status: { in: COMPLETED_ORDER_STATUSES } },
      _sum: { amount: true },
    }),
    prisma.userOrder.aggregate({
      where: { userId, status: { in: COMPLETED_ORDER_STATUSES }, createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
  ]), 'MISSION_STATS_TIMEOUT');

  return {
    inviteCount,
    totalOrderCount,
    todayOrderCount,
    totalOrderAmount: Number(totalOrderAmount._sum.amount || 0),
    todayOrderAmount: Number(todayOrderAmount._sum.amount || 0),
  };
};

// ─── GET /app/mission/task ──────────────────────────
router.get('/task', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 4101,
  errorMessage: 'Failed to fetch tasks',
  busyCode: 4102,
  busyMessage: 'Task service busy. Please retry',
  eventType: 'MISSION_TASK',
}, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const [missions, claims, stats] = await withRouteTimeout(Promise.all([
    prisma.mission.findMany({
      where: { isActive: true },
      orderBy: [{ taskType: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.missionClaim.findMany({
      where: { userId },
      select: { missionId: true },
    }),
    getMissionStats(userId),
  ]), 'MISSION_TASK_LIST_TIMEOUT');

  const claimedMissionIds = new Set<string>(claims.map((item) => String(item.missionId)));
  const data = missions.map((mission) => {
    const progress = resolveProgressFromType(mission, stats);
    return buildMissionDto(mission, claimedMissionIds, progress);
  });

  res.json(successResponse(data));
}));

// ─── POST /app/mission/task/receive/:id ─────────────
router.post('/task/receive/:id', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 4103,
  errorMessage: 'Failed to claim task reward',
  busyCode: 4104,
  busyMessage: 'Reward service busy. Please retry',
  eventType: 'MISSION_RECEIVE',
}, async (req: AuthRequest, res: Response) => {
  const missionId = String(req.params.id);
  const userId = req.user!.id;

  // Check if already claimed
  const existing = await withRouteTimeout(prisma.missionClaim.findUnique({
    where: { userId_missionId: { userId, missionId } },
  }), 'MISSION_RECEIVE_EXISTS_TIMEOUT');
  if (existing) {
    res.status(400).json({ code: 4001, msg: 'Already claimed' });
    return;
  }

  const mission = await withRouteTimeout(prisma.mission.findUnique({ where: { id: String(missionId) } }), 'MISSION_RECEIVE_FIND_TIMEOUT');
  if (!mission || !mission.isActive) {
    res.status(404).json({ code: 4002, msg: 'Mission not found' });
    return;
  }

  const stats = await getMissionStats(userId);
  const progress = resolveProgressFromType(mission, stats);
  const normalized = buildMissionDto(mission, new Set(), progress);

  if (!normalized.claimable) {
    res.status(400).json({ code: 4003, msg: 'Task target not completed yet' });
    return;
  }

  await withRouteTimeout(prisma.$transaction([
    prisma.missionClaim.create({ data: { userId, missionId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        availableBalance: { increment: mission.rewardValue },
        totalReward: { increment: mission.rewardValue },
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        amount: mission.rewardValue,
        type: 'REWARD',
        description: `Task reward: ${mission.title}`,
      },
    }),
    prisma.userNotification.create({
      data: {
        userId,
        title: 'Task Reward Credited',
        body: `Task "${mission.title}" completed. ₹${Number(mission.rewardValue)} credited to available balance.`,
        type: 'REWARD',
      },
    }),
  ]), 'MISSION_RECEIVE_TX_TIMEOUT');

  res.json(successResponse({ reward: mission.rewardValue }, 'Reward claimed'));
}));

export default router;

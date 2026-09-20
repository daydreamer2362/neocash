import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { successResponse, errorResponse, buildInviteUrl } from '../utils/helpers';
import { guardRoute, withRouteTimeout } from '../utils/routeGuard';
const router = Router();

const formatWallet = (wallet: any) => ({
  id: wallet.id,
  walletId: wallet.id,
  upiId: wallet.upiId,
  upi: wallet.upiId,
  account: wallet.upiId,
  holderName: wallet.holderName,
  bankName: wallet.bankName,
  ifsc: wallet.ifsc,
  provider: wallet.bankName || 'UPI',
  walletTypeName: wallet.bankName || 'UPI',
  isDefault: wallet.isDefault,
  isVerified: wallet.isVerified,
  status: wallet.isDefault ? 1 : 0,
  createdAt: wallet.createdAt,
});

const listWallets = async (req: AuthRequest, res: Response, verifiedOnly = false) => {
  const upis = await withRouteTimeout(prisma.savedUPI.findMany({
    where: { userId: req.user!.id, ...(verifiedOnly ? { isVerified: true } : {}) },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  }), 'WALLET_LIST_TIMEOUT');
  res.json(successResponse(upis.map(formatWallet)));
};

const createWallet = async (req: AuthRequest, res: Response) => {
  const upiId = String(req.body.upiId || req.body.account || '').trim();
  const holderName = String(req.body.holderName || req.body.accountName || req.user?.phone || '').trim();
  const bankName = String(req.body.bankName || req.body.ctName?.name || req.body.ctName || '').trim() || null;
  const ifsc = String(req.body.ifsc || '').trim() || null;

  if (!upiId || !holderName) {
    res.status(400).json(errorResponse(3001, 'UPI ID and holder name required'));
    return;
  }

  const count = await withRouteTimeout(prisma.savedUPI.count({ where: { userId: req.user!.id } }), 'WALLET_COUNT_TIMEOUT');
  if (count >= 5) {
    res.status(400).json(errorResponse(3002, 'Maximum 5 payout accounts allowed'));
    return;
  }

  const exists = await withRouteTimeout(prisma.savedUPI.findFirst({
    where: { userId: req.user!.id, upiId },
  }), 'WALLET_EXISTS_TIMEOUT');
  if (exists) {
    res.status(400).json(errorResponse(3004, 'This payout account is already added'));
    return;
  }

  const isFirst = count === 0;
  const upi = await withRouteTimeout(prisma.savedUPI.create({
    data: {
      userId: req.user!.id,
      upiId,
      holderName,
      bankName,
      ifsc,
      isDefault: isFirst,
      isVerified: true,
    },
  }), 'WALLET_CREATE_TIMEOUT');

  res.json(successResponse(formatWallet(upi), 'Payout account added successfully'));
};

router.get('/getWalletList', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3006,
  errorMessage: 'Failed to fetch payout accounts',
  busyCode: 3007,
  busyMessage: 'Payout service busy. Please retry',
  eventType: 'WALLET_LIST',
}, async (req: AuthRequest, res: Response) => {
  await listWallets(req, res, false);
}));

router.post('/getWalletList', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3006,
  errorMessage: 'Failed to fetch payout accounts',
  busyCode: 3007,
  busyMessage: 'Payout service busy. Please retry',
  eventType: 'WALLET_LIST',
}, async (req: AuthRequest, res: Response) => {
  await listWallets(req, res, false);
}));

router.get('/getPayoutWalletList', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3006,
  errorMessage: 'Failed to fetch payout accounts',
  busyCode: 3007,
  busyMessage: 'Payout service busy. Please retry',
  eventType: 'WALLET_LIST',
}, async (req: AuthRequest, res: Response) => {
  await listWallets(req, res, true);
}));

router.post('/getPayoutWalletList', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3006,
  errorMessage: 'Failed to fetch payout accounts',
  busyCode: 3007,
  busyMessage: 'Payout service busy. Please retry',
  eventType: 'WALLET_LIST',
}, async (req: AuthRequest, res: Response) => {
  await listWallets(req, res, true);
}));

router.post('/submit', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3003,
  errorMessage: 'Failed to add payout account',
  busyCode: 3008,
  busyMessage: 'Payout submit service busy. Please retry',
  eventType: 'WALLET_SUBMIT',
}, async (req: AuthRequest, res: Response) => {
  await createWallet(req, res);
}));

router.post('/v2/submit', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3003,
  errorMessage: 'Failed to add payout account',
  busyCode: 3008,
  busyMessage: 'Payout submit service busy. Please retry',
  eventType: 'WALLET_SUBMIT',
}, async (req: AuthRequest, res: Response) => {
  await createWallet(req, res);
}));

router.post('/changeStatus/:id', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3009,
  errorMessage: 'Failed to update default payout account',
  busyCode: 3010,
  busyMessage: 'Payout update service busy. Please retry',
  eventType: 'WALLET_CHANGE_STATUS',
}, async (req: AuthRequest, res: Response) => {
  const wallet = await withRouteTimeout(prisma.savedUPI.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
  }), 'WALLET_FIND_TIMEOUT');
  if (!wallet) {
    res.status(404).json(errorResponse(3005, 'Wallet not found'));
    return;
  }

  await withRouteTimeout(prisma.$transaction([
    prisma.savedUPI.updateMany({
      where: { userId: req.user!.id },
      data: { isDefault: false },
    }),
    prisma.savedUPI.update({
      where: { id: wallet.id },
      data: { isDefault: true },
    }),
  ]), 'WALLET_CHANGE_STATUS_TIMEOUT');

  res.json(successResponse(null, 'Default payout account updated'));
}));

router.post('/offSell/:id', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3011,
  errorMessage: 'Failed to remove payout account',
  busyCode: 3012,
  busyMessage: 'Payout remove service busy. Please retry',
  eventType: 'WALLET_DELETE',
}, async (req: AuthRequest, res: Response) => {
  const wallet = await withRouteTimeout(prisma.savedUPI.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
  }), 'WALLET_FIND_TIMEOUT');
  if (!wallet) {
    res.status(404).json(errorResponse(3005, 'Wallet not found'));
    return;
  }


  await withRouteTimeout(prisma.savedUPI.delete({ where: { id: wallet.id } }), 'WALLET_DELETE_TIMEOUT');
  res.json(successResponse(null, 'Payout account removed'));
}));

router.get('/available', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3013,
  errorMessage: 'Failed to fetch wallet balance',
  busyCode: 3014,
  busyMessage: 'Balance service busy. Please retry',
  eventType: 'WALLET_AVAILABLE',
}, async (req: AuthRequest, res: Response) => {
  const user = await withRouteTimeout(prisma.user.findUnique({ where: { id: req.user!.id } }), 'WALLET_AVAILABLE_TIMEOUT');
  res.json(successResponse({
    availableBalance: Number(user?.availableBalance || 0),
    withdrawalBalance: Number(user?.withdrawalBalance || 0),
  }));
}));

router.get('/allAvailable', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3013,
  errorMessage: 'Failed to fetch wallet balance',
  busyCode: 3014,
  busyMessage: 'Balance service busy. Please retry',
  eventType: 'WALLET_AVAILABLE',
}, async (req: AuthRequest, res: Response) => {
  const user = await withRouteTimeout(prisma.user.findUnique({ where: { id: req.user!.id } }), 'WALLET_AVAILABLE_TIMEOUT');
  res.json(successResponse({
    availableBalance: Number(user?.availableBalance || 0),
    withdrawalBalance: Number(user?.withdrawalBalance || 0),
    integralScore: Number(user?.integralScore || 0),
    totalReward: Number(user?.totalReward || 0),
  }));
}));

router.get('/link', authenticateToken, guardRoute<AuthRequest>({
  errorCode: 3015,
  errorMessage: 'Failed to fetch invite link',
  busyCode: 3016,
  busyMessage: 'Invite link service busy. Please retry',
  eventType: 'WALLET_LINK',
}, async (req: AuthRequest, res: Response) => {
  const user = await withRouteTimeout(prisma.user.findUnique({ where: { id: req.user!.id } }), 'WALLET_LINK_TIMEOUT');
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  res.json(successResponse({ url: buildInviteUrl(user?.referralCode, requestOrigin) }));
}));

router.get('/getKycList', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse([]));
});

router.get('/check', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse({ kycVerified: true }));
});

router.get('/one', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse(null));
});
router.get('/two', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse(null));
});
router.get('/three', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse(null));
});

export default router;

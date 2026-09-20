import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../utils/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { successResponse } from '../utils/helpers';
import { getSystemSettings } from '../utils/systemSettings';
import { recordSecurityEvent } from '../utils/securityMonitor';

const router = Router();
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const CLIENT_ERROR_DEDUPE_KEY = '__gp_client_error_dedupe__';
const CLIENT_ERROR_DEDUPE_MS = Math.max(5000, Number(process.env.CLIENT_ERROR_DEDUPE_MS || 20000));
const CLIENT_RUNTIME_NOISE_DEDUPE_MS = Math.max(CLIENT_ERROR_DEDUPE_MS, Number(process.env.CLIENT_RUNTIME_NOISE_DEDUPE_MS || 60000));

const shouldRecordClientError = (fingerprint: string, dedupeMs: number) => {
  const now = Date.now();
  const bag = ((globalThis as any)[CLIENT_ERROR_DEDUPE_KEY] || new Map<string, number>()) as Map<string, number>;
  (globalThis as any)[CLIENT_ERROR_DEDUPE_KEY] = bag;
  const last = Number(bag.get(fingerprint) || 0);
  if (now - last < dedupeMs) return false;
  bag.set(fingerprint, now);
  if (bag.size > 1200) {
    const floor = now - (Math.max(dedupeMs, CLIENT_ERROR_DEDUPE_MS) * 3);
    for (const [k, ts] of bag.entries()) {
      if (Number(ts || 0) < floor) bag.delete(k);
    }
  }
  return true;
};

const isGenericScriptError = (msg: string) => {
  const text = String(msg || '').trim().toLowerCase();
  return text === 'script error.' || text === 'script error' || text === 'window error';
};

const parseBase64Payload = (rawValue: unknown) => {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;

  const dataUrlMatch = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return { mimeType: dataUrlMatch[1], payload: dataUrlMatch[2] };
  }

  return { mimeType: 'image/jpeg', payload: raw };
};

const mimeToExt = (mimeType: string) => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[mimeType.toLowerCase()] || 'jpg';
};

const saveBase64Image = async (base64Like: unknown, req: Request) => {
  const parsed = parseBase64Payload(base64Like);
  if (!parsed) return null;

  const buffer = Buffer.from(parsed.payload, 'base64');
  if (!buffer.length) return null;

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = mimeToExt(parsed.mimeType);
  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const targetPath = path.join(UPLOAD_DIR, fileName);
  await fs.writeFile(targetPath, buffer);

  const url = `/uploads/${fileName}`;
  const fullUrl = `${req.protocol}://${req.get('host')}${url}`;
  return { url, fullUrl };
};

const STATUS_CODE_MAP: Record<string, number> = {
  PENDING: 1,
  SUBMITTED: 2,
  SUCCESS: 3,
  FAILED: 4,
  CANCELLED: 5,
  TIMEOUT: 6,
  COMPLETED: 7,
};

const toUserOrderDto = (userOrder: any) => {
  const code = userOrder.order?.code || userOrder.buyId;
  const statusCode = STATUS_CODE_MAP[userOrder.status] || 0;

  return {
    id: userOrder.buyId,
    entityId: userOrder.id,
    buyId: userOrder.buyId,
    orderNo: code,
    code,
    amount: Number(userOrder.amount || 0),
    reward: Number(userOrder.reward || 0),
    income: Number(userOrder.reward || 0),
    status: userOrder.status,
    statusCode,
    statusName: userOrder.status,
    voucherStatus: userOrder.voucherStatus,
    voucher: userOrder.voucher,
    utr: userOrder.utr,
    createdAt: userOrder.createdAt,
    createTime: userOrder.createdAt,
    updatedAt: userOrder.updatedAt,
    expiresAt: userOrder.expiresAt,
    expireTime: userOrder.expiresAt,
    soldAt: userOrder.soldAt,
    payoutWallet: userOrder.payoutWallet,
    payoutAccount: userOrder.payoutAccount,
    payoutUPI: userOrder.payoutUPI,
    payeeAccount: userOrder.order?.payeeAccount || null,
    payeeName: userOrder.order?.payeeName || null,
    ifsc: userOrder.order?.ifscCode || null,
    paymentType: userOrder.order?.paymentType || 'IMPS',
    referenceNo: userOrder.order?.referenceNo || null,
  };
};

router.get('/news/notice', async (_req: Request, res: Response) => {
  const notices = await prisma.notice.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const normalized = notices.map((notice: any) => ({
    ...notice,
    createTime: notice.createdAt,
    date: notice.createdAt,
  }));

  res.json(successResponse(normalized));
});

router.get('/app/version/info/getLatestAppVersion', async (_req: Request, res: Response) => {
  const settings = await getSystemSettings();
  res.json(successResponse({
    version: settings.appVersion,
    forceUpdate: settings.appForceUpdate,
    downloadUrl: settings.appDownloadUrl,
  }));
});

router.get('/app/official/service/getOfficialServiceData', async (_req: Request, res: Response) => {
  const settings = await getSystemSettings();
  const telegram = String(settings.supportTelegramUrl || '').trim() || '';
  res.json(successResponse({
    telegram,
    whatsapp: '',
    email: '',
  }));
});

router.get('/app/content/page', async (_req: Request, res: Response) => {
  res.json(successResponse({ content: 'Gamma Pay Terms & Privacy Policy content here.' }));
});

router.get('/base/param', async (req: Request, res: Response) => {
  const system = await getSystemSettings();
  const settings = await prisma.setting.findMany();
  const map: Record<string, string> = {};
  settings.forEach((setting: any) => {
    map[setting.key] = setting.value;
  });

  if (!map.MIN_PAYOUT_AMOUNT) map.MIN_PAYOUT_AMOUNT = '100';
  if (!map.MAX_PAYOUT_AMOUNT) map.MAX_PAYOUT_AMOUNT = '100000';
  if (!map.PAYOUT_FEE_RATE) map.PAYOUT_FEE_RATE = '0';
  if (!map.ORDER_INCOME_PERCENT) map.ORDER_INCOME_PERCENT = String(system.orderIncomePercent ?? 4);
  if (!map.commissionRate) map.commissionRate = map.ORDER_INCOME_PERCENT;
  if (!map.payoutFeeRate) map.payoutFeeRate = map.PAYOUT_FEE_RATE;
  if (!map.BUY_USDT_RATE) map.BUY_USDT_RATE = '103';
  if (!map.buyUsdtRate) map.buyUsdtRate = map.BUY_USDT_RATE;
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  const resolvedApiBaseUrl = String(
    map.API_BASE_URL
    || map.apiBaseUrl
    || system.apiBaseUrl
    || requestOrigin,
  ).trim().replace(/\/+$/, '');
  if (resolvedApiBaseUrl) {
    map.API_BASE_URL = resolvedApiBaseUrl;
    map.apiBaseUrl = resolvedApiBaseUrl;
  }

  res.json(successResponse(map));
});

router.post('/base/comm/upload', authenticateToken, async (req: AuthRequest, res: Response) => {
  const saved = await saveBase64Image(
    req.body?.base64 || req.body?.file || req.body?.dataUrl || req.body?.content,
    req,
  );

  if (!saved) {
    res.status(400).json({ code: 4001, msg: 'No image payload found. Use uploadBase64 with a base64 image.' });
    return;
  }

  res.json(successResponse(saved));
});

router.post('/base/comm/uploadBase64', authenticateToken, async (req: AuthRequest, res: Response) => {
  const saved = await saveBase64Image(
    req.body?.base64 || req.body?.file || req.body?.dataUrl || req.body,
    req,
  );

  if (!saved) {
    res.status(400).json({ code: 4002, msg: 'Invalid base64 image payload' });
    return;
  }

  res.json(successResponse(saved));
});

router.get('/base/comm/download', async (req: Request, res: Response) => {
  res.json(successResponse({ url: req.query.url }));
});

router.post('/captcha/new', async (_req: Request, res: Response) => {
  res.json(successResponse({ captchaId: 'mock-captcha-id', image: '' }));
});

router.post('/captcha/verify', async (_req: Request, res: Response) => {
  res.json(successResponse({ verified: true }));
});

router.get('/ct/type/listEnabledCtTypes', async (_req: Request, res: Response) => {
  res.json(successResponse([
    { id: 'upi-paytm', name: 'Paytm', ctName: 'Paytm', icon: 'paytm.png', enabled: true },
    { id: 'upi-mobikwik', name: 'Mobikwik', ctName: 'Mobikwik', icon: 'mobikwik.png', enabled: true },
    { id: 'upi-phonepe', name: 'PhonePe', ctName: 'PhonePe', icon: 'phonepe.png', enabled: true },
    { id: 'upi-freecharge', name: 'Freecharge', ctName: 'Freecharge', icon: 'freecharge.png', enabled: true },
    { id: 'upi-airtel', name: 'Airtel Payments Bank', ctName: 'Airtel Payments Bank', icon: 'airtel.png', enabled: true },
    { id: 'upi-jio', name: 'Jio Payments Bank', ctName: 'Jio Payments Bank', icon: 'box.png', enabled: true },
  ]));
});

router.get('/ct/type/configCheck', async (_req: Request, res: Response) => {
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['MIN_PAYOUT_AMOUNT', 'MAX_PAYOUT_AMOUNT', 'PAYOUT_FEE_RATE'] } },
  });
  const map: Record<string, string> = {};
  settings.forEach((setting: any) => {
    map[setting.key] = setting.value;
  });

  res.json(successResponse({
    configured: true,
    minAmount: Number(map.MIN_PAYOUT_AMOUNT || 100),
    maxAmount: Number(map.MAX_PAYOUT_AMOUNT || 100000),
    feeRate: Number(map.PAYOUT_FEE_RATE || 0),
  }));
});

router.get('/order/info', authenticateToken, async (req: AuthRequest, res: Response) => {
  const id = String(req.query.id || '');
  const userOrder = await prisma.userOrder.findFirst({
    where: {
      userId: req.user!.id,
      OR: [{ id }, { buyId: id }],
    },
    include: { order: true },
  });

  if (userOrder) {
    res.json(successResponse(toUserOrderDto(userOrder)));
    return;
  }

  const order = await prisma.order.findUnique({ where: { id } });
  res.json(successResponse(order));
});

router.get('/receive/order/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page || req.query.pageNum) || 1;
  const size = Number(req.query.size || req.query.pageSize) || 20;
  const status = String(req.query.status || '').trim().toUpperCase();

  const where: any = { userId: req.user!.id };
  if (status) where.status = status;

  const [records, total] = await Promise.all([
    prisma.userOrder.findMany({
      where,
      include: { order: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.userOrder.count({ where }),
  ]);

  res.json(successResponse({
    records: records.map((record: any) => ({
      ...toUserOrderDto(record),
      orderType: 2,
      type: '+',
      title: record.status === 'SUCCESS' ? 'Receive' : 'Sell Order',
    })),
    total,
    page,
    size,
    pageNum: page,
    pageSize: size,
  }));
});

router.get('/itoken/appi/token/page', authenticateToken, async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page || req.query.pageNum) || 1;
  const size = Number(req.query.size || req.query.pageSize) || 20;

  const whereClause: any = { userId: req.user!.id };
  if (String(req.query.excludePurchase) === 'true') {
    whereClause.type = { not: 'PURCHASE' };
  }

  const txns = await prisma.transaction.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * size,
    take: size,
  });

  res.json(successResponse({
    records: txns.map((txn: any) => ({
      ...txn,
      createTime: txn.createdAt,
      title: txn.description || txn.type,
      statusName: txn.status,
    })),
    page,
    size,
    pageNum: page,
    pageSize: size,
  }));
});

router.get('/offline/order/page', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse({ records: [], total: 0 }));
});

router.get('/offline/order/count', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse({ count: 0 }));
});

router.get('/payment/app/buy/order/usdt', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse({ rate: 103, minAmount: 1, maxAmount: 10000 }));
});

router.get('/user/active/activeInfo', authenticateToken, async (_req: AuthRequest, res: Response) => {
  res.json(successResponse({ isActive: true }));
});

router.post('/client/error', async (req: Request, res: Response) => {
  const body = req.body || {};
  const eventType = String(body.type || 'CLIENT_RUNTIME_ERROR').toUpperCase();
  const severityInput = String(body.severity || 'medium').toLowerCase();
  const requestedSeverity = severityInput === 'critical'
    ? 'critical'
    : severityInput === 'high'
      ? 'high'
      : severityInput === 'low'
        ? 'low'
        : 'medium';

  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  const clientIp = forwardedFor || realIp || String(req.ip || req.socket.remoteAddress || '');

  const message = String(body.message || 'Client reported error').trim().slice(0, 240);
  const meta = typeof body.meta === 'object' && body.meta ? body.meta : {};
  const stack = String((meta as any).stack || '').trim();
  const source = String((meta as any).source || '').trim();
  const line = Number((meta as any).line || 0);
  const col = Number((meta as any).col || 0);
  const eventPath = String(body.path || '').trim().slice(0, 180) || '/';
  const isLowSignalRuntimeNoise = eventType === 'CLIENT_RUNTIME_ERROR' && isGenericScriptError(message) && !stack;
  const severity = isLowSignalRuntimeNoise ? 'medium' : requestedSeverity;
  const dedupeFingerprint = [
    eventType,
    String(body.method || 'RUNTIME').toUpperCase(),
    eventPath,
    (isLowSignalRuntimeNoise ? 'generic-script-error' : message.toLowerCase()).slice(0, 140),
    source.slice(0, 120),
    line,
    col,
  ].join('|');
  const dedupeMs = isLowSignalRuntimeNoise ? CLIENT_RUNTIME_NOISE_DEDUPE_MS : CLIENT_ERROR_DEDUPE_MS;
  if (!shouldRecordClientError(dedupeFingerprint, dedupeMs)) {
    res.json(successResponse({ accepted: true, deduped: true }));
    return;
  }

  recordSecurityEvent({
    type: eventType,
    severity,
    message: message || 'Client reported error',
    ip: clientIp,
    method: String(body.method || ''),
    path: eventPath,
    userAgent: String(req.headers['user-agent'] || body.userAgent || ''),
    meta: typeof meta === 'object' && meta
      ? { ...meta, forwardedFor: forwardedFor || undefined, realIp: realIp || undefined, dedupeFingerprint }
      : { payload: body, forwardedFor: forwardedFor || undefined, realIp: realIp || undefined },
  });

  res.json(successResponse({ accepted: true }));
});

// ─── Hero Carousel (Public) ─────────────────────────
router.get('/hero-carousel', async (_req: Request, res: Response) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'HERO_CAROUSEL_ENABLED' } });
    const enabled = setting?.value === 'true';
    if (!enabled) {
      res.json(successResponse({ enabled: false, slides: [] }));
      return;
    }
    const slides = await prisma.heroCarousel.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(successResponse({ enabled: true, slides }));
  } catch (e) {
    console.error('[HeroCarousel Public]', e);
    res.json(successResponse({ enabled: false, slides: [] }));
  }
});

export default router;

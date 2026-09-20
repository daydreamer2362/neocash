import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { signUserToken, signAdminToken } from '../middleware/auth';
import { generateReferralCode, WELCOME_BONUS, successResponse, errorResponse } from '../utils/helpers';
import { getSystemSettings } from '../utils/systemSettings';
import { ensurePublicUserId } from '../utils/publicUserId';
import { verifyGoogleToken } from '../utils/firebaseAdmin';
const router = Router();

// ─── VALIDATION SCHEMAS ─────────────────────────────
const registerSchema = z.object({
  userName: z.string().min(5).max(12).regex(/^[A-Za-z0-9_]+$/),
  password: z.string().min(6),
  phone: z.string().min(10).max(15),
  invite: z.string().optional().default(''),
  inviteCode: z.string().optional().default(''),
});

const loginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(1),
});

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);
const AUTH_CONCURRENCY_LIMIT = Number(process.env.AUTH_CONCURRENCY_LIMIT || 500);
const AUTH_QUEUE_WAIT_MS = Math.max(2000, Number(process.env.AUTH_QUEUE_WAIT_MS || 12000));
const AUTH_LOOKUP_TIMEOUT_MS = Math.max(2000, Number(process.env.AUTH_LOOKUP_TIMEOUT_MS || 9000));
const AUTH_REGISTER_TX_TIMEOUT_MS = Math.max(4000, Number(process.env.AUTH_REGISTER_TX_TIMEOUT_MS || 15000));
let activeAuthRequests = 0;
type AuthWaiter = { resolve: (granted: boolean) => void; timer: NodeJS.Timeout | null };
const authWaiters: AuthWaiter[] = [];

// ─── LOGIN TICKET STORE (in-memory, TTL 5 minutes) ──
interface LoginTicketData {
  userId: string;
  phone: string;
  role: string;
  userName: string;
  availableBalance: any;
  withdrawalBalance: any;
  referralCode: string;
  createdAt: number;
}
const loginTickets = new Map<string, LoginTicketData>();
const LOGIN_TICKET_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cleanExpiredTickets = () => {
  const now = Date.now();
  for (const [key, data] of loginTickets.entries()) {
    if (now - data.createdAt > LOGIN_TICKET_TTL_MS) loginTickets.delete(key);
  }
};
// Sweep every 2 minutes
setInterval(cleanExpiredTickets, 2 * 60 * 1000);

const digitsOnly = (value: string) => String(value || '').replace(/\D/g, '');

const normalizePhoneForStorage = (value: string) => {
  const digits = digitsOnly(value);
  // Canonical storage: keep last 10 digits for Indian mobile numbers.
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
};

const buildPhoneVariants = (value: string) => {
  const raw = String(value || '').trim();
  const digits = digitsOnly(raw);
  const core10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const variants = [
    raw,
    digits,
    core10,
    core10 ? `91${core10}` : '',
    core10 ? `+91${core10}` : '',
    core10 ? `0${core10}` : '',
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return Array.from(new Set(variants));
};

const formatValidationError = (error: z.ZodError) => {
  const issue = error.issues?.[0];
  const field = String(issue?.path?.[0] || '').trim();
  if (field === 'phone') return 'Invalid phone number';
  if (field === 'password') return 'Invalid password format';
  if (field === 'userName') return 'Invalid username format';
  return 'Invalid request data';
};

const hasPrismaCode = (error: unknown, code: string) => {
  const v = error as { code?: unknown } | null;
  return String(v?.code || '') === code;
};

const hasUniqueConstraintTarget = (error: unknown, field: string) => {
  const v = error as { meta?: { target?: unknown } } | null;
  const targetRaw = v?.meta?.target;
  const targets = Array.isArray(targetRaw) ? targetRaw : [targetRaw];
  return targets.some((item) => String(item || '').includes(field));
};

const isLikelyPrismaConnectivityError = (error: unknown) => {
  const v = error as { name?: unknown; message?: unknown } | null;
  const name = String(v?.name || '');
  const message = String(v?.message || '').toLowerCase();
  return name.includes('PrismaClientInitializationError') || message.includes('can\'t reach database server');
};

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

const acquireAuthSlot = async () => {
  if (activeAuthRequests < AUTH_CONCURRENCY_LIMIT) {
    activeAuthRequests += 1;
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const waiter: AuthWaiter = {
      resolve: (granted: boolean) => {
        if (waiter.timer) clearTimeout(waiter.timer);
        resolve(granted);
      },
      timer: null,
    };
    waiter.timer = setTimeout(() => {
      const idx = authWaiters.indexOf(waiter);
      if (idx >= 0) authWaiters.splice(idx, 1);
      resolve(false);
    }, AUTH_QUEUE_WAIT_MS);
    authWaiters.push(waiter);
  });
};

const releaseAuthSlot = () => {
  activeAuthRequests = Math.max(0, activeAuthRequests - 1);
  while (authWaiters.length > 0 && activeAuthRequests < AUTH_CONCURRENCY_LIMIT) {
    const next = authWaiters.shift();
    if (!next) break;
    activeAuthRequests += 1;
    next.resolve(true);
    break;
  }
};

// ─── POST /app/user/login/login ─────────────────────
router.post('/login/login', async (req: Request, res: Response) => {
  const acquired = await acquireAuthSlot();
  if (!acquired) {
    res.status(503).json(errorResponse(1015, 'Auth service busy. Please retry'));
    return;
  }
  try {
    const { phone, password } = loginSchema.parse(req.body);
    const phoneVariants = buildPhoneVariants(phone);
    const user = await withTimeout(prisma.user.findFirst({
      where: { OR: phoneVariants.map((p) => ({ phone: p })) },
      orderBy: { createdAt: 'desc' },
    }), AUTH_LOOKUP_TIMEOUT_MS, 'AUTH_TIMEOUT_LOGIN_LOOKUP');

    const passwordMatches = user
      ? await withTimeout(bcrypt.compare(password, user.password), AUTH_LOOKUP_TIMEOUT_MS, 'AUTH_TIMEOUT_LOGIN_VERIFY')
      : false;
    if (!user || !passwordMatches) {
      res.status(400).json(errorResponse(1003, 'Invalid phone or password'));
      return;
    }
    if (!user.isActive) {
      res.status(403).json(errorResponse(1003, 'Account disabled'));
      return;
    }

    const token = signUserToken({ id: user.id, phone: user.phone, role: user.role });
    let adminToken: string | undefined;
    if (user.role === 'ADMIN') {
      adminToken = signAdminToken({ id: user.id, phone: user.phone, role: user.role });
    }
    const publicUserId = await withTimeout(
      ensurePublicUserId(user.id),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_PUBLIC_USER_ID',
    );

    res.json(successResponse({
      token,
      adminToken,
      userId: publicUserId,
      userName: user.userName,
      phone: user.phone,
      role: user.role,
      availableBalance: user.availableBalance,
      withdrawalBalance: user.withdrawalBalance,
      referralCode: user.referralCode,
    }));
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json(errorResponse(1004, formatValidationError(error)));
      return;
    }
    if (String(error?.message || '').startsWith('AUTH_TIMEOUT_')) {
      res.status(503).json(errorResponse(1013, 'Auth service timeout. Please retry'));
      return;
    }
    if (isLikelyPrismaConnectivityError(error) || hasPrismaCode(error, 'P2024')) {
      res.status(503).json(errorResponse(1013, 'Service busy. Please try again'));
      return;
    }
    res.status(500).json(errorResponse(1004, 'Login failed'));
  } finally {
    releaseAuthSlot();
  }
});


// ─── POST /app/user/rs/submit (Register) ────────────
router.post('/rs/submit', async (req: Request, res: Response) => {
  const acquired = await acquireAuthSlot();
  if (!acquired) {
    res.status(503).json(errorResponse(1016, 'Registration service busy. Please retry'));
    return;
  }
  try {
    const data = registerSchema.parse(req.body);
    const normalizedPhone = normalizePhoneForStorage(data.phone);
    const phoneVariants = buildPhoneVariants(data.phone);
    const phoneCore10 = digitsOnly(normalizedPhone).slice(-10);


    // Check duplicate
    const existing = await withTimeout(prisma.user.findFirst({
      where: {
        OR: [
          { userName: data.userName },
          ...phoneVariants.map((p) => ({ phone: p })),
          ...(phoneCore10
            ? [
              { phone: { endsWith: phoneCore10 } },
            ]
            : []),
        ],
      },
    }), AUTH_LOOKUP_TIMEOUT_MS, 'AUTH_TIMEOUT_REGISTER_DUPLICATE_CHECK');
    if (existing) {
      res.status(400).json(errorResponse(1005, 'Phone or username already registered'));
      return;
    }

    // Validate invite code if provided
    const inviteCode = String(data.invite || data.inviteCode || '').trim();
    let inviter = null as null | { id: string };
    if (inviteCode) {
      inviter = await withTimeout(
        prisma.user.findUnique({ where: { referralCode: inviteCode } }),
        AUTH_LOOKUP_TIMEOUT_MS,
        'AUTH_TIMEOUT_REGISTER_INVITER_CHECK',
      );
      if (!inviter) {
        res.status(400).json(errorResponse(1006, 'Invalid referral code'));
        return;
      }
    }

    const hashedPassword = await withTimeout(
      bcrypt.hash(data.password, BCRYPT_ROUNDS),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_REGISTER_HASH',
    );
    const { welcomeBonus } = await withTimeout(
      getSystemSettings(),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_REGISTER_SETTINGS',
    );
    const signupBonus = Number.isFinite(Number(welcomeBonus)) ? Number(welcomeBonus) : WELCOME_BONUS;
    let newUser: any = null;
    const maxReferralRetries = 30;
    for (let attempt = 0; attempt < maxReferralRetries; attempt += 1) {
      const referralCode = generateReferralCode();
      try {
        newUser = await withTimeout(prisma.$transaction(async (tx: any) => {
          const created = await tx.user.create({
            data: {
              userName: data.userName,
              password: hashedPassword,
              phone: normalizedPhone,
              referralCode,
              ...(inviter ? { inviterId: inviter.id } : {}),
              isActive: true,
              availableBalance: signupBonus,
              welcomeBonusClaimed: true,
            },
          });

          await tx.transaction.create({
            data: {
              userId: created.id,
              amount: signupBonus,
              type: 'WELCOME_BONUS',
              description: `Welcome bonus ₹${signupBonus}`,
            },
          });

          return created;
        }), AUTH_REGISTER_TX_TIMEOUT_MS, 'AUTH_TIMEOUT_REGISTER_TX');
        break;
      } catch (error) {
        if (hasPrismaCode(error, 'P2002') && hasUniqueConstraintTarget(error, 'referralCode')) {
          continue;
        }
        throw error;
      }
    }
    if (!newUser) {
      res.status(503).json(errorResponse(1014, 'Service busy. Please try again'));
      return;
    }

    const token = signUserToken({ id: newUser.id, phone: newUser.phone, role: newUser.role });
    const publicUserId = await withTimeout(
      ensurePublicUserId(newUser.id),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_PUBLIC_USER_ID',
    );

    res.json(successResponse({
      token,
      userId: publicUserId,
      userName: newUser.userName,
      phone: newUser.phone,
      referralCode: newUser.referralCode,
      availableBalance: newUser.availableBalance,
    }, 'Registration successful'));
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json(errorResponse(1008, formatValidationError(error)));
      return;
    }
    if (String(error?.message || '').startsWith('AUTH_TIMEOUT_')) {
      res.status(503).json(errorResponse(1014, 'Registration service timeout. Please retry'));
      return;
    }
    if (hasPrismaCode(error, 'P2002')) {
      res.status(409).json(errorResponse(1005, 'Phone or username already registered'));
      return;
    }
    if (isLikelyPrismaConnectivityError(error) || hasPrismaCode(error, 'P2024') || hasPrismaCode(error, 'P1001')) {
      res.status(503).json(errorResponse(1014, 'Service busy. Please try again'));
      return;
    }
    console.error('[Register Error]', error);
    res.status(500).json(errorResponse(1008, 'Registration failed'));
  } finally {
    releaseAuthSlot();
  }
});

// ─── POST /app/user/login/google (Initial Google Auth Check) ─
router.post('/login/google', async (req: Request, res: Response) => {
  const acquired = await acquireAuthSlot();
  if (!acquired) {
    res.status(503).json(errorResponse(1015, 'Auth service busy. Please retry'));
    return;
  }
  try {
    const { idToken } = req.body;
    if (!idToken) {
      res.status(400).json(errorResponse(1040, 'Google ID token is required'));
      return;
    }

    const googlePayload = await withTimeout(
      verifyGoogleToken(idToken),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_GOOGLE_VERIFY',
    );

    // Check if user with this googleId already exists
    const existingUser = await withTimeout(
      prisma.user.findUnique({ where: { googleId: googlePayload.uid } }),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_GOOGLE_LOOKUP',
    );

    if (existingUser) {
      // Existing Google user — log them in
      if (!existingUser.isActive) {
        res.status(403).json(errorResponse(1003, 'Account disabled'));
        return;
      }
      const token = signUserToken({ id: existingUser.id, phone: existingUser.phone, role: existingUser.role });
      let adminToken: string | undefined;
      if (existingUser.role === 'ADMIN') {
        adminToken = signAdminToken({ id: existingUser.id, phone: existingUser.phone, role: existingUser.role });
      }
      const publicUserId = await withTimeout(
        ensurePublicUserId(existingUser.id),
        AUTH_LOOKUP_TIMEOUT_MS,
        'AUTH_TIMEOUT_PUBLIC_USER_ID',
      );

      res.json(successResponse({
        token,
        adminToken,
        userId: publicUserId,
        userName: existingUser.userName,
        phone: existingUser.phone,
        role: existingUser.role,
        availableBalance: existingUser.availableBalance,
        withdrawalBalance: existingUser.withdrawalBalance,
        referralCode: existingUser.referralCode,
      }));
      return;
    }

    // New user — tell the frontend to show the registration popup
    res.json(successResponse({
      newUser: true,
      email: googlePayload.email || '',
      displayName: googlePayload.displayName || '',
    }, 'New user — complete registration'));
  } catch (error: any) {
    if (String(error?.message || '').startsWith('AUTH_TIMEOUT_')) {
      res.status(503).json(errorResponse(1013, 'Auth service timeout. Please retry'));
      return;
    }
    console.error('[Google Login Error]', error);
    res.status(500).json(errorResponse(1041, 'Google authentication failed'));
  } finally {
    releaseAuthSlot();
  }
});

// ─── POST /app/user/login/google/complete (Finalize Google Registration) ─
router.post('/login/google/complete', async (req: Request, res: Response) => {
  const acquired = await acquireAuthSlot();
  if (!acquired) {
    res.status(503).json(errorResponse(1016, 'Registration service busy. Please retry'));
    return;
  }
  try {
    const { idToken, phone, inviteCode: rawInviteCode } = req.body;
    if (!idToken) {
      res.status(400).json(errorResponse(1040, 'Google ID token is required'));
      return;
    }
    if (!phone) {
      res.status(400).json(errorResponse(1042, 'Phone number is required'));
      return;
    }

    // Verify Google token again
    const googlePayload = await withTimeout(
      verifyGoogleToken(idToken),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_GOOGLE_VERIFY',
    );

    // Check if googleId is already registered
    const alreadyExists = await withTimeout(
      prisma.user.findUnique({ where: { googleId: googlePayload.uid } }),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_GOOGLE_DUP_CHECK',
    );
    if (alreadyExists) {
      res.status(409).json(errorResponse(1043, 'This Google account is already registered'));
      return;
    }

    // Normalize & validate phone
    const normalizedPhone = normalizePhoneForStorage(phone);
    const phoneVariants = buildPhoneVariants(phone);
    const phoneCore10 = digitsOnly(normalizedPhone).slice(-10);
    if (phoneCore10.length !== 10) {
      res.status(400).json(errorResponse(1004, 'Please enter a valid 10-digit phone number'));
      return;
    }

    // Check duplicate phone
    const existingPhone = await withTimeout(prisma.user.findFirst({
      where: {
        OR: [
          ...phoneVariants.map((p) => ({ phone: p })),
          ...(phoneCore10 ? [{ phone: { endsWith: phoneCore10 } }] : []),
        ],
      },
    }), AUTH_LOOKUP_TIMEOUT_MS, 'AUTH_TIMEOUT_GOOGLE_PHONE_CHECK');
    if (existingPhone) {
      res.status(400).json(errorResponse(1005, 'This phone number is already registered'));
      return;
    }

    // Validate invite code (same logic as /rs/submit)
    const inviteCode = String(rawInviteCode || '').trim();
    let inviter = null as null | { id: string };
    if (inviteCode) {
      inviter = await withTimeout(
        prisma.user.findUnique({ where: { referralCode: inviteCode } }),
        AUTH_LOOKUP_TIMEOUT_MS,
        'AUTH_TIMEOUT_GOOGLE_INVITER_CHECK',
      );
      if (!inviter) {
        res.status(400).json(errorResponse(1006, 'Invalid referral code'));
        return;
      }
    }

    // Generate a username from Google display name
    const baseName = String(googlePayload.displayName || googlePayload.email?.split('@')[0] || 'user')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 8)
      || 'user';
    const userName = `${baseName}${Math.floor(1000 + Math.random() * 9000)}`;

    // Random password hash (Google users don't use password login)
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await withTimeout(
      bcrypt.hash(randomPassword, BCRYPT_ROUNDS),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_GOOGLE_HASH',
    );

    const { welcomeBonus } = await withTimeout(
      getSystemSettings(),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_GOOGLE_SETTINGS',
    );
    const signupBonus = Number.isFinite(Number(welcomeBonus)) ? Number(welcomeBonus) : WELCOME_BONUS;

    let newUser: any = null;
    const maxReferralRetries = 30;
    for (let attempt = 0; attempt < maxReferralRetries; attempt += 1) {
      const referralCode = generateReferralCode();
      try {
        newUser = await withTimeout(prisma.$transaction(async (tx: any) => {
          const created = await tx.user.create({
            data: {
              userName,
              password: hashedPassword,
              phone: normalizedPhone,
              googleId: googlePayload.uid,
              email: googlePayload.email || null,
              referralCode,
              ...(inviter ? { inviterId: inviter.id } : {}),
              isActive: true,
              availableBalance: signupBonus,
              welcomeBonusClaimed: true,
            },
          });

          await tx.transaction.create({
            data: {
              userId: created.id,
              amount: signupBonus,
              type: 'WELCOME_BONUS',
              description: `Welcome bonus ₹${signupBonus}`,
            },
          });

          return created;
        }), AUTH_REGISTER_TX_TIMEOUT_MS, 'AUTH_TIMEOUT_GOOGLE_TX');
        break;
      } catch (error) {
        if (hasPrismaCode(error, 'P2002') && hasUniqueConstraintTarget(error, 'referralCode')) {
          continue;
        }
        if (hasPrismaCode(error, 'P2002') && hasUniqueConstraintTarget(error, 'userName')) {
          continue; // Retry with a new random suffix
        }
        throw error;
      }
    }
    if (!newUser) {
      res.status(503).json(errorResponse(1014, 'Service busy. Please try again'));
      return;
    }

    const token = signUserToken({ id: newUser.id, phone: newUser.phone, role: newUser.role });
    const publicUserId = await withTimeout(
      ensurePublicUserId(newUser.id),
      AUTH_LOOKUP_TIMEOUT_MS,
      'AUTH_TIMEOUT_PUBLIC_USER_ID',
    );

    res.json(successResponse({
      token,
      userId: publicUserId,
      userName: newUser.userName,
      phone: newUser.phone,
      referralCode: newUser.referralCode,
      availableBalance: newUser.availableBalance,
    }, 'Registration successful'));
  } catch (error: any) {
    if (String(error?.message || '').startsWith('AUTH_TIMEOUT_')) {
      res.status(503).json(errorResponse(1014, 'Registration service timeout. Please retry'));
      return;
    }
    if (hasPrismaCode(error, 'P2002')) {
      res.status(409).json(errorResponse(1005, 'Phone or username already registered'));
      return;
    }
    if (isLikelyPrismaConnectivityError(error) || hasPrismaCode(error, 'P2024') || hasPrismaCode(error, 'P1001')) {
      res.status(503).json(errorResponse(1014, 'Service busy. Please try again'));
      return;
    }
    console.error('[Google Register Error]', error);
    res.status(500).json(errorResponse(1044, 'Google registration failed'));
  } finally {
    releaseAuthSlot();
  }
});

// ─── GET /app/user/rs/invite/prefill ────────────────
router.get('/rs/invite/prefill', async (req: Request, res: Response) => {
  const code = String(req.query.code || req.query.invite || '').trim();
  if (!code) {
    res.json(successResponse({ valid: false }));
    return;
  }
  const inviter = await prisma.user.findUnique({ where: { referralCode: String(code) } });
  res.json(successResponse({ valid: !!inviter, userName: inviter?.userName, inviteCode: code }));
});

// ─── POST /app/user/login/forgot ────────────────────
router.post('/login/forgot', async (req: Request, res: Response) => {
  try {
    const { phone, newPassword } = req.body;
    if (!phone || !newPassword) {
      res.status(400).json(errorResponse(1009, 'Phone and new password required'));
      return;
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      res.status(404).json(errorResponse(1011, 'User not found'));
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    res.json(successResponse(null, 'Password reset successful'));
  } catch (error) {
    res.status(500).json(errorResponse(1012, 'Password reset failed'));
  }
});

export default router;

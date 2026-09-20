// Shared helpers
import { customAlphabet } from 'nanoid';

export const generateBuyId = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 8);
export const generateOrderCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 6);
export const generateReferralCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 6);
export const generateOrderNumber = customAlphabet('0123456789', 8);

// Generate reference number like R2026031921303819592574
export const generateReferenceNo = (): string => {
  const now = new Date();
  const datePart = now.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const randomPart = customAlphabet('0123456789', 10)();
  return `R${datePart}${randomPart}`;
};

export const USDT_TO_INR = Number(process.env.USDT_TO_INR_RATE) || 103;
export const WELCOME_BONUS = Number(process.env.WELCOME_BONUS) || 146.84;
export const LEVEL_B_RATE = Number(process.env.LEVEL_B_COMMISSION) || 0.03;
export const LEVEL_C_RATE = Number(process.env.LEVEL_C_COMMISSION) || 0.015;
export const ORDER_EXPIRY_MINUTES = Number(process.env.ORDER_EXPIRY_MINUTES) || 30;
const INVITE_PUBLIC_BASE = 'http://localhost:5173';
const INVITE_PUBLIC_SEGMENT = 'users_invite_code';

export const getPublicAppBaseUrl = (fallbackOrigin?: string) => {
  const configured = String(process.env.APP_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const fallback = String(fallbackOrigin || '').trim();
  if (fallback) return fallback.replace(/\/+$/, '');
  return INVITE_PUBLIC_BASE;
};

export const buildInviteUrl = (inviteCode: string | null | undefined, fallbackOrigin?: string) => {
  const code = String(inviteCode || '').trim();
  const base = getPublicAppBaseUrl(fallbackOrigin);
  if (!code) return `${base}/${INVITE_PUBLIC_SEGMENT}`;
  return `${base}/${INVITE_PUBLIC_SEGMENT}/${encodeURIComponent(code)}`;
};

export const successResponse = (data: any, msg = 'Success') => ({
  code: 1000,
  msg,
  data,
});

export const errorResponse = (code: number, msg: string) => ({
  code,
  msg,
});

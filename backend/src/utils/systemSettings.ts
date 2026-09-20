import prisma from './prisma';
import { WELCOME_BONUS } from './helpers';

const KEYS = {
  welcomeBonus: 'WELCOME_BONUS',
  orderIncomePercent: 'ORDER_INCOME_PERCENT',
  payoutFeeRate: 'PAYOUT_FEE_RATE',
  orderLockMinutes: 'ORDER_LOCK_MINUTES',
  messageWelcomeTitle: 'MESSAGE_WELCOME_TITLE',
  messageWelcomeBody: 'MESSAGE_WELCOME_BODY',
  appVersion: 'APP_VERSION',
  appForceUpdate: 'APP_FORCE_UPDATE',
  appDownloadUrl: 'APP_DOWNLOAD_URL',
  apiBaseUrl: 'API_BASE_URL',
  supportTelegramUrl: 'SUPPORT_TELEGRAM_URL',
  usdtInInr: 'USDT_IN_INR',
  usdtBonus: 'USDT_BONUS',
  usdtWalletAddress: 'USDT_WALLET_ADDRESS',
} as const;

const DEFAULT_ORDER_INCOME_PERCENT = Number(process.env.DEFAULT_INCOME_PERCENT) || 4;
const DEFAULT_APP_VERSION = String(process.env.APP_VERSION || '1.1.1');

const parseNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

export const getSystemSettings = async () => {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    welcomeBonus: parseNumber(map.get(KEYS.welcomeBonus), WELCOME_BONUS),
    orderIncomePercent: parseNumber(map.get(KEYS.orderIncomePercent), DEFAULT_ORDER_INCOME_PERCENT),
    payoutFeeRate: parseNumber(map.get(KEYS.payoutFeeRate), 0),
    orderLockMinutes: parseNumber(map.get(KEYS.orderLockMinutes), 30),
    messageWelcomeTitle: String(map.get(KEYS.messageWelcomeTitle) || 'Welcome to Gamma Pay'),
    messageWelcomeBody: String(map.get(KEYS.messageWelcomeBody) || 'Start claiming orders to earn 6.5% cashback rewards!'),
    appVersion: String(map.get(KEYS.appVersion) || DEFAULT_APP_VERSION),
    appForceUpdate: parseBoolean(map.get(KEYS.appForceUpdate), false),
    appDownloadUrl: String(map.get(KEYS.appDownloadUrl) || ''),
    apiBaseUrl: String(map.get(KEYS.apiBaseUrl) || '').trim(),
    supportTelegramUrl: String(map.get(KEYS.supportTelegramUrl) || '').trim(),
    usdtInInr: parseNumber(map.get(KEYS.usdtInInr), 103),
    usdtBonus: parseNumber(map.get(KEYS.usdtBonus), 0),
    usdtWalletAddress: String(map.get(KEYS.usdtWalletAddress) || '').trim(),
  };
};

export const updateSystemSettings = async (input: {
  welcomeBonus?: unknown;
  orderIncomePercent?: unknown;
  payoutFeeRate?: unknown;
  orderLockMinutes?: unknown;
  messageWelcomeTitle?: unknown;
  messageWelcomeBody?: unknown;
  appVersion?: unknown;
  appForceUpdate?: unknown;
  appDownloadUrl?: unknown;
  apiBaseUrl?: unknown;
  supportTelegramUrl?: unknown;
  usdtInInr?: unknown;
  usdtBonus?: unknown;
  usdtWalletAddress?: unknown;
}) => {
  const updates: Array<{ key: string; value: string }> = [];

  if (input.welcomeBonus !== undefined) {
    updates.push({ key: KEYS.welcomeBonus, value: String(parseNumber(input.welcomeBonus, WELCOME_BONUS)) });
  }
  if (input.orderIncomePercent !== undefined) {
    updates.push({
      key: KEYS.orderIncomePercent,
      value: String(parseNumber(input.orderIncomePercent, DEFAULT_ORDER_INCOME_PERCENT)),
    });
  }
  if (input.payoutFeeRate !== undefined) {
    updates.push({ key: KEYS.payoutFeeRate, value: String(parseNumber(input.payoutFeeRate, 0)) });
  }
  if (input.orderLockMinutes !== undefined) {
    updates.push({ key: KEYS.orderLockMinutes, value: String(parseNumber(input.orderLockMinutes, 30)) });
  }
  if (input.messageWelcomeTitle !== undefined) {
    updates.push({ key: KEYS.messageWelcomeTitle, value: String(input.messageWelcomeTitle || 'Welcome to Gamma Pay').trim() || 'Welcome to Gamma Pay' });
  }
  if (input.messageWelcomeBody !== undefined) {
    updates.push({ key: KEYS.messageWelcomeBody, value: String(input.messageWelcomeBody || 'Start claiming orders to earn 6.5% cashback rewards!').trim() || 'Start claiming orders to earn 6.5% cashback rewards!' });
  }
  if (input.appVersion !== undefined) {
    updates.push({ key: KEYS.appVersion, value: String(input.appVersion || DEFAULT_APP_VERSION).trim() || DEFAULT_APP_VERSION });
  }
  if (input.appForceUpdate !== undefined) {
    updates.push({ key: KEYS.appForceUpdate, value: String(parseBoolean(input.appForceUpdate, false)) });
  }
  if (input.appDownloadUrl !== undefined) {
    updates.push({ key: KEYS.appDownloadUrl, value: String(input.appDownloadUrl || '').trim() });
  }
  if (input.apiBaseUrl !== undefined) {
    updates.push({ key: KEYS.apiBaseUrl, value: String(input.apiBaseUrl || '').trim() });
  }
  if (input.supportTelegramUrl !== undefined) {
    updates.push({ key: KEYS.supportTelegramUrl, value: String(input.supportTelegramUrl || '').trim() });
  }
  if (input.usdtInInr !== undefined) {
    updates.push({ key: KEYS.usdtInInr, value: String(parseNumber(input.usdtInInr, 103)) });
  }
  if (input.usdtBonus !== undefined) {
    updates.push({ key: KEYS.usdtBonus, value: String(parseNumber(input.usdtBonus, 0)) });
  }
  if (input.usdtWalletAddress !== undefined) {
    updates.push({ key: KEYS.usdtWalletAddress, value: String(input.usdtWalletAddress || '').trim() });
  }

  if (updates.length) {
    await prisma.$transaction(updates.map((item) => prisma.setting.upsert({
      where: { key: item.key },
      create: { key: item.key, value: item.value },
      update: { value: item.value },
    })));
  }

  return getSystemSettings();
};

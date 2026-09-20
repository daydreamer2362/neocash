/**
 * Fast2SMS OTP Utility
 *
 * Handles:
 *  - Generating 6-digit OTPs
 *  - Sending OTPs via Fast2SMS bulkV2 API
 *  - In-memory OTP store with 5-minute expiry
 *  - Quota tracking via Setting model (max 200 SMS)
 *  - Auto-fallback when quota exhausted or API errors
 */

import prisma from './prisma';

// ─── CONSTANTS ──────────────────────────────────────
const FAST2SMS_API_KEY = 'sfwMtamg0eROoLd16vBSW89nGExDXIFVyTzbquH3ZrQlj5UCi4d1HBqjYXzVuTeflC6Wh2maEQL5GDUs';
const FAST2SMS_BASE_URL = 'https://www.fast2sms.com/dev/bulkV2';

const OTP_USAGE_KEY = 'OTP_USAGE_COUNT';
const OTP_ENABLED_KEY = 'OTP_ENABLED';
const OTP_SAFETY_LIMIT = 200;

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 5 * 60 * 1000;   // 5 minutes
const OTP_COOLDOWN_MS = 60 * 1000;      // 60 seconds between resends
const MAX_VERIFY_ATTEMPTS = 5;           // Max wrong attempts before OTP invalidation

// ─── OTP STORE (in-memory) ──────────────────────────
interface OtpEntry {
  code: string;
  expiresAt: number;
  cooldownUntil: number;
  attempts: number;
}
const otpStore = new Map<string, OtpEntry>();

// Sweep expired entries every 3 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpStore.entries()) {
    if (now > entry.expiresAt) otpStore.delete(key);
  }
}, 3 * 60 * 1000);

// ─── HELPERS ────────────────────────────────────────

/** Normalize to last 10 digits */
const normalize10 = (phone: string): string =>
  String(phone || '').replace(/\D/g, '').slice(-10);

/** Generate a random N-digit OTP */
export const generateOtp = (): string => {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
};

// ─── QUOTA HELPERS ──────────────────────────────────

export const getOtpUsageCount = async (): Promise<number> => {
  try {
    const row = await prisma.setting.findUnique({ where: { key: OTP_USAGE_KEY } });
    return row ? Number(row.value) || 0 : 0;
  } catch {
    return 0;
  }
};

const isOtpManuallyEnabled = async (): Promise<boolean> => {
  try {
    const row = await prisma.setting.findUnique({ where: { key: OTP_ENABLED_KEY } });
    if (!row) return true; // Enabled by default
    return row.value === 'true' || row.value === '1';
  } catch {
    return true;
  }
};

const incrementOtpUsage = async (): Promise<number> => {
  try {
    const current = await getOtpUsageCount();
    const newCount = current + 1;
    await prisma.setting.upsert({
      where: { key: OTP_USAGE_KEY },
      create: { key: OTP_USAGE_KEY, value: String(newCount) },
      update: { value: String(newCount) },
    });

    if (newCount >= OTP_SAFETY_LIMIT) {
      await prisma.setting.upsert({
        where: { key: OTP_ENABLED_KEY },
        create: { key: OTP_ENABLED_KEY, value: 'false' },
        update: { value: 'false' },
      });
      console.warn(`[OTP] Usage reached ${newCount}. Auto-disabled OTP.`);
    }

    return newCount;
  } catch (error) {
    console.error('[OTP] Failed to increment usage', error);
    return 0;
  }
};

/**
 * Check if OTP should be required.
 * Returns false when quota exhausted or manually disabled.
 */
export const shouldRequireOtp = async (): Promise<boolean> => {
  try {
    const enabled = await isOtpManuallyEnabled();
    if (!enabled) return false;
    const count = await getOtpUsageCount();
    return count < OTP_SAFETY_LIMIT;
  } catch {
    return false;
  }
};

// ─── SEND OTP VIA FAST2SMS ──────────────────────────

/**
 * Send an OTP to the given phone number via Fast2SMS.
 *
 * Returns { success, message, cooldownRemaining? }
 */
export const sendOtp = async (
  phone: string,
): Promise<{ success: boolean; message: string; cooldownRemaining?: number }> => {
  const key = normalize10(phone);
  if (key.length !== 10) {
    return { success: false, message: 'Invalid phone number' };
  }

  // Check cooldown
  const existing = otpStore.get(key);
  if (existing && Date.now() < existing.cooldownUntil) {
    const remaining = Math.ceil((existing.cooldownUntil - Date.now()) / 1000);
    return { success: false, message: `Please wait ${remaining}s before resending`, cooldownRemaining: remaining };
  }

  // Check quota
  const quotaOk = await shouldRequireOtp();
  if (!quotaOk) {
    return { success: false, message: 'OTP service temporarily unavailable' };
  }

  const code = generateOtp();

  // Call Fast2SMS
  try {
    const url = new URL(FAST2SMS_BASE_URL);
    url.searchParams.set('authorization', FAST2SMS_API_KEY);
    url.searchParams.set('route', 'otp');
    url.searchParams.set('variables_values', code);
    url.searchParams.set('flash', '0');
    url.searchParams.set('numbers', key);
    url.searchParams.set('schedule_time', '');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'cache-control': 'no-cache' },
    });

    const data = await response.json();

    if (!data.return || data.status_code !== 200) {
      console.error('[Fast2SMS] API error:', data);
      
      // Auto-fallback: Disable OTP system if Fast2SMS errors (e.g. unverified website, no balance)
      await prisma.setting.upsert({
        where: { key: OTP_ENABLED_KEY },
        create: { key: OTP_ENABLED_KEY, value: 'false' },
        update: { value: 'false' },
      });
      console.warn(`[OTP] Fast2SMS API failed. Auto-disabled OTP.`);

      return { success: false, message: 'OTP Service is temporarily disabled. You can register without an OTP now.' };
    }

    // Store OTP
    otpStore.set(key, {
      code,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      cooldownUntil: Date.now() + OTP_COOLDOWN_MS,
      attempts: 0,
    });

    // Increment quota
    await incrementOtpUsage();

    console.log(`[OTP] Sent to ${key}`);
    return { success: true, message: 'OTP sent successfully' };
  } catch (error: any) {
    console.error('[Fast2SMS] Request failed:', error);
    return { success: false, message: 'Failed to send OTP. Please try again.' };
  }
};

// ─── VERIFY OTP ─────────────────────────────────────

/**
 * Verify the OTP entered by the user.
 */
export const verifyOtp = (
  phone: string,
  userCode: string,
): { success: boolean; message: string } => {
  const key = normalize10(phone);
  const entry = otpStore.get(key);

  if (!entry) {
    return { success: false, message: 'No OTP found. Please request a new one.' };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { success: false, message: 'OTP expired. Please request a new one.' };
  }

  if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(key);
    return { success: false, message: 'Too many wrong attempts. Please request a new OTP.' };
  }

  const normalizedUser = String(userCode || '').trim();
  if (normalizedUser !== entry.code) {
    entry.attempts += 1;
    return { success: false, message: 'Incorrect OTP. Please try again.' };
  }

  // Success — consume the OTP
  otpStore.delete(key);
  return { success: true, message: 'OTP verified successfully' };
};

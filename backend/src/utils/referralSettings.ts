import prisma from './prisma';
import { LEVEL_B_RATE, LEVEL_C_RATE } from './helpers';

const LEVEL_B_KEY = 'REFERRAL_LEVEL_B_RATE';
const LEVEL_C_KEY = 'REFERRAL_LEVEL_C_RATE';

const parseRate = (raw: unknown, fallback: number) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return Math.max(0, Math.min(1, normalized));
};

const toPercent = (rate: number) => Number((rate * 100).toFixed(4));

export const getReferralRates = async () => {
  const settings = await prisma.setting.findMany({
    where: { key: { in: [LEVEL_B_KEY, LEVEL_C_KEY] } },
  });

  const map = new Map(settings.map((setting) => [setting.key, setting.value]));
  const levelBRate = parseRate(map.get(LEVEL_B_KEY), LEVEL_B_RATE);
  const levelCRate = parseRate(map.get(LEVEL_C_KEY), LEVEL_C_RATE);

  return {
    levelBRate,
    levelCRate,
    levelBPercent: toPercent(levelBRate),
    levelCPercent: toPercent(levelCRate),
  };
};

export const setReferralRates = async (levelBInput: unknown, levelCInput: unknown) => {
  const levelBRate = parseRate(levelBInput, LEVEL_B_RATE);
  const levelCRate = parseRate(levelCInput, LEVEL_C_RATE);

  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: LEVEL_B_KEY },
      create: { key: LEVEL_B_KEY, value: String(levelBRate) },
      update: { value: String(levelBRate) },
    }),
    prisma.setting.upsert({
      where: { key: LEVEL_C_KEY },
      create: { key: LEVEL_C_KEY, value: String(levelCRate) },
      update: { value: String(levelCRate) },
    }),
  ]);

  return {
    levelBRate,
    levelCRate,
    levelBPercent: toPercent(levelBRate),
    levelCPercent: toPercent(levelCRate),
  };
};

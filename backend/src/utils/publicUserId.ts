import { customAlphabet } from 'nanoid';
import prisma from './prisma';

const generatePublicUserId = customAlphabet('0123456789', 6);
const USER_PUBLIC_ID_PREFIX = 'PUBLIC_USER_ID_';
const USER_PUBLIC_ID_LOOKUP_PREFIX = 'PUBLIC_USER_ID_LOOKUP_';
const MAX_PUBLIC_ID_ATTEMPTS = 50;

const hasPrismaCode = (error: unknown, code: string) => {
  const v = error as { code?: unknown } | null;
  return String(v?.code || '') === code;
};

const hashToPublicUserId = (userId: string) => {
  let hash = 0;
  const source = String(userId || '');
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash * 31) + source.charCodeAt(i)) >>> 0;
  }
  const six = (hash % 900000) + 100000;
  return String(six).padStart(6, '0');
};

const publicUserIdKey = (userId: string) => `${USER_PUBLIC_ID_PREFIX}${String(userId || '').trim()}`;
const publicUserIdLookupKey = (publicUserId: string) => `${USER_PUBLIC_ID_LOOKUP_PREFIX}${String(publicUserId || '').trim()}`;

export const isPublicUserIdFormat = (value: unknown) => /^\d{6}$/.test(String(value || '').trim());

export const findUserIdByPublicUserId = async (publicUserId: string) => {
  const normalized = String(publicUserId || '').trim();
  if (!isPublicUserIdFormat(normalized)) return null;
  const row = await prisma.setting.findUnique({
    where: { key: publicUserIdLookupKey(normalized) },
    select: { value: true },
  });
  return row?.value ? String(row.value) : null;
};

export const getPublicUserIdByUserId = async (userId: string) => {
  const key = publicUserIdKey(userId);
  const row = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
  return row?.value ? String(row.value) : null;
};

export const ensurePublicUserId = async (userId: string) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return '';

  const current = await getPublicUserIdByUserId(normalizedUserId);
  if (current) {
    const lookupKey = publicUserIdLookupKey(current);
    const existingLookup = await prisma.setting.findUnique({ where: { key: lookupKey }, select: { key: true } });
    if (!existingLookup) {
      try {
        await prisma.setting.create({ data: { key: lookupKey, value: normalizedUserId } });
      } catch (error) {
        if (!hasPrismaCode(error, 'P2002')) throw error;
      }
    }
    return current;
  }

  for (let attempt = 0; attempt < MAX_PUBLIC_ID_ATTEMPTS; attempt += 1) {
    const candidate = generatePublicUserId();
    const candidateLookupKey = publicUserIdLookupKey(candidate);

    try {
      const created = await prisma.$transaction(async (tx) => {
        const existing = await tx.setting.findUnique({
          where: { key: publicUserIdKey(normalizedUserId) },
          select: { value: true },
        });
        if (existing?.value) return String(existing.value);

        await tx.setting.create({ data: { key: candidateLookupKey, value: normalizedUserId } });
        await tx.setting.create({ data: { key: publicUserIdKey(normalizedUserId), value: candidate } });
        return candidate;
      });

      if (created) return String(created);
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) continue;
      throw error;
    }
  }

  // Last-resort deterministic probe to avoid hard failures in auth/profile flows.
  const base = Number(hashToPublicUserId(normalizedUserId));
  for (let offset = 0; offset < 1000; offset += 1) {
    const candidateNum = ((base - 100000 + offset) % 900000) + 100000;
    const candidate = String(candidateNum).padStart(6, '0');
    const candidateLookupKey = publicUserIdLookupKey(candidate);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const existing = await tx.setting.findUnique({
          where: { key: publicUserIdKey(normalizedUserId) },
          select: { value: true },
        });
        if (existing?.value) return String(existing.value);

        await tx.setting.create({ data: { key: candidateLookupKey, value: normalizedUserId } });
        await tx.setting.create({ data: { key: publicUserIdKey(normalizedUserId), value: candidate } });
        return candidate;
      });

      if (created) return String(created);
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) continue;
    }
  }

  // Absolute fallback (keeps API alive even under severe DB contention/collisions).
  return hashToPublicUserId(normalizedUserId);
};

export const getPublicUserIdMap = async (userIds: string[]) => {
  const uniqueUserIds = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const result = new Map<string, string>();
  if (!uniqueUserIds.length) return result;

  const keys = uniqueUserIds.map((id) => publicUserIdKey(id));
  const rows = await prisma.setting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });

  for (const row of rows) {
    if (!row?.key?.startsWith(USER_PUBLIC_ID_PREFIX)) continue;
    const userId = row.key.slice(USER_PUBLIC_ID_PREFIX.length);
    if (userId && row.value) result.set(userId, String(row.value));
  }

  const missingUserIds = uniqueUserIds.filter((id) => !result.has(id));
  if (missingUserIds.length) {
    const generated = await Promise.all(missingUserIds.map((id) => ensurePublicUserId(id)));
    for (let i = 0; i < missingUserIds.length; i += 1) {
      result.set(missingUserIds[i], generated[i]);
    }
  }

  return result;
};

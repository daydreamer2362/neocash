import prisma from './prisma';
import { decryptSettingValue, encryptSettingValue, hasEncryptionKey } from './secureSetting';

const KEYS = {
  securityIngestKey: 'SECURITY_INGEST_KEY',
  telegramEnabled: 'ALERT_TELEGRAM_ENABLED',
  telegramBotToken: 'ALERT_TELEGRAM_BOT_TOKEN',
  telegramChatId: 'ALERT_TELEGRAM_CHAT_ID',
  telegramThreadId: 'ALERT_TELEGRAM_THREAD_ID',
  telegramMinSeverity: 'ALERT_TELEGRAM_MIN_SEVERITY',
  slackEnabled: 'ALERT_SLACK_ENABLED',
  slackWebhookUrl: 'ALERT_SLACK_WEBHOOK_URL',
  wazuhEnabled: 'WAZUH_INGEST_ENABLED',
  prometheusEnabled: 'PROMETHEUS_METRICS_ENABLED',
  cloudflareZoneId: 'CLOUDFLARE_ZONE_ID',
  cloudflareApiToken: 'CLOUDFLARE_API_TOKEN',
} as const;

const SECRET_KEYS: Set<string> = new Set([
  KEYS.securityIngestKey,
  KEYS.telegramBotToken,
  KEYS.telegramChatId,
  KEYS.slackWebhookUrl,
  KEYS.cloudflareApiToken,
]);

const parseBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizeSeverity = (value: unknown): 'low' | 'medium' | 'high' | 'critical' => {
  const input = String(value || '').toLowerCase();
  if (input === 'critical') return 'critical';
  if (input === 'high') return 'high';
  if (input === 'medium') return 'medium';
  return 'low';
};

const mask = (value: string) => {
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}******`;
  return `${value.slice(0, 4)}******${value.slice(-2)}`;
};

const loadRows = async () => {
  try {
    return await prisma.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  } catch {
    return [];
  }
};

const toMap = (rows: Array<{ key: string; value: string }>) => new Map(rows.map((row) => [row.key, row.value]));

const readValue = (map: Map<string, string>, key: string) => {
  const raw = String(map.get(key) || '');
  if (!raw) return '';
  if (!SECRET_KEYS.has(key)) return raw;
  return decryptSettingValue(raw);
};

export const getSecurityRuntimeConfig = async () => {
  const rows = await loadRows();
  const map = toMap(rows);

  const ingestFromDb = readValue(map, KEYS.securityIngestKey);
  const telegramTokenFromDb = readValue(map, KEYS.telegramBotToken);
  const telegramChatFromDb = readValue(map, KEYS.telegramChatId);
  const slackHookFromDb = readValue(map, KEYS.slackWebhookUrl);

  return {
    encryptionEnabled: hasEncryptionKey,
    securityIngestKey: ingestFromDb || String(process.env.SECURITY_INGEST_KEY || '').trim(),
    telegramEnabled: parseBoolean(map.get(KEYS.telegramEnabled), true),
    telegramBotToken: telegramTokenFromDb || String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    telegramChatId: telegramChatFromDb || String(process.env.TELEGRAM_CHAT_ID || '').trim(),
    telegramThreadId: readValue(map, KEYS.telegramThreadId) || String(process.env.TELEGRAM_THREAD_ID || '').trim(),
    telegramMinSeverity: normalizeSeverity(readValue(map, KEYS.telegramMinSeverity) || process.env.TELEGRAM_ALERT_MIN_SEVERITY || 'medium'),
    slackEnabled: parseBoolean(map.get(KEYS.slackEnabled), false),
    slackWebhookUrl: slackHookFromDb || String(process.env.SLACK_ALERT_WEBHOOK_URL || '').trim(),
    wazuhEnabled: parseBoolean(map.get(KEYS.wazuhEnabled), true),
    prometheusEnabled: parseBoolean(map.get(KEYS.prometheusEnabled), true),
    cloudflareZoneId: readValue(map, KEYS.cloudflareZoneId) || '',
    cloudflareApiToken: readValue(map, KEYS.cloudflareApiToken) || '',
  };
};

export const getSecurityConfigForAdmin = async () => {
  const cfg = await getSecurityRuntimeConfig();
  return {
    encryptionEnabled: cfg.encryptionEnabled,
    telegramEnabled: cfg.telegramEnabled,
    telegramBotToken: mask(cfg.telegramBotToken),
    telegramBotTokenSet: Boolean(cfg.telegramBotToken),
    telegramChatId: mask(cfg.telegramChatId),
    telegramChatIdSet: Boolean(cfg.telegramChatId),
    telegramThreadId: cfg.telegramThreadId,
    telegramMinSeverity: cfg.telegramMinSeverity,
    slackEnabled: cfg.slackEnabled,
    slackWebhookUrl: mask(cfg.slackWebhookUrl),
    slackWebhookUrlSet: Boolean(cfg.slackWebhookUrl),
    wazuhEnabled: cfg.wazuhEnabled,
    prometheusEnabled: cfg.prometheusEnabled,
    securityIngestKey: mask(cfg.securityIngestKey),
    securityIngestKeySet: Boolean(cfg.securityIngestKey),
    cloudflareZoneId: cfg.cloudflareZoneId,
    cloudflareApiToken: mask(cfg.cloudflareApiToken),
    cloudflareApiTokenSet: Boolean(cfg.cloudflareApiToken),
  };
};

const normalizeInputString = (value: unknown) => String(value ?? '').trim();

const toStoredValue = (key: string, value: string) => (
  SECRET_KEYS.has(key) ? encryptSettingValue(value) : value
);

export const updateSecurityConfig = async (input: Record<string, unknown>) => {
  const rows = await loadRows();
  const map = toMap(rows);
  const updates: Array<{ key: string; value: string }> = [];

  const pushValue = (inputKey: string, key: string, options?: { boolean?: boolean; severity?: boolean }) => {
    if (!(inputKey in input)) return;
    let value = '';
    if (options?.boolean) value = String(parseBoolean(input[inputKey], false));
    else if (options?.severity) value = normalizeSeverity(input[inputKey]);
    else value = normalizeInputString(input[inputKey]);
    const current = String(map.get(key) || '');
    const finalValue = toStoredValue(key, value);
    if (finalValue !== current) updates.push({ key, value: finalValue });
  };

  pushValue('securityIngestKey', KEYS.securityIngestKey);
  pushValue('telegramEnabled', KEYS.telegramEnabled, { boolean: true });
  pushValue('telegramBotToken', KEYS.telegramBotToken);
  pushValue('telegramChatId', KEYS.telegramChatId);
  pushValue('telegramThreadId', KEYS.telegramThreadId);
  pushValue('telegramMinSeverity', KEYS.telegramMinSeverity, { severity: true });
  pushValue('slackEnabled', KEYS.slackEnabled, { boolean: true });
  pushValue('slackWebhookUrl', KEYS.slackWebhookUrl);
  pushValue('wazuhEnabled', KEYS.wazuhEnabled, { boolean: true });
  pushValue('prometheusEnabled', KEYS.prometheusEnabled, { boolean: true });
  pushValue('cloudflareZoneId', KEYS.cloudflareZoneId);
  pushValue('cloudflareApiToken', KEYS.cloudflareApiToken);

  if (updates.length) {
    await prisma.$transaction(updates.map((item) => prisma.setting.upsert({
      where: { key: item.key },
      create: { key: item.key, value: item.value },
      update: { value: item.value },
    })));
  }

  return getSecurityConfigForAdmin();
};

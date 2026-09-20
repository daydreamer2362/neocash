import { subscribeSecurityEvents, SecurityEvent } from './securityMonitor';
import { getSecurityRuntimeConfig } from './securityConfig';

type RuntimeConfig = {
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  telegramThreadId: string;
  telegramMinSeverity: 'low' | 'medium' | 'high' | 'critical';
  slackEnabled: boolean;
  slackWebhookUrl: string;
};

let config: RuntimeConfig = {
  telegramEnabled: true,
  telegramBotToken: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  telegramChatId: String(process.env.TELEGRAM_CHAT_ID || '').trim(),
  telegramThreadId: String(process.env.TELEGRAM_THREAD_ID || '').trim(),
  telegramMinSeverity: 'medium',
  slackEnabled: false,
  slackWebhookUrl: String(process.env.SLACK_ALERT_WEBHOOK_URL || '').trim(),
};

const severityRank: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const DEDUPE_WINDOW_MS = Number(process.env.TELEGRAM_ALERT_DEDUPE_MS || 30000);
const FLUSH_INTERVAL_MS = Number(process.env.TELEGRAM_ALERT_FLUSH_MS || 2000);

const queue: SecurityEvent[] = [];
const dedupeMap = new Map<string, number>();
let timer: NodeJS.Timeout | null = null;
let running = false;
let inited = false;

const now = () => Date.now();

const toFingerprint = (item: SecurityEvent) => [
  item.type,
  item.severity,
  item.path || '',
  item.ip || '',
  item.method || '',
].join('|');

const pruneDedupe = () => {
  const ts = now();
  for (const [key, last] of dedupeMap.entries()) {
    if (ts - last > DEDUPE_WINDOW_MS) dedupeMap.delete(key);
  }
};

const formatMessage = (event: SecurityEvent) => {
  const lines = [
    `SECURITY ALERT`,
    `Severity: ${String(event.severity).toUpperCase()}`,
    `Type: ${event.type}`,
    `Time: ${new Date(event.createdAt).toISOString()}`,
    `IP: ${event.ip || '-'}`,
    `Method: ${event.method || '-'}`,
    `Path: ${event.path || '-'}`,
    `Message: ${event.message}`,
  ];
  if (event.userAgent) lines.push(`UA: ${String(event.userAgent).slice(0, 140)}`);
  return lines.join('\n');
};

const sendTelegram = async (text: string) => {
  if (!config.telegramEnabled || !config.telegramBotToken || !config.telegramChatId) return;
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  const payload: Record<string, any> = {
    chat_id: config.telegramChatId,
    text,
    disable_web_page_preview: true,
  };
  if (config.telegramThreadId) payload.message_thread_id = Number(config.telegramThreadId);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram API failed: ${res.status} ${body}`);
  }
};

const sendSlack = async (text: string) => {
  if (!config.slackEnabled || !config.slackWebhookUrl) return;
  const res = await fetch(config.slackWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Slack webhook failed: ${res.status} ${body}`);
  }
};

const dispatchEvent = async (item: SecurityEvent) => {
  const text = formatMessage(item);
  await Promise.all([
    sendTelegram(text),
    sendSlack(text),
  ]);
};

const flushQueue = async () => {
  if (!queue.length || running) return;
  running = true;
  try {
    while (queue.length) {
      const item = queue.shift()!;
      await dispatchEvent(item);
    }
  } catch (error) {
    console.error('[telegram-alerts] flush failed', error);
  } finally {
    running = false;
  }
};

export const reloadAlertDispatchConfig = async () => {
  try {
    const runtime = await getSecurityRuntimeConfig();
    config = {
      telegramEnabled: runtime.telegramEnabled,
      telegramBotToken: runtime.telegramBotToken,
      telegramChatId: runtime.telegramChatId,
      telegramThreadId: runtime.telegramThreadId,
      telegramMinSeverity: runtime.telegramMinSeverity,
      slackEnabled: runtime.slackEnabled,
      slackWebhookUrl: runtime.slackWebhookUrl,
    };
  } catch (error) {
    console.error('[telegram-alerts] failed to reload runtime config', error);
  }
};

export const initTelegramSecurityForwarder = () => {
  if (inited) return () => {};
  inited = true;
  const unsubscribe = subscribeSecurityEvents((event) => {
    const minRank = severityRank[config.telegramMinSeverity] || 1;
    const rank = severityRank[event.severity] || 1;
    if (rank < minRank) return;

    pruneDedupe();
    const fp = toFingerprint(event);
    const last = dedupeMap.get(fp) || 0;
    if (now() - last < DEDUPE_WINDOW_MS) return;
    dedupeMap.set(fp, now());

    queue.push(event);
  });

  timer = setInterval(() => {
    flushQueue().catch((error) => console.error('[telegram-alerts] timer flush failed', error));
  }, FLUSH_INTERVAL_MS);

  reloadAlertDispatchConfig()
    .then(async () => {
      await dispatchEvent({
        id: `boot-${Date.now()}`,
        type: 'ALERT_FORWARDER_ONLINE',
        severity: 'low',
        message: 'Gamma Pay security alert forwarder online',
        createdAt: new Date(),
        resolvedAt: null,
      });
    })
    .catch((error) => console.error('[telegram-alerts] startup config load failed', error));

  return () => {
    unsubscribe();
    if (timer) clearInterval(timer);
    timer = null;
  };
};

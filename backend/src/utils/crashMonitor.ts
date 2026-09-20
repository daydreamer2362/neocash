import { recordSecurityEvent } from './securityMonitor';

const MAX_MESSAGE_LEN = 240;
const MAX_STACK_LEN = 4000;

const safeString = (value: unknown, fallback = 'Unknown error') => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return raw.length > MAX_MESSAGE_LEN ? `${raw.slice(0, MAX_MESSAGE_LEN)}...` : raw;
};

const sanitizeErrorMessage = (value: unknown) => {
  const message = safeString(value, 'Unexpected server error');
  return message
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi, '[host]');
};

const baseMeta = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: safeString(error.name, 'Error'),
      message: safeString(error.message, 'Unknown error'),
      stack: safeString(error.stack || '', '').slice(0, MAX_STACK_LEN),
    };
  }
  return {
    name: typeof error,
    message: safeString(error, 'Unknown error'),
  };
};

export const registerProcessCrashHandlers = () => {
  process.on('unhandledRejection', (reason: unknown) => {
    const meta = baseMeta(reason);
    recordSecurityEvent({
      type: 'PROCESS_UNHANDLED_REJECTION',
      severity: 'critical',
      message: sanitizeErrorMessage(meta.message),
      meta,
    });
    console.error('[PROCESS_UNHANDLED_REJECTION]', reason);
  });

  process.on('uncaughtException', (error: Error) => {
    const meta = baseMeta(error);
    recordSecurityEvent({
      type: 'PROCESS_UNCAUGHT_EXCEPTION',
      severity: 'critical',
      message: sanitizeErrorMessage(meta.message),
      meta,
    });
    console.error('[PROCESS_UNCAUGHT_EXCEPTION]', error);

    if (String(process.env.CRASH_ON_UNCAUGHT_EXCEPTION || '').toLowerCase() === 'true') {
      setTimeout(() => process.exit(1), 500);
    }
  });
};


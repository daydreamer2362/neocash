import crypto from 'crypto';

const PREFIX = 'enc:v1:';
const RAW_KEY = String(process.env.SECURITY_SETTINGS_ENCRYPTION_KEY || '').trim();

const deriveKey = () => {
  if (!RAW_KEY) return null;
  return crypto.createHash('sha256').update(RAW_KEY).digest();
};

const KEY = deriveKey();

const toB64 = (buf: Buffer) => buf.toString('base64url');
const fromB64 = (value: string) => Buffer.from(value, 'base64url');

export const encryptSettingValue = (value: string) => {
  if (!KEY || !value) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${toB64(iv)}:${toB64(enc)}:${toB64(tag)}`;
};

export const decryptSettingValue = (value: string) => {
  const text = String(value || '');
  if (!text.startsWith(PREFIX) || !KEY) return text;
  try {
    const raw = text.slice(PREFIX.length);
    const [ivRaw, encRaw, tagRaw] = raw.split(':');
    if (!ivRaw || !encRaw || !tagRaw) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, fromB64(ivRaw));
    decipher.setAuthTag(fromB64(tagRaw));
    const out = Buffer.concat([decipher.update(fromB64(encRaw)), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return '';
  }
};

export const hasEncryptionKey = Boolean(KEY);

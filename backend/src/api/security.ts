import { Router, Request, Response } from 'express';
import { recordSecurityEvent } from '../utils/securityMonitor';
import { getSecurityRuntimeConfig } from '../utils/securityConfig';

const router = Router();

const normalizeSeverity = (input: unknown): 'low' | 'medium' | 'high' | 'critical' => {
  const value = String(input || '').toLowerCase();
  if (value === 'critical') return 'critical';
  if (value === 'high') return 'high';
  if (value === 'medium') return 'medium';
  return 'low';
};

const mapWazuhLevelToSeverity = (level: unknown) => {
  const num = Number(level || 0);
  if (num >= 12) return 'critical';
  if (num >= 8) return 'high';
  if (num >= 5) return 'medium';
  return 'low';
};

const checkIngestKey = async (req: Request, res: Response) => {
  const runtime = await getSecurityRuntimeConfig();
  if (!runtime.securityIngestKey) {
    recordSecurityEvent({
      type: 'SECURITY_INGEST_MISCONFIGURED',
      severity: 'high',
      message: 'Security ingest endpoint called but SECURITY_INGEST_KEY is not configured',
      ip: String(req.ip || req.socket.remoteAddress || ''),
      method: String(req.method || ''),
      path: String(req.originalUrl || req.url || ''),
      userAgent: String(req.headers['user-agent'] || ''),
    });
    res.status(503).json({ code: 5701, msg: 'SECURITY_INGEST_KEY is not configured' });
    return { ok: false, runtime };
  }
  const incoming = String(req.headers['x-security-key'] || req.query.key || '').trim();
  if (!incoming || incoming !== runtime.securityIngestKey) {
    recordSecurityEvent({
      type: 'SECURITY_INGEST_KEY_REJECTED',
      severity: 'critical',
      message: `Rejected external security ingest request on ${String(req.originalUrl || req.url || '')}`,
      ip: String(req.ip || req.socket.remoteAddress || ''),
      method: String(req.method || ''),
      path: String(req.originalUrl || req.url || ''),
      userAgent: String(req.headers['user-agent'] || ''),
      meta: {
        hasKey: Boolean(incoming),
      },
    });
    res.status(401).json({ code: 5702, msg: 'Invalid security ingest key' });
    return { ok: false, runtime };
  }
  return { ok: true, runtime };
};

// POST /internal/security/event
router.post('/event', (req: Request, res: Response) => {
  checkIngestKey(req, res).then(({ ok }) => {
    if (!ok) return;
    const body = req.body || {};
    const event = recordSecurityEvent({
      type: String(body.type || 'EXTERNAL_SECURITY_EVENT').toUpperCase(),
      severity: normalizeSeverity(body.severity),
      message: String(body.message || 'External security event'),
      ip: String(body.ip || req.ip || ''),
      method: String(body.method || ''),
      path: String(body.path || ''),
      userAgent: String(body.userAgent || req.headers['user-agent'] || ''),
      meta: typeof body.meta === 'object' && body.meta ? body.meta : { payload: body },
    });
    res.json({ code: 1000, msg: 'ok', data: event });
  }).catch(() => {
    res.status(500).json({ code: 5703, msg: 'Security ingest failed' });
  });
});

// POST /internal/security/wazuh
router.post('/wazuh', (req: Request, res: Response) => {
  checkIngestKey(req, res).then(({ ok, runtime }) => {
    if (!ok) return;
    if (!runtime.wazuhEnabled) {
      res.status(403).json({ code: 5704, msg: 'Wazuh ingest is disabled' });
      return;
    }

    const payload: any = req.body || {};
    const rule = payload.rule || payload.data?.rule || {};
    const agent = payload.agent || payload.data?.agent || {};
    const data = payload.data || {};
    const src = payload.srcip || data.srcip || data.src_ip || '';
    const fullLog = payload.full_log || data.full_log || '';

    const event = recordSecurityEvent({
      type: String(rule.id || payload.decoder?.name || 'WAZUH_ALERT').toUpperCase(),
      severity: mapWazuhLevelToSeverity(rule.level),
      message: String(rule.description || payload.description || 'Wazuh intrusion alert'),
      ip: String(src || req.ip || ''),
      method: String(data.method || ''),
      path: String(data.url || data.path || ''),
      userAgent: String(data.user_agent || req.headers['user-agent'] || ''),
      meta: {
        wazuh: true,
        level: Number(rule.level || 0),
        agent: agent?.name || null,
        groups: rule.groups || [],
        fullLog: String(fullLog || '').slice(0, 2000),
      },
    });

    res.json({ code: 1000, msg: 'wazuh-ingested', data: { id: event.id } });
  }).catch(() => {
    res.status(500).json({ code: 5705, msg: 'Wazuh ingest failed' });
  });
});

export default router;

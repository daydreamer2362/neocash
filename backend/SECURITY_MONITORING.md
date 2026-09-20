# Gamma Pay Security Monitoring Setup

## 1) Enable Telegram real-time alerts

Set these in `backend/.env`:

```
TELEGRAM_BOT_TOKEN=123456:your_bot_token
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_THREAD_ID=
TELEGRAM_ALERT_MIN_SEVERITY=medium
TELEGRAM_ALERT_DEDUPE_MS=30000
TELEGRAM_ALERT_FLUSH_MS=2000
```

Restart backend. On boot, you should receive a "security forwarder online" message.

## 2) Enable secure external ingestion key

Set:

```
SECURITY_INGEST_KEY=use-a-long-random-secret
```

Ingestion endpoints:

- `POST /internal/security/event`
- `POST /internal/security/wazuh`

Headers required:

- `x-security-key: <SECURITY_INGEST_KEY>`

## 3) Wazuh integration (manager -> Gamma Pay backend)

Configure Wazuh integration/webhook to send alert JSON to:

```
https://<your-api-domain>/internal/security/wazuh
```

With header:

```
x-security-key: <SECURITY_INGEST_KEY>
```

Wazuh alert `rule.level` is mapped to severity:

- `>=12` => `critical`
- `>=8` => `high`
- `>=5` => `medium`
- `<5` => `low`

## 4) Admin panel monitoring

Open admin panel and use:

- `Security Integrations` page:
  - Configure Telegram, Slack webhook, Wazuh toggle, Prometheus toggle
  - Set/rotate `SECURITY_INGEST_KEY`
- `Security Monitor` page:
  - Live unresolved security alerts and severity counters
- `Network Monitor` page:
  - Requests/minute, error rate, latency, active IPs
  - Top IPs, top paths, status-code distribution
  - Auto refresh every 3 seconds

## 4.1) Prometheus + Grafana

- Metrics endpoint: `GET /metrics`
- Toggle in admin: `Security Integrations -> Prometheus Metrics`
- Add this endpoint as a scrape target in Prometheus
- Build Grafana dashboards from `navypay_*` metric series

## 5) Quick API test

```bash
curl -X POST "http://localhost:3000/internal/security/event" \
  -H "Content-Type: application/json" \
  -H "x-security-key: <SECURITY_INGEST_KEY>" \
  -d '{"type":"MANUAL_TEST","severity":"high","message":"test alert","ip":"1.2.3.4","path":"/test"}'
```

This should appear in:

- Admin `Security Monitor`
- Telegram (if configured and severity >= threshold)

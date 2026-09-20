import { config } from './config';
import { auth } from './auth';

class EventEmitter {
  constructor() {
    this.events = {};
  }
  on(event, listener) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(listener);
  }
  off(event, listener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }
  emit(event, ...args) {
    if (!this.events[event]) return;
    this.events[event].forEach(listener => listener(...args));
  }
}

export const wsClient = new EventEmitter();
let socket = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let retryCount = 0;
let isIntentionalClose = false;
let hasLoggedDisabledReason = false;

const MAX_RECONNECT_DELAY = 15000;
const HEARTBEAT_INTERVAL = 15000;

function looksLikeLocalViteHost() {
  if (typeof window === 'undefined') return false;
  const host = String(window.location.hostname || '').toLowerCase();
  const port = String(window.location.port || '');
  return (host === 'localhost' || host === '127.0.0.1') && /^5\d{3}$/.test(port);
}

function normalizeWsBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^wss?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/^http/i, 'ws').replace(/\/+$/, '');
  }
  return '';
}

function resolveSocketBaseUrl() {
  const explicit = normalizeWsBaseUrl(config.wsBaseURL);
  if (explicit) return explicit;

  if (config.baseURL) {
    return normalizeWsBaseUrl(config.baseURL);
  }

  if (looksLikeLocalViteHost()) return '';

  if (typeof window === 'undefined') return '';
  const origin = String(window.location.origin || '').trim();
  if (!origin) return '';
  return origin.replace(/^http/i, 'ws').replace(/\/+$/, '');
}

function appendToken(url, token) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

export function connectWS() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  isIntentionalClose = false;
  const token = auth.getToken();
  if (!token) return;

  const baseUrl = resolveSocketBaseUrl();
  if (!baseUrl) {
    if (!hasLoggedDisabledReason) {
      console.info('WS disabled: set VITE_WS_BASE_URL to a backend websocket endpoint.');
      hasLoggedDisabledReason = true;
    }
    return;
  }
  const url = appendToken(baseUrl, token);
  
  try {
    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log('WS Connected');
      retryCount = 0;
      startHeartbeat();
      wsClient.emit('open');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'pong') {
          wsClient.emit('message', data);
        }
      } catch (e) {
        console.error('WS MSG Parse Error:', e);
      }
    };

    socket.onclose = (event) => {
      console.log('WS Closed', event.code, event.reason);
      stopHeartbeat();
      socket = null;
      wsClient.emit('close', event);

      if (!isIntentionalClose) {
        scheduleReconnect();
      }
    };

    socket.onerror = (error) => {
      console.error('WS Error:', error);
      wsClient.emit('error', error);
    };
  } catch (err) {
    console.error('WS Connect Err:', err);
    scheduleReconnect();
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'ping',
        ts: Date.now(),
        from: 'ws.js'
      }));
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(1000 * Math.pow(1.5, retryCount), MAX_RECONNECT_DELAY);
  retryCount++;
  console.log(`WS Reconnecting in ${delay}ms...`);
  reconnectTimer = setTimeout(() => {
    connectWS();
  }, delay);
}

export function disconnectWS() {
  isIntentionalClose = true;
  stopHeartbeat();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (socket) {
    socket.close();
    socket = null;
  }
}

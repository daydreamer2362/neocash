import type { Server as HttpServer } from 'http';
import type { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyUserToken } from '../middleware/auth';

// ─── LIVE ORDER UPDATES (WebSocket) ──────────────────
// One user can have several open sockets (multiple tabs/devices).
const userSockets = new Map<string, Set<WebSocket>>();

const HEARTBEAT_INTERVAL_MS = 30_000;

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
  userId?: string;
}

const addSocket = (userId: string, socket: TrackedSocket) => {
  let set = userSockets.get(userId);
  if (!set) {
    set = new Set();
    userSockets.set(userId, set);
  }
  set.add(socket);
};

const removeSocket = (userId: string, socket: TrackedSocket) => {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) userSockets.delete(userId);
};

const extractToken = (req: IncomingMessage): string => {
  try {
    const url = new URL(req.url || '', 'http://internal');
    return String(url.searchParams.get('token') || url.searchParams.get('access_token') || '').trim();
  } catch {
    return '';
  }
};

export const initWebSocketServer = (server: HttpServer): WebSocketServer => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (socket: TrackedSocket, req: IncomingMessage) => {
    const token = extractToken(req);
    const decoded = verifyUserToken(token);

    if (!decoded?.id) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    socket.userId = decoded.id;
    socket.isAlive = true;
    addSocket(decoded.id, socket);

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('message', (raw) => {
      let data: any = null;
      try {
        data = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (data?.type === 'ping') {
        try {
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        } catch {
          // socket may have closed between the check and the send; ignore
        }
      }
    });

    socket.on('close', () => {
      if (socket.userId) removeSocket(socket.userId, socket);
    });

    socket.on('error', () => {
      if (socket.userId) removeSocket(socket.userId, socket);
    });
  });

  // Drop dead connections that never respond to a protocol-level ping
  // (e.g. the client's tab was closed without a clean disconnect).
  const heartbeat = setInterval(() => {
    wss.clients.forEach((client) => {
      const socket = client as TrackedSocket;
      if (socket.isAlive === false) {
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
};

/** Push a JSON payload to every open socket for a given user. No-op if the user isn't connected. */
export const pushToUser = (userId: string | null | undefined, payload: Record<string, unknown>): void => {
  const key = String(userId || '').trim();
  if (!key) return;
  const sockets = userSockets.get(key);
  if (!sockets || sockets.size === 0) return;
  const message = JSON.stringify(payload);
  sockets.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(message);
      } catch {
        // ignore send failures on a socket that's mid-teardown
      }
    }
  });
};

/** Convenience helper for order lifecycle events consumed by the frontend's Payment page. */
export const pushOrderUpdate = (
  userId: string | null | undefined,
  order: { buyId?: string | null; orderNo?: string | null; status: string; [key: string]: unknown },
): void => {
  pushToUser(userId, {
    type: 'ORDER_UPDATE',
    ts: Date.now(),
    ...order,
  });
};

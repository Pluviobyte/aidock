import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const MAGIC = '258EAFA5-E914-47DA-95CA-5AB9F0F8DC04';

// --- Message types ---
export type WsMessageType =
  | 'task_update'
  | 'handoff_created'
  | 'agent_status'
  | 'process_log';

export interface WsMessage {
  type: WsMessageType;
  data: Record<string, unknown>;
  timestamp: string;
}

// --- Throttle config per message type ---
const THROTTLE_MS: Record<WsMessageType, number> = {
  task_update: 500,
  handoff_created: 0,       // immediate
  agent_status: 1000,
  process_log: 200,
};

// --- Broadcast metrics ---
export const metrics = {
  sent: 0,
  throttled: 0,
  deduped: 0,
};

export class WebSocketServer {
  private clients: Set<Duplex> = new Set();
  private lastSent: Map<string, { time: number; hash: string }> = new Map();

  handleUpgrade(req: IncomingMessage, socket: Duplex): void {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }

    const accept = createHash('sha1')
      .update(key + MAGIC)
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n'
    );

    this.clients.add(socket);

    socket.on('data', (buf: Buffer) => {
      const opcode = buf[0] & 0x0f;
      if (opcode === 0x9) {
        // Ping → Pong
        const pong = Buffer.from(buf);
        pong[0] = (pong[0] & 0xf0) | 0xa;
        socket.write(pong);
      }
      if (opcode === 0x8) {
        // Close
        this.clients.delete(socket);
        socket.end();
      }
    });

    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
  }

  broadcast(type: WsMessageType, data: Record<string, unknown>): void {
    const now = Date.now();
    const throttleMs = THROTTLE_MS[type] ?? 0;

    // Throttle check
    if (throttleMs > 0) {
      const last = this.lastSent.get(type);
      if (last && now - last.time < throttleMs) {
        // Dedup check — skip if same content
        const hash = this.hashData(data);
        if (last.hash === hash) {
          metrics.deduped++;
          return;
        }
        metrics.throttled++;
        return;
      }
    }

    const message: WsMessage = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    const payload = JSON.stringify(message);
    const frame = this.encodeFrame(payload);
    const hash = this.hashData(data);

    this.lastSent.set(type, { time: now, hash });

    for (const client of this.clients) {
      try {
        client.write(frame);
        metrics.sent++;
      } catch {
        this.clients.delete(client);
      }
    }
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  private hashData(data: Record<string, unknown>): string {
    const sorted = JSON.stringify(data, Object.keys(data).sort());
    return createHash('md5').update(sorted).digest('hex').slice(0, 8);
  }

  private encodeFrame(text: string): Buffer {
    const payload = Buffer.from(text, 'utf-8');
    const len = payload.length;

    let header: Buffer;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    return Buffer.concat([header, payload]);
  }
}

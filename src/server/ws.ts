import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

// Minimal WebSocket server (no dependencies)
// Supports: upgrade handshake, text frames, ping/pong, close

const MAGIC = '258EAFA5-E914-47DA-95CA-5AB9F0F8DC04';

export class WebSocketServer {
  private clients: Set<Duplex> = new Set();

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
      // Ping → Pong
      if (opcode === 0x9) {
        const pong = Buffer.from(buf);
        pong[0] = (pong[0] & 0xf0) | 0xa;
        socket.write(pong);
      }
      // Close
      if (opcode === 0x8) {
        this.clients.delete(socket);
        socket.end();
      }
    });

    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
  }

  broadcast(data: Record<string, unknown>): void {
    const payload = JSON.stringify(data);
    const frame = this.encodeFrame(payload);

    for (const client of this.clients) {
      try {
        client.write(frame);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  private encodeFrame(text: string): Buffer {
    const payload = Buffer.from(text, 'utf-8');
    const len = payload.length;

    let header: Buffer;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + text opcode
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

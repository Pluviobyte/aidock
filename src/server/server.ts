import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { ApiRouter } from './api.js';
import { WebSocketServer } from './ws.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function startServer(cwd: string, port: number): void {
  const api = new ApiRouter(cwd);
  const wss = new WebSocketServer();

  // Web frontend directory — resolve from project root
  const webDir = join(__dirname, '..', '..', 'web');

  const server = createServer(async (req, res) => {
    // API routes
    const handled = await api.handle(req, res);
    if (handled) return;

    // Static file serving
    let filePath = req.url === '/' ? '/index.html' : (req.url ?? '/');
    // Strip query strings
    filePath = filePath.split('?')[0];

    const fullPath = join(webDir, filePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(webDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (existsSync(fullPath)) {
      const ext = extname(fullPath);
      const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
      const content = readFileSync(fullPath);
      res.writeHead(200, { 'Content-Type': mime });
      res.end(content);
    } else {
      // SPA fallback: serve index.html for non-API, non-file routes
      const indexPath = join(webDir, 'index.html');
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    }
  });

  // WebSocket upgrade
  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`\n  aidock dashboard running at:\n`);
    console.log(`  http://localhost:${port}\n`);
    console.log(`  API:  http://localhost:${port}/api/status`);
    console.log(`  WS:   ws://localhost:${port}/ws\n`);
  });
}

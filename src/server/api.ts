import type { IncomingMessage, ServerResponse } from 'node:http';
import { Store } from '../core/store.js';
import { TaskManager } from '../core/task-manager.js';
import { HandoffEngine } from '../core/handoff-engine.js';
import { detectAll } from '../adapters/detect.js';

export class ApiRouter {
  private store: Store;
  private taskManager: TaskManager;
  private handoffEngine: HandoffEngine;

  constructor(cwd: string) {
    this.store = new Store(cwd);
    this.taskManager = new TaskManager(this.store);
    this.handoffEngine = new HandoffEngine(this.store, this.taskManager);
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const path = url.pathname;

    if (!path.startsWith('/api/')) return false;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    try {
      if (path === '/api/status') {
        const agents = await detectAll();
        this.json(res, { agents });
      } else if (path === '/api/tasks') {
        const agent = url.searchParams.get('agent') ?? undefined;
        const status = url.searchParams.get('status') ?? undefined;
        const tasks = this.taskManager.list({ agent: agent as any, status: status as any });
        this.json(res, tasks);
      } else if (path.match(/^\/api\/tasks\/([^/]+)$/)) {
        const id = path.split('/')[3];
        const task = this.taskManager.get(id);
        if (!task) { this.notFound(res, 'Task not found'); return true; }
        // Include logs
        const stdout = this.store.readLog(id, 'stdout');
        const stderr = this.store.readLog(id, 'stderr');
        this.json(res, { ...task, logs: { stdout, stderr } });
      } else if (path === '/api/handoffs') {
        const handoffs = this.handoffEngine.list();
        this.json(res, handoffs);
      } else if (path.match(/^\/api\/handoffs\/chain\/([^/]+)$/)) {
        const id = path.split('/')[4];
        const chain = this.handoffEngine.getChain(id);
        this.json(res, chain);
      } else if (path.match(/^\/api\/handoffs\/([^/]+)$/)) {
        const id = path.split('/')[3];
        const handoff = this.handoffEngine.get(id);
        if (!handoff) { this.notFound(res, 'Handoff not found'); return true; }
        this.json(res, handoff);
      } else {
        this.notFound(res, 'Unknown API endpoint');
      }
    } catch (e: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }

    return true;
  }

  private json(res: ServerResponse, data: unknown): void {
    res.writeHead(200);
    res.end(JSON.stringify(data, null, 2));
  }

  private notFound(res: ServerResponse, message: string): void {
    res.writeHead(404);
    res.end(JSON.stringify({ error: message }));
  }
}

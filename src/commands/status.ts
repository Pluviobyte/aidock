import { Store } from '../core/store.js';
import { TaskManager } from '../core/task-manager.js';
import * as log from '../utils/logger.js';

export function runStatus(cwd: string, opts: { json?: boolean; agent?: string }): void {
  const store = new Store(cwd);

  if (!store.isInitialized()) {
    log.error('Not initialized. Run `aidock init` first.');
    process.exit(1);
  }

  const taskManager = new TaskManager(store);
  const filter: any = {};
  if (opts.agent) filter.agent = opts.agent;

  const tasks = taskManager.list(filter);

  if (opts.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return;
  }

  if (tasks.length === 0) {
    log.info('No tasks yet. Run `aidock assign <agent> "<prompt>"` to create one.');
    return;
  }

  const rows = tasks.map(t => ({
    ID: t.id,
    Agent: t.agent,
    Status: t.status,
    Duration: t.result ? `${t.result.duration.toFixed(1)}s` : '-',
    Files: t.result ? String(t.result.filesChanged.length) : '-',
    Prompt: t.prompt.length > 50 ? t.prompt.slice(0, 47) + '...' : t.prompt,
  }));

  log.table(rows);
  console.log(`\nTotal: ${tasks.length} task(s)`);
}

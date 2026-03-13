import { Store } from '../core/store.js';
import { TaskManager } from '../core/task-manager.js';
import { HandoffEngine } from '../core/handoff-engine.js';
import * as log from '../utils/logger.js';

export function runHistory(cwd: string, opts: { agent?: string; json?: boolean }): void {
  const store = new Store(cwd);
  if (!store.isInitialized()) {
    log.error('Not initialized. Run `aidock init` first.');
    process.exit(1);
  }

  const taskManager = new TaskManager(store);
  const handoffEngine = new HandoffEngine(store, taskManager);

  const filter: any = {};
  if (opts.agent) filter.agent = opts.agent;
  const tasks = taskManager.list(filter);
  const handoffs = handoffEngine.list();

  if (opts.json) {
    console.log(JSON.stringify({ tasks, handoffs }, null, 2));
    return;
  }

  if (tasks.length === 0) {
    log.info('No task history.');
    return;
  }

  // Build timeline
  const events: Array<{ time: string; type: string; detail: string }> = [];

  for (const task of tasks) {
    events.push({
      time: task.createdAt,
      type: `[${task.agent}]`,
      detail: `${task.id} ${task.status} — ${task.prompt.slice(0, 60)}`,
    });
  }

  for (const h of handoffs) {
    const fromTask = taskManager.get(h.fromTask);
    events.push({
      time: h.createdAt,
      type: '[handoff]',
      detail: `${h.id}: ${fromTask?.agent ?? '?'} → ${h.toAgent} — ${h.summary.split('\n')[0].slice(0, 50)}`,
    });
  }

  // Sort by time
  events.sort((a, b) => a.time.localeCompare(b.time));

  console.log(`\n  Task History (${events.length} events)\n`);
  for (const e of events) {
    const time = new Date(e.time).toLocaleTimeString();
    console.log(`  ${time}  ${e.type.padEnd(10)} ${e.detail}`);
  }
  console.log('');
}

import { Store } from '../core/store.js';
import { TaskManager } from '../core/task-manager.js';
import { ContextCollector } from '../core/context-collector.js';
import { getAdapter } from '../adapters/detect.js';
import { buildPrompt } from '../utils/prompt-builder.js';
import { getChangedFiles, getDiffStats } from '../utils/git.js';
import { classifyError } from '../adapters/base-adapter.js';
import type { RetryRecord } from '../types/task.js';
import * as log from '../utils/logger.js';

export interface RetryOptions {
  cwd: string;
  timeout?: number;
  model?: string;
}

export async function runRetry(taskId: string, opts: RetryOptions): Promise<void> {
  const store = new Store(opts.cwd);
  if (!store.isInitialized()) {
    log.error('Not initialized. Run `aidock init` first.');
    process.exit(1);
  }

  const taskManager = new TaskManager(store);
  const task = taskManager.get(taskId);

  if (!task) {
    log.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  if (task.status !== 'failed') {
    log.error(`Task ${taskId} is not failed (status: ${task.status}). Only failed tasks can be retried.`);
    process.exit(1);
  }

  const attempt = (task.attempt ?? 1) + 1;
  const retryHistory: RetryRecord[] = task.retryHistory ?? [];

  // Record previous failure
  if (task.result) {
    retryHistory.push({
      attempt: task.attempt ?? 1,
      error: task.result.stderr.slice(0, 500),
      exitCode: task.result.exitCode,
      errorCategory: task.result.errorCategory ?? classifyError(task.result.stderr, task.result.exitCode),
      timestamp: task.completedAt ?? new Date().toISOString(),
    });
  }

  log.info(`Retrying ${taskId} (attempt ${attempt}, ${retryHistory.length} previous failure(s))`);

  // Show previous error
  const lastFailure = retryHistory[retryHistory.length - 1];
  if (lastFailure) {
    log.warn(`Previous failure [${lastFailure.errorCategory}]: ${lastFailure.error.split('\n')[0]}`);
  }

  const config = store.loadConfig();
  const adapter = getAdapter(task.agent);

  // Check availability
  const status = await adapter.detect();
  if (!status.available) {
    log.error(`${task.agent} CLI is not installed`);
    process.exit(1);
  }

  // Collect fresh context
  const collector = new ContextCollector(task.cwd);
  const fullPrompt = buildPrompt({
    task: task.prompt,
    projectContext: collector.collect(),
  });

  // Reset task to running
  taskManager.start(taskId);
  // Update attempt counter
  const tasks = store.loadTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    tasks[idx].attempt = attempt;
    tasks[idx].retryHistory = retryHistory;
    store.saveTasks(tasks);
  }

  log.agent(task.agent, `Running (attempt ${attempt})...`);

  // Execute
  const result = await adapter.execute(fullPrompt, {
    cwd: task.cwd,
    timeout: opts.timeout || config.defaultTimeout,
    model: opts.model || config.models[task.agent],
    permissionLevel: config.permissionLevel,
  });

  // Store logs
  store.writeLog(taskId, 'stdout', result.rawOutput);
  store.writeLog(taskId, 'stderr', result.rawStderr);

  const filesChanged = result.filesChanged.length > 0
    ? result.filesChanged
    : getChangedFiles(task.cwd);
  const diffStats = getDiffStats(task.cwd);

  const taskResult = {
    exitCode: result.exitCode,
    stdout: result.content,
    stderr: result.rawStderr,
    duration: result.duration,
    filesChanged,
    diffStats,
    errorCategory: result.errorCategory,
  };

  if (result.exitCode === 0) {
    taskManager.complete(taskId, taskResult);
    log.success(`Done on attempt ${attempt} in ${result.duration.toFixed(1)}s. ${filesChanged.length} file(s) changed.`);
  } else {
    taskManager.fail(taskId, taskResult);
    const category = result.errorCategory ?? 'unknown';
    log.error(`Failed again [${category}] (attempt ${attempt}, exit code ${result.exitCode})`);

    // Hint for specific error categories
    if (category === 'auth') {
      log.info('Hint: Check your authentication. Try logging in again.');
    } else if (category === 'rate_limit') {
      log.info('Hint: Rate limited. Wait a moment before retrying.');
    } else if (category === 'timeout') {
      log.info('Hint: Task timed out. Try increasing --timeout.');
    }
  }

  if (result.content) {
    const preview = result.content.length > 500
      ? result.content.slice(0, 500) + '...'
      : result.content;
    console.log(`\n${preview}\n`);
  }
}

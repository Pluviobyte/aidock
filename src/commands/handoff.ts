import { Store } from '../core/store.js';
import { TaskManager } from '../core/task-manager.js';
import { HandoffEngine } from '../core/handoff-engine.js';
import { ContextCollector } from '../core/context-collector.js';
import { getAdapter, isValidAgent } from '../adapters/detect.js';
import { buildPrompt } from '../utils/prompt-builder.js';
import { getChangedFiles, getDiffStats } from '../utils/git.js';
import type { AgentName } from '../types/agent.js';
import * as log from '../utils/logger.js';

export interface HandoffOptions {
  cwd: string;
  notes?: string;
  prompt?: string;
  timeout?: number;
  model?: string;
  dryRun?: boolean;
}

export async function runHandoff(
  taskId: string,
  toAgent: string,
  opts: HandoffOptions,
): Promise<void> {
  if (!isValidAgent(toAgent)) {
    log.error(`Unknown agent: ${toAgent}. Use: claude, codex, or gemini`);
    process.exit(1);
  }

  const store = new Store(opts.cwd);
  if (!store.isInitialized()) {
    log.error('Not initialized. Run `aidock init` first.');
    process.exit(1);
  }

  const taskManager = new TaskManager(store);
  const handoffEngine = new HandoffEngine(store, taskManager);

  // Generate handoff document
  let handoff;
  try {
    handoff = handoffEngine.generate(taskId, toAgent as AgentName, opts.notes);
  } catch (e: any) {
    log.error(e.message);
    process.exit(1);
  }

  log.success(`Handoff ${handoff.id} created (${taskId} → ${toAgent})`);

  // Show handoff summary
  console.log(`\n  Summary: ${handoff.summary.split('\n')[0]}`);
  console.log(`  Files: ${handoff.relevantFiles.map(f => f.path).join(', ') || 'none'}`);
  if (handoff.issues.length > 0) {
    console.log(`  Issues: ${handoff.issues.length}`);
  }
  console.log('');

  if (opts.dryRun) {
    log.info('Dry run — skipping execution. Handoff document saved.');
    return;
  }

  // Build prompt with handoff context
  const taskPrompt = opts.prompt || `Continue the work from task ${taskId}. See the handoff document above for context.`;
  const contextCollector = new ContextCollector(opts.cwd);

  const fullPrompt = buildPrompt({
    task: taskPrompt,
    handoff,
    projectContext: contextCollector.collect(),
  });

  // Create new task linked to handoff
  const newTask = taskManager.create(
    toAgent as AgentName,
    taskPrompt,
    opts.cwd,
    { parentTaskId: taskId, handoffId: handoff.id },
  );

  const adapter = getAdapter(toAgent as AgentName);
  const config = store.loadConfig();

  // Check availability
  const status = await adapter.detect();
  if (!status.available) {
    log.error(`${toAgent} CLI is not installed`);
    process.exit(1);
  }

  taskManager.start(newTask.id);
  log.agent(toAgent, `Task ${newTask.id} running (handoff from ${taskId})...`);

  // Execute
  const result = await adapter.execute(fullPrompt, {
    cwd: opts.cwd,
    timeout: opts.timeout || config.defaultTimeout,
    model: opts.model || config.models[toAgent as AgentName],
    permissionLevel: config.permissionLevel,
  });

  // Store logs
  store.writeLog(newTask.id, 'stdout', result.rawOutput);
  store.writeLog(newTask.id, 'stderr', result.rawStderr);

  const filesChanged = result.filesChanged.length > 0
    ? result.filesChanged
    : getChangedFiles(opts.cwd);
  const diffStats = getDiffStats(opts.cwd);

  const taskResult = {
    exitCode: result.exitCode,
    stdout: result.content,
    stderr: result.rawStderr,
    duration: result.duration,
    filesChanged,
    diffStats,
  };

  if (result.exitCode === 0) {
    taskManager.complete(newTask.id, taskResult);
    log.success(`Done in ${result.duration.toFixed(1)}s. ${filesChanged.length} file(s) changed.`);
  } else {
    taskManager.fail(newTask.id, taskResult);
    log.error(`Failed (exit code ${result.exitCode}) after ${result.duration.toFixed(1)}s`);
  }

  if (result.content) {
    const preview = result.content.length > 500
      ? result.content.slice(0, 500) + '...'
      : result.content;
    console.log(`\n${preview}\n`);
  }
}

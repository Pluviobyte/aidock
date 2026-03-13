import { Store } from '../core/store.js';
import { TaskManager } from '../core/task-manager.js';
import { ContextCollector } from '../core/context-collector.js';
import { getAdapter, isValidAgent } from '../adapters/detect.js';
import { buildPrompt } from '../utils/prompt-builder.js';
import { getChangedFiles, getDiffStats } from '../utils/git.js';
import type { AgentName } from '../types/agent.js';
import * as log from '../utils/logger.js';

export interface AssignOptions {
  cwd: string;
  timeout?: number;
  model?: string;
  noContext?: boolean;
  verbose?: boolean;
}

export async function runAssign(agentName: string, prompt: string, opts: AssignOptions): Promise<void> {
  // Validate agent
  if (!isValidAgent(agentName)) {
    log.error(`Unknown agent: ${agentName}. Use: claude, codex, or gemini`);
    process.exit(1);
  }

  const agent = agentName as AgentName;
  const store = new Store(opts.cwd);

  // Auto-init if needed
  if (!store.isInitialized()) {
    store.init();
    log.info('Auto-initialized .aidock/');
  }

  const config = store.loadConfig();
  const adapter = getAdapter(agent);

  // Check availability
  const status = await adapter.detect();
  if (!status.available) {
    log.error(`${agent} CLI is not installed or not in PATH`);
    process.exit(1);
  }
  if (!status.supported) {
    log.warn(`${agent} version ${status.version} may not be fully supported (min: ${status.minVersion})`);
  }

  // Create task
  const taskManager = new TaskManager(store);
  const task = taskManager.create(agent, prompt, opts.cwd);
  log.agent(agent, `Task ${task.id} created`);

  // Collect context
  let projectContext: string | undefined;
  if (!opts.noContext) {
    const collector = new ContextCollector(opts.cwd);
    projectContext = collector.collect();
  }

  // Build full prompt
  const fullPrompt = buildPrompt({
    task: prompt,
    projectContext,
  });

  // Start task
  taskManager.start(task.id);
  log.agent(agent, `Running...`);

  const startTime = Date.now();

  // Execute
  const result = await adapter.execute(fullPrompt, {
    cwd: opts.cwd,
    timeout: opts.timeout || config.defaultTimeout,
    model: opts.model || config.models[agent],
    permissionLevel: config.permissionLevel,
  });

  // Store raw logs
  store.writeLog(task.id, 'stdout', result.rawOutput);
  store.writeLog(task.id, 'stderr', result.rawStderr);

  // Get file change stats
  const filesChanged = result.filesChanged.length > 0
    ? result.filesChanged
    : getChangedFiles(opts.cwd);
  const diffStats = getDiffStats(opts.cwd);

  // Complete or fail task
  const taskResult = {
    exitCode: result.exitCode,
    stdout: result.content,
    stderr: result.rawStderr,
    duration: result.duration,
    filesChanged,
    diffStats,
  };

  if (result.exitCode === 0) {
    taskManager.complete(task.id, taskResult);
    log.success(`Done in ${result.duration.toFixed(1)}s. ${filesChanged.length} file(s) changed.`);
  } else {
    taskManager.fail(task.id, taskResult);
    log.error(`Failed (exit code ${result.exitCode}) after ${result.duration.toFixed(1)}s`);
  }

  // Show output preview
  if (result.content) {
    const preview = result.content.length > 500
      ? result.content.slice(0, 500) + '...'
      : result.content;
    console.log(`\n${preview}\n`);
  }

  if (opts.verbose && result.rawStderr) {
    log.info('stderr:');
    console.log(result.rawStderr);
  }
}

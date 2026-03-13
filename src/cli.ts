import { Command } from 'commander';
import { runInit } from './commands/init.js';
import { runDetect } from './commands/detect.js';
import { runAssign } from './commands/assign.js';
import { runStatus } from './commands/status.js';
import { runHandoff } from './commands/handoff.js';
import { runHistory } from './commands/history.js';

const program = new Command();

program
  .name('aidock')
  .description('Multi-AI CLI collaborative development framework')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize .aidock/ in current project')
  .action(() => {
    runInit(process.cwd());
  });

program
  .command('detect')
  .description('Detect installed AI CLIs and their versions')
  .action(async () => {
    await runDetect();
  });

program
  .command('assign')
  .description('Assign a task to an AI agent')
  .argument('<agent>', 'Agent to use: claude, codex, or gemini')
  .argument('<prompt>', 'Task description')
  .option('--cwd <dir>', 'Working directory', process.cwd())
  .option('--timeout <seconds>', 'Execution timeout in seconds', '300')
  .option('--model <model>', 'Override default model')
  .option('--no-context', 'Skip automatic context injection')
  .option('--verbose', 'Show detailed output including stderr')
  .action(async (agent: string, prompt: string, opts: any) => {
    await runAssign(agent, prompt, {
      cwd: opts.cwd,
      timeout: parseInt(opts.timeout),
      model: opts.model,
      noContext: opts.noContext ?? false,
      verbose: opts.verbose,
    });
  });

program
  .command('handoff')
  .description('Hand off a completed task to another agent')
  .argument('<taskId>', 'Source task ID (e.g. t_abc123)')
  .argument('<toAgent>', 'Target agent: claude, codex, or gemini')
  .option('--notes <text>', 'Additional notes for the receiving agent')
  .option('--prompt <text>', 'Override the task prompt for the receiving agent')
  .option('--timeout <seconds>', 'Execution timeout in seconds', '300')
  .option('--model <model>', 'Override default model')
  .option('--dry-run', 'Generate handoff document without executing')
  .action(async (taskId: string, toAgent: string, opts: any) => {
    await runHandoff(taskId, toAgent, {
      cwd: process.cwd(),
      notes: opts.notes,
      prompt: opts.prompt,
      timeout: parseInt(opts.timeout),
      model: opts.model,
      dryRun: opts.dryRun,
    });
  });

program
  .command('status')
  .description('Show task status')
  .option('--json', 'Output as JSON')
  .option('--agent <name>', 'Filter by agent')
  .action((opts: any) => {
    runStatus(process.cwd(), opts);
  });

program
  .command('history')
  .description('Show task and handoff history')
  .option('--agent <name>', 'Filter by agent')
  .option('--json', 'Output as JSON')
  .action((opts: any) => {
    runHistory(process.cwd(), opts);
  });

program
  .command('serve')
  .description('Start the web dashboard')
  .option('--port <port>', 'Port number', '3457')
  .action(async (opts: any) => {
    const { runServe } = await import('./commands/serve.js');
    await runServe(process.cwd(), parseInt(opts.port));
  });

program.parse();

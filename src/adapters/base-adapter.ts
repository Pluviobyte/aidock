import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import type { AgentName, AgentStatus, NormalizedResult, ExecuteOptions } from '../types/agent.js';

// --- Process Manager: track all running child processes ---
const runningProcesses = new Set<ChildProcess>();

function trackProcess(child: ChildProcess): void {
  runningProcesses.add(child);
  child.on('close', () => runningProcesses.delete(child));
  child.on('error', () => runningProcesses.delete(child));
}

export function killAllProcesses(): boolean {
  if (runningProcesses.size === 0) return false;

  const toKill = [...runningProcesses];
  runningProcesses.clear();

  // Phase 1: SIGTERM (graceful)
  for (const child of toKill) {
    if (!child.killed) {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }
  }

  // Phase 2: SIGKILL after 2s (force)
  setTimeout(() => {
    for (const child of toKill) {
      if (!child.killed) {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }
    }
  }, 2000);

  return true;
}

export function getRunningProcessCount(): number {
  return runningProcesses.size;
}

// Cleanup on exit
process.on('exit', () => killAllProcesses());
process.on('SIGINT', () => { killAllProcesses(); process.exit(130); });
process.on('SIGTERM', () => { killAllProcesses(); process.exit(143); });

// --- Error classification ---
export type ErrorCategory = 'auth' | 'rate_limit' | 'timeout' | 'not_found' | 'task_error' | 'unknown';

const ERROR_PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory }> = [
  { pattern: /auth|unauthorized|login|credentials|api.?key/i, category: 'auth' },
  { pattern: /rate.?limit|too many requests|429|throttl/i, category: 'rate_limit' },
  { pattern: /timeout|timed? out|SIGTERM|SIGKILL|exit code 143/i, category: 'timeout' },
  { pattern: /not found|command not found|ENOENT/i, category: 'not_found' },
];

export function classifyError(stderr: string, exitCode: number): ErrorCategory {
  if (exitCode === 143 || exitCode === 137) return 'timeout';
  for (const { pattern, category } of ERROR_PATTERNS) {
    if (pattern.test(stderr)) return category;
  }
  return exitCode !== 0 ? 'task_error' : 'unknown';
}

// --- Output parsing fallback chain ---
export function parseOutputFallback(raw: string): { parsed: any; format: 'json' | 'jsonl' | 'text' } {
  // Attempt 1: Full JSON
  try {
    return { parsed: JSON.parse(raw), format: 'json' };
  } catch { /* fall through */ }

  // Attempt 2: JSONL — find last valid JSON line
  const lines = raw.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      return { parsed, format: 'jsonl' };
    } catch { /* continue */ }
  }

  // Attempt 3: Plain text
  return { parsed: raw, format: 'text' };
}

// --- Base Adapter ---
export abstract class BaseAdapter {
  abstract name: AgentName;
  abstract command: string;
  abstract minVersion: string;

  abstract buildArgs(prompt: string, opts: ExecuteOptions): { args: string[]; useStdin: boolean };
  abstract parseOutput(stdout: string, stderr: string, exitCode: number): NormalizedResult;

  async detect(): Promise<AgentStatus> {
    try {
      const version = execSync(`${this.command} --version 2>/dev/null`, {
        timeout: 10000,
        encoding: 'utf-8',
      }).trim();

      const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
      const versionStr = versionMatch ? versionMatch[1] : version;
      const supported = this.isVersionSupported(versionStr);

      return {
        name: this.name,
        available: true,
        version: versionStr,
        minVersion: this.minVersion,
        supported,
        features: {
          jsonOutput: true,
          streamOutput: supported,
          sessionResume: supported,
        },
        warnings: supported ? [] : [`Version ${versionStr} is below minimum ${this.minVersion}`],
      };
    } catch {
      return {
        name: this.name,
        available: false,
        version: null,
        minVersion: this.minVersion,
        supported: false,
        features: { jsonOutput: false, streamOutput: false, sessionResume: false },
        warnings: [`${this.command} not found in PATH`],
      };
    }
  }

  async execute(prompt: string, opts: ExecuteOptions): Promise<NormalizedResult> {
    const fullPrompt = opts.context ? `${opts.context}\n\n---\n\nTASK: ${prompt}` : prompt;

    let tempFile: string | null = null;

    // For long prompts, write to temp file
    if (fullPrompt.length > 4096) {
      tempFile = join(tmpdir(), `aidock-prompt-${Date.now()}.txt`);
      writeFileSync(tempFile, fullPrompt, 'utf-8');
    }

    const { args, useStdin } = this.buildArgs(
      tempFile ? '' : fullPrompt,
      opts
    );

    const startTime = Date.now();

    try {
      return await new Promise<NormalizedResult>((resolve) => {
        const child = spawn(this.command, args, {
          cwd: opts.cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });

        // Track for lifecycle management
        trackProcess(child);

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        // Timeout: SIGTERM → 2s → SIGKILL
        const timer = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGTERM');
            setTimeout(() => {
              if (!child.killed) child.kill('SIGKILL');
            }, 2000);
          }
        }, opts.timeout * 1000);

        child.on('close', (code) => {
          clearTimeout(timer);
          const duration = (Date.now() - startTime) / 1000;
          const result = this.parseOutput(stdout, stderr, code ?? 1);
          result.duration = duration;
          result.errorCategory = classifyError(stderr, code ?? 1);
          resolve(result);
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          resolve({
            content: '',
            filesChanged: [],
            rawOutput: '',
            rawStderr: err.message,
            exitCode: 1,
            duration: (Date.now() - startTime) / 1000,
            errorCategory: classifyError(err.message, 1),
          });
        });

        // Send prompt via stdin if needed
        if (useStdin || tempFile) {
          child.stdin.write(fullPrompt);
          child.stdin.end();
        }
      });
    } finally {
      if (tempFile) {
        try { unlinkSync(tempFile); } catch { /* ignore */ }
      }
    }
  }

  private isVersionSupported(version: string): boolean {
    const parts = version.split('.').map(Number);
    const minParts = this.minVersion.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((parts[i] ?? 0) > (minParts[i] ?? 0)) return true;
      if ((parts[i] ?? 0) < (minParts[i] ?? 0)) return false;
    }
    return true;
  }
}

import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import type { AgentName, AgentStatus, NormalizedResult, ExecuteOptions } from '../types/agent.js';

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
    const shouldUseStdin = fullPrompt.length >= (opts as any).promptLengthThreshold || 4096;

    let actualPrompt = fullPrompt;
    let tempFile: string | null = null;

    // For long prompts, write to temp file
    if (shouldUseStdin && fullPrompt.length > 4096) {
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

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        const timer = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 3000);
        }, opts.timeout * 1000);

        child.on('close', (code) => {
          clearTimeout(timer);
          const duration = (Date.now() - startTime) / 1000;
          const result = this.parseOutput(stdout, stderr, code ?? 1);
          result.duration = duration;
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
          });
        });

        // Send prompt via stdin if needed
        if (useStdin || tempFile) {
          const input = tempFile ? fullPrompt : fullPrompt;
          child.stdin.write(input);
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

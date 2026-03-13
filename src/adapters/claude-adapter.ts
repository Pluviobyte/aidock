import { BaseAdapter } from './base-adapter.js';
import type { NormalizedResult, ExecuteOptions, PermissionLevel } from '../types/agent.js';

const PERMISSION_MAP: Record<PermissionLevel, string[]> = {
  safe: [],
  auto: ['--permission-mode', 'bypassPermissions'],
  full: ['--permission-mode', 'bypassPermissions'],
};

export class ClaudeAdapter extends BaseAdapter {
  name = 'claude' as const;
  command = 'claude';
  minVersion = '1.0.0';

  buildArgs(prompt: string, opts: ExecuteOptions): { args: string[]; useStdin: boolean } {
    const args: string[] = ['-p'];

    // Output format: json for MVP (complete result)
    args.push('--output-format', 'json');

    // Permission mode
    const permArgs = PERMISSION_MAP[opts.permissionLevel] ?? [];
    args.push(...permArgs);

    // Model override
    if (opts.model) {
      args.push('--model', opts.model);
    }

    // Prompt: short → argument, long → stdin
    if (prompt && prompt.length < 4096) {
      args.push(prompt);
      return { args, useStdin: false };
    }

    return { args, useStdin: true };
  }

  parseOutput(stdout: string, stderr: string, exitCode: number): NormalizedResult {
    let content = stdout;
    let sessionId: string | undefined;

    // Try parsing as JSON (claude -p --output-format json)
    try {
      const parsed = JSON.parse(stdout);
      if (parsed.result) {
        content = parsed.result;
      } else if (typeof parsed === 'string') {
        content = parsed;
      }
      sessionId = parsed.session_id;
    } catch {
      // Not JSON — use raw stdout as content
      content = stdout;
    }

    return {
      content: content.trim(),
      sessionId,
      filesChanged: this.extractFilesFromOutput(content),
      rawOutput: stdout,
      rawStderr: stderr,
      exitCode,
      duration: 0,
    };
  }

  private extractFilesFromOutput(content: string): string[] {
    const files: string[] = [];
    const patterns = [
      /(?:created|modified|wrote|updated)\s+(?:file\s+)?[`"]?([^\s`"]+\.\w+)[`"]?/gi,
      /(?:File|Writing):\s*([^\s]+\.\w+)/gi,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !files.includes(match[1])) {
          files.push(match[1]);
        }
      }
    }
    return files;
  }
}

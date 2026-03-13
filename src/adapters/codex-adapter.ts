import { BaseAdapter } from './base-adapter.js';
import type { NormalizedResult, ExecuteOptions, PermissionLevel } from '../types/agent.js';

const PERMISSION_MAP: Record<PermissionLevel, string[]> = {
  safe: [],
  auto: ['--full-auto'],
  full: ['--full-auto'],
};

export class CodexAdapter extends BaseAdapter {
  name = 'codex' as const;
  command = 'codex';
  minVersion = '0.1.0';

  buildArgs(prompt: string, opts: ExecuteOptions): { args: string[]; useStdin: boolean } {
    const args: string[] = ['exec'];

    // Permission mode
    const permArgs = PERMISSION_MAP[opts.permissionLevel] ?? [];
    args.push(...permArgs);

    // JSON output
    args.push('--json');

    // Model override
    if (opts.model) {
      args.push('--model', opts.model);
    }

    // Working directory
    if (opts.cwd) {
      args.push('-C', opts.cwd);
    }

    // Prompt: short → argument, long → stdin
    if (prompt && prompt.length < 4096) {
      args.push(prompt);
      return { args, useStdin: false };
    }

    // stdin mode
    args.push('-');
    return { args, useStdin: true };
  }

  parseOutput(stdout: string, stderr: string, exitCode: number): NormalizedResult {
    // Codex --json outputs JSONL event stream
    // Extract the final message from the event stream
    const lines = stdout.trim().split('\n').filter(l => l.trim());
    let content = '';
    const filesChanged: string[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line);

        // Extract content from different event types
        if (event.type === 'message' && event.content) {
          content = event.content;
        } else if (event.type === 'turn.completed' || event.type === 'response.completed') {
          if (event.output) content = event.output;
          if (event.result) content = event.result;
        } else if (event.type === 'item.created' || event.type === 'item.completed') {
          if (event.item?.type === 'message' && event.item?.content) {
            const textParts = event.item.content
              .filter((c: any) => c.type === 'output_text' || c.type === 'text')
              .map((c: any) => c.text)
              .join('');
            if (textParts) content = textParts;
          }
        }

        // Track file changes
        if (event.type === 'item.completed' && event.item?.type === 'tool_call') {
          const filePath = event.item?.arguments?.file_path || event.item?.arguments?.path;
          if (filePath && !filesChanged.includes(filePath)) {
            filesChanged.push(filePath);
          }
        }
      } catch {
        // Not JSON line, might be plain text
        if (!content) content += line + '\n';
      }
    }

    // Fallback: if no JSON parsed, use raw stdout
    if (!content) {
      content = stdout;
    }

    return {
      content: content.trim(),
      filesChanged,
      rawOutput: stdout,
      rawStderr: stderr,
      exitCode,
      duration: 0,
    };
  }
}

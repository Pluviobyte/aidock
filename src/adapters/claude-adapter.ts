import { BaseAdapter, parseOutputFallback } from './base-adapter.js';
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
    args.push('--output-format', 'json');

    const permArgs = PERMISSION_MAP[opts.permissionLevel] ?? [];
    args.push(...permArgs);

    if (opts.model) {
      args.push('--model', opts.model);
    }

    if (prompt && prompt.length < 4096) {
      args.push(prompt);
      return { args, useStdin: false };
    }

    return { args, useStdin: true };
  }

  parseOutput(stdout: string, stderr: string, exitCode: number): NormalizedResult {
    const { parsed, format } = parseOutputFallback(stdout);

    let content = stdout;
    let sessionId: string | undefined;

    if (format === 'json' && typeof parsed === 'object' && parsed !== null) {
      content = parsed.result ?? parsed.text ?? JSON.stringify(parsed);
      sessionId = parsed.session_id;
    } else if (format === 'jsonl' && typeof parsed === 'object' && parsed !== null) {
      // Last valid JSON line from stream-json
      content = parsed.result ?? parsed.text ?? parsed.content ?? JSON.stringify(parsed);
      sessionId = parsed.session_id;
    } else {
      content = stdout;
    }

    if (typeof content !== 'string') content = JSON.stringify(content);

    return {
      content: content.trim(),
      sessionId,
      filesChanged: extractFilesFromOutput(content),
      rawOutput: stdout,
      rawStderr: stderr,
      exitCode,
      duration: 0,
    };
  }
}

function extractFilesFromOutput(content: string): string[] {
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

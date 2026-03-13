import { BaseAdapter, parseOutputFallback } from './base-adapter.js';
import type { NormalizedResult, ExecuteOptions, PermissionLevel } from '../types/agent.js';

const PERMISSION_MAP: Record<PermissionLevel, string[]> = {
  safe: [],
  auto: ['--approval-mode', 'yolo'],
  full: ['--approval-mode', 'yolo'],
};

export class GeminiAdapter extends BaseAdapter {
  name = 'gemini' as const;
  command = 'gemini';
  minVersion = '0.1.0';

  buildArgs(prompt: string, opts: ExecuteOptions): { args: string[]; useStdin: boolean } {
    const args: string[] = [];

    const permArgs = PERMISSION_MAP[opts.permissionLevel] ?? [];
    args.push(...permArgs);

    args.push('-o', 'json');

    if (opts.model) {
      args.push('-m', opts.model);
    }

    // Gemini prefers positional argument
    if (prompt && prompt.length < 4096) {
      args.push(prompt);
      return { args, useStdin: false };
    }

    // stdin mode for long prompts
    args.push('-p', '-');
    return { args, useStdin: true };
  }

  parseOutput(stdout: string, stderr: string, exitCode: number): NormalizedResult {
    const { parsed, format } = parseOutputFallback(stdout);

    let content = stdout;

    if (format !== 'text' && typeof parsed === 'object' && parsed !== null) {
      // Try known Gemini JSON structures
      content =
        parsed.response ??
        parsed.result ??
        parsed.text ??
        parsed.candidates?.[0]?.content?.parts?.[0]?.text ??
        (typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
    }

    if (typeof content !== 'string') content = JSON.stringify(content);

    return {
      content: content.trim(),
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

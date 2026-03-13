import { BaseAdapter } from './base-adapter.js';
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

    // Permission mode
    const permArgs = PERMISSION_MAP[opts.permissionLevel] ?? [];
    args.push(...permArgs);

    // Output format: json for MVP
    args.push('-o', 'json');

    // Model override
    if (opts.model) {
      args.push('-m', opts.model);
    }

    // Prompt: short → positional argument (Gemini preferred), long → stdin
    if (prompt && prompt.length < 4096) {
      args.push(prompt);
      return { args, useStdin: false };
    }

    // stdin mode for long prompts
    args.push('-p', '-');
    return { args, useStdin: true };
  }

  parseOutput(stdout: string, stderr: string, exitCode: number): NormalizedResult {
    let content = stdout;

    // Try parsing Gemini JSON output
    try {
      const parsed = JSON.parse(stdout);

      if (typeof parsed === 'string') {
        content = parsed;
      } else if (parsed.response) {
        content = parsed.response;
      } else if (parsed.result) {
        content = parsed.result;
      } else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
        content = parsed.candidates[0].content.parts[0].text;
      } else if (parsed.text) {
        content = parsed.text;
      }
    } catch {
      // Try JSONL stream format
      const lines = stdout.trim().split('\n');
      const lastJsonLine = [...lines].reverse().find(l => {
        try { JSON.parse(l); return true; } catch { return false; }
      });
      if (lastJsonLine) {
        try {
          const parsed = JSON.parse(lastJsonLine);
          content = parsed.response || parsed.result || parsed.text || lastJsonLine;
        } catch {
          content = stdout;
        }
      }
    }

    return {
      content: typeof content === 'string' ? content.trim() : JSON.stringify(content),
      filesChanged: this.extractFilesFromOutput(typeof content === 'string' ? content : ''),
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

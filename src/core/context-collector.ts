import { readFileSync, existsSync } from 'node:fs';
import { isGitRepo, getGitDiff, getChangedFiles, getGitInfo } from '../utils/git.js';
import type { FileContext } from '../types/handoff.js';

const MAX_FILE_LINES = 100;

export class ContextCollector {
  constructor(private cwd: string) {}

  collect(): string {
    const parts: string[] = [];

    if (isGitRepo(this.cwd)) {
      const info = getGitInfo(this.cwd);
      parts.push(`[PROJECT STATE]`);
      parts.push(`Branch: ${info.branch} (${info.sha})`);
      parts.push(`Clean: ${info.clean ? 'yes' : 'no'}`);

      const changedFiles = getChangedFiles(this.cwd);
      if (changedFiles.length > 0) {
        parts.push(`\nChanged files:`);
        changedFiles.forEach(f => parts.push(`  - ${f}`));
      }

      const diff = getGitDiff(this.cwd);
      if (diff) {
        // Truncate diff if too long (keep under 8KB)
        const truncated = diff.length > 8192
          ? diff.slice(0, 8192) + '\n... (diff truncated)'
          : diff;
        parts.push(`\nRecent changes:\n\`\`\`diff\n${truncated}\n\`\`\``);
      }
    }

    return parts.join('\n');
  }

  collectContextFiles(diff: string): FileContext[] {
    const filePattern = /^(?:diff --git a\/(.+?) b\/|[-+]{3} [ab]\/(.+))$/gm;
    const files = new Set<string>();
    let match;

    while ((match = filePattern.exec(diff)) !== null) {
      const file = match[1] || match[2];
      if (file) files.add(file);
    }

    return [...files].map(path => {
      const fullPath = `${this.cwd}/${path}`;
      let snippet: string | undefined;

      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          snippet = lines.slice(0, MAX_FILE_LINES).join('\n');
          if (lines.length > MAX_FILE_LINES) {
            snippet += `\n... (${lines.length - MAX_FILE_LINES} more lines)`;
          }
        } catch { /* skip unreadable files */ }
      }

      return { path, role: 'modified' as const, snippet };
    });
  }
}

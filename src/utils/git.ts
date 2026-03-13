import { execSync } from 'node:child_process';

export function isGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function getGitDiff(cwd: string, baseRef?: string): string {
  if (!isGitRepo(cwd)) return '';
  try {
    if (baseRef) {
      return execSync(`git diff ${baseRef}`, { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
    }
    const staged = execSync('git diff --cached', { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
    const unstaged = execSync('git diff', { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
    return (staged + unstaged).trim();
  } catch {
    return '';
  }
}

export function getChangedFiles(cwd: string): string[] {
  if (!isGitRepo(cwd)) return [];
  try {
    const output = execSync('git diff --name-only HEAD 2>/dev/null || git diff --name-only', {
      cwd, encoding: 'utf-8',
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function getGitInfo(cwd: string): { branch: string; sha: string; clean: boolean } {
  if (!isGitRepo(cwd)) return { branch: 'unknown', sha: 'unknown', clean: true };
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
    const sha = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf-8' }).trim();
    const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' }).trim();
    return { branch, sha, clean: status.length === 0 };
  } catch {
    return { branch: 'unknown', sha: 'unknown', clean: true };
  }
}

export function getDiffStats(cwd: string): { additions: number; deletions: number } {
  if (!isGitRepo(cwd)) return { additions: 0, deletions: 0 };
  try {
    const output = execSync('git diff --stat HEAD 2>/dev/null || echo ""', {
      cwd, encoding: 'utf-8',
    });
    const match = output.match(/(\d+) insertions?\(\+\).*?(\d+) deletions?\(-\)/);
    if (match) {
      return { additions: parseInt(match[1]), deletions: parseInt(match[2]) };
    }
    const addMatch = output.match(/(\d+) insertions?\(\+\)/);
    const delMatch = output.match(/(\d+) deletions?\(-\)/);
    return {
      additions: addMatch ? parseInt(addMatch[1]) : 0,
      deletions: delMatch ? parseInt(delMatch[1]) : 0,
    };
  } catch {
    return { additions: 0, deletions: 0 };
  }
}

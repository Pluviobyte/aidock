import { nanoid } from 'nanoid';
import { Store } from './store.js';
import { TaskManager } from './task-manager.js';
import { ContextCollector } from './context-collector.js';
import { getGitDiff } from '../utils/git.js';
import { handoffToMarkdown } from '../utils/prompt-builder.js';
import type { HandoffDocument, FileContext } from '../types/handoff.js';
import type { AgentName } from '../types/agent.js';
import type { Task } from '../types/task.js';

export class HandoffEngine {
  constructor(
    private store: Store,
    private taskManager: TaskManager,
  ) {}

  generate(fromTaskId: string, toAgent: AgentName, userNotes?: string): HandoffDocument {
    const task = this.taskManager.get(fromTaskId);
    if (!task) throw new Error(`Task not found: ${fromTaskId}`);
    if (task.status !== 'done' && task.status !== 'failed') {
      throw new Error(`Task ${fromTaskId} is not completed (status: ${task.status})`);
    }

    const result = task.result;
    const collector = new ContextCollector(task.cwd);
    const diff = getGitDiff(task.cwd);
    const contextFiles = diff ? collector.collectContextFiles(diff) : [];

    // Extract structured info from task output
    const summary = this.extractSummary(task);
    const currentState = this.extractCurrentState(task);
    const issues = this.extractIssues(task);
    const constraints = this.extractConstraints(task);
    const nextSteps = this.extractNextSteps(task);

    const handoff: HandoffDocument = {
      id: `h_${nanoid(8)}`,
      fromTask: fromTaskId,
      toAgent,
      createdAt: new Date().toISOString(),
      summary,
      currentState,
      issues,
      relevantFiles: this.mergeFileContexts(
        contextFiles,
        result?.filesChanged ?? [],
      ),
      constraints,
      gitDiff: diff ? this.truncateDiff(diff) : '',
      suggestedNextSteps: nextSteps,
      userNotes,
    };

    // Save
    const handoffs = this.store.loadHandoffs();
    handoffs.push(handoff);
    this.store.saveHandoffs(handoffs);

    // Mark original task as handed off
    this.taskManager.handoff(fromTaskId);

    return handoff;
  }

  toPromptContext(handoffId: string): string {
    const handoffs = this.store.loadHandoffs();
    const handoff = handoffs.find(h => h.id === handoffId);
    if (!handoff) throw new Error(`Handoff not found: ${handoffId}`);
    return handoffToMarkdown(handoff);
  }

  getChain(taskId: string): HandoffDocument[] {
    const chain: HandoffDocument[] = [];
    const handoffs = this.store.loadHandoffs();
    let currentTaskId: string | undefined = taskId;

    while (currentTaskId) {
      const task = this.taskManager.get(currentTaskId);
      if (!task) break;

      // Find handoff that created this task
      if (task.handoffId) {
        const handoff = handoffs.find(h => h.id === task.handoffId);
        if (handoff) chain.unshift(handoff);
      }

      currentTaskId = task.parentTaskId;
    }

    // Also find handoff FROM this task
    const outgoing = handoffs.find(h => h.fromTask === taskId);
    if (outgoing && !chain.find(h => h.id === outgoing.id)) {
      chain.push(outgoing);
    }

    return chain;
  }

  get(handoffId: string): HandoffDocument | null {
    const handoffs = this.store.loadHandoffs();
    return handoffs.find(h => h.id === handoffId) ?? null;
  }

  list(): HandoffDocument[] {
    return this.store.loadHandoffs();
  }

  private extractSummary(task: Task): string {
    const output = task.result?.stdout ?? '';
    if (!output) return `Task "${task.prompt}" was executed by ${task.agent}.`;

    // Try to get first meaningful paragraph
    const lines = output.split('\n').filter(l => l.trim());
    const firstParagraph = lines.slice(0, 5).join('\n');
    return firstParagraph.length > 500
      ? firstParagraph.slice(0, 497) + '...'
      : firstParagraph;
  }

  private extractCurrentState(task: Task): string {
    const files = task.result?.filesChanged ?? [];
    const stats = task.result?.diffStats;
    const parts: string[] = [];

    if (task.status === 'done') {
      parts.push(`Task completed successfully in ${task.result?.duration.toFixed(1)}s.`);
    } else {
      parts.push(`Task failed with exit code ${task.result?.exitCode}.`);
    }

    if (files.length > 0) {
      parts.push(`${files.length} file(s) changed: ${files.join(', ')}`);
    }
    if (stats && (stats.additions > 0 || stats.deletions > 0)) {
      parts.push(`+${stats.additions} / -${stats.deletions} lines`);
    }

    return parts.join('\n');
  }

  private extractIssues(task: Task): string[] {
    if (task.status === 'failed') {
      const stderr = task.result?.stderr ?? '';
      return stderr ? [`Task failed: ${stderr.slice(0, 200)}`] : ['Task failed with unknown error'];
    }

    // Look for TODO/FIXME/HACK markers in output
    const output = task.result?.stdout ?? '';
    const issues: string[] = [];
    const patterns = [/TODO:?\s*(.+)/gi, /FIXME:?\s*(.+)/gi, /HACK:?\s*(.+)/gi];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        if (match[1]) issues.push(match[1].trim());
      }
    }
    return issues;
  }

  private extractConstraints(task: Task): string[] {
    // Extract from task output if mentioned
    const output = task.result?.stdout ?? '';
    const constraints: string[] = [];
    const patterns = [
      /(?:do not|don't|must not|should not)\s+(.+?)(?:\.|$)/gi,
      /constraint:?\s*(.+?)(?:\.|$)/gi,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        if (match[1] && match[1].length < 200) constraints.push(match[1].trim());
      }
    }
    return constraints.slice(0, 10); // Cap at 10
  }

  private extractNextSteps(task: Task): string[] {
    const output = task.result?.stdout ?? '';
    const steps: string[] = [];

    // Look for numbered lists in output
    const numberedPattern = /^\s*\d+[\.\)]\s+(.+)$/gm;
    let match;
    while ((match = numberedPattern.exec(output)) !== null) {
      if (match[1]) steps.push(match[1].trim());
    }

    if (steps.length > 0) return steps.slice(0, 5);

    // Fallback: suggest based on task status
    if (task.status === 'failed') {
      return ['Review the error and fix the underlying issue', 'Re-run the task'];
    }
    return ['Review the changes', 'Continue with the next implementation step'];
  }

  private mergeFileContexts(fromDiff: FileContext[], changedFiles: string[]): FileContext[] {
    const seen = new Set(fromDiff.map(f => f.path));
    const merged = [...fromDiff];

    for (const file of changedFiles) {
      if (!seen.has(file)) {
        merged.push({ path: file, role: 'modified' });
        seen.add(file);
      }
    }

    return merged;
  }

  private truncateDiff(diff: string, maxLen = 4096): string {
    if (diff.length <= maxLen) return diff;
    return diff.slice(0, maxLen) + '\n... (diff truncated)';
  }
}

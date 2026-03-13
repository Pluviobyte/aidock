import type { HandoffDocument } from '../types/handoff.js';

export function buildPrompt(opts: {
  task: string;
  handoff?: HandoffDocument;
  projectContext?: string;
}): string {
  const parts: string[] = [];

  if (opts.handoff) {
    parts.push(handoffToMarkdown(opts.handoff));
    parts.push('---');
  }

  if (opts.projectContext) {
    parts.push(opts.projectContext);
    parts.push('---');
  }

  parts.push(`TASK: ${opts.task}`);

  return parts.join('\n\n');
}

export function handoffToMarkdown(h: HandoffDocument): string {
  const lines: string[] = [];

  lines.push(`# Handoff: ${h.fromTask} -> ${h.toAgent}`);
  lines.push('');

  lines.push('## Summary');
  lines.push(h.summary);
  lines.push('');

  lines.push('## Current State');
  lines.push(h.currentState);
  lines.push('');

  if (h.issues.length > 0) {
    lines.push('## Known Issues');
    h.issues.forEach(i => lines.push(`- ${i}`));
    lines.push('');
  }

  if (h.relevantFiles.length > 0) {
    lines.push('## Relevant Files');
    h.relevantFiles.forEach(f => {
      lines.push(`- ${f.path} (${f.role})`);
    });
    lines.push('');
  }

  if (h.constraints.length > 0) {
    lines.push('## Constraints (Do Not Change)');
    h.constraints.forEach(c => lines.push(`- ${c}`));
    lines.push('');
  }

  if (h.suggestedNextSteps.length > 0) {
    lines.push('## Suggested Next Steps');
    h.suggestedNextSteps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }

  if (h.userNotes) {
    lines.push('## Additional Notes');
    lines.push(h.userNotes);
    lines.push('');
  }

  return lines.join('\n');
}

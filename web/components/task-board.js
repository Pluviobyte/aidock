const COLUMNS = ['pending', 'running', 'done', 'failed'];

// Attention level: higher = needs more human attention
const ATTENTION = {
  failed: 4,
  handed_off: 3,
  running: 2,
  pending: 1,
  done: 0,
};

const ATTENTION_LABELS = {
  4: { text: 'action needed', color: 'var(--failed)' },
  3: { text: 'review handoff', color: 'var(--handed-off)' },
  2: { text: 'monitoring', color: 'var(--running)' },
};

function getAttention(task) {
  return ATTENTION[task.status] ?? 0;
}

export function renderTaskBoard(tasks) {
  if (!tasks) return;

  for (const status of COLUMNS) {
    const col = document.getElementById(`col-${status}`);
    if (!col) continue;

    const filtered = tasks.filter(t => {
      if (status === 'done') return t.status === 'done' || t.status === 'handed_off';
      return t.status === status;
    });

    // Sort by attention level (highest first), then by creation time (newest first)
    filtered.sort((a, b) => {
      const diff = getAttention(b) - getAttention(a);
      if (diff !== 0) return diff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    if (filtered.length === 0) {
      col.innerHTML = '<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px">No tasks</div>';
      continue;
    }

    col.innerHTML = filtered.map(t => {
      const level = getAttention(t);
      const label = ATTENTION_LABELS[level];
      const borderStyle = level >= 3 ? `border-left:3px solid ${label.color}` : '';

      return `
      <div class="task-card" onclick="showTaskDetail('${t.id}')" style="${borderStyle}">
        <div>
          <span class="task-id">${t.id}</span>
          <span class="task-agent ${t.agent}">${t.agent}</span>
          ${t.status === 'handed_off' ? '<span style="color:var(--handed-off);font-size:11px;margin-left:4px">handed off</span>' : ''}
          ${label ? `<span class="attention-badge" style="color:${label.color}">${label.text}</span>` : ''}
        </div>
        <div class="task-prompt">${escapeHtml(t.prompt)}</div>
        <div class="task-meta">
          ${t.result
            ? `${t.result.duration.toFixed(1)}s | ${t.result.filesChanged.length} file(s) | +${t.result.diffStats.additions}/-${t.result.diffStats.deletions}`
            : new Date(t.createdAt).toLocaleTimeString()
          }
          ${t.attempt && t.attempt > 1 ? `| attempt ${t.attempt}` : ''}
        </div>
      </div>
    `}).join('');
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

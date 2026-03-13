const COLUMNS = ['pending', 'running', 'done', 'failed'];

export function renderTaskBoard(tasks) {
  if (!tasks) return;

  for (const status of COLUMNS) {
    const col = document.getElementById(`col-${status}`);
    if (!col) continue;

    const filtered = tasks.filter(t => {
      if (status === 'done') return t.status === 'done' || t.status === 'handed_off';
      return t.status === status;
    });

    if (filtered.length === 0) {
      col.innerHTML = '<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px">No tasks</div>';
      continue;
    }

    col.innerHTML = filtered.map(t => `
      <div class="task-card" onclick="showTaskDetail('${t.id}')">
        <div>
          <span class="task-id">${t.id}</span>
          <span class="task-agent ${t.agent}">${t.agent}</span>
          ${t.status === 'handed_off' ? '<span style="color:var(--handed-off);font-size:11px;margin-left:4px">handed off</span>' : ''}
        </div>
        <div class="task-prompt">${escapeHtml(t.prompt)}</div>
        <div class="task-meta">
          ${t.result
            ? `${t.result.duration.toFixed(1)}s | ${t.result.filesChanged.length} file(s) | +${t.result.diffStats.additions}/-${t.result.diffStats.deletions}`
            : new Date(t.createdAt).toLocaleTimeString()
          }
        </div>
      </div>
    `).join('');
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

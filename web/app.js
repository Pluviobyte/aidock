import { renderAgentCards } from './components/agent-status.js';
import { renderTaskBoard } from './components/task-board.js';
import { renderHandoffChain } from './components/handoff-chain.js';

const API = '';
let ws = null;
let reconnectTimer = null;

// --- Data fetching ---

async function fetchJSON(path) {
  const res = await fetch(`${API}${path}`);
  return res.json();
}

async function refresh() {
  try {
    const [agents, tasks, handoffs] = await Promise.all([
      fetchJSON('/api/status'),
      fetchJSON('/api/tasks'),
      fetchJSON('/api/handoffs'),
    ]);

    renderAgentCards(document.getElementById('agents'), agents.agents);
    renderTaskBoard(tasks);
    renderHandoffChain(document.getElementById('chain-container'), tasks, handoffs);
  } catch (e) {
    console.error('Failed to fetch data:', e);
  }
}

// --- WebSocket ---

function connectWS() {
  const badge = document.getElementById('ws-status');
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => {
    badge.textContent = 'live';
    badge.className = 'ws-badge connected';
    if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'task_update' || msg.type === 'handoff_update') {
        refresh();
      }
    } catch { /* ignore non-JSON */ }
  };

  ws.onclose = () => {
    badge.textContent = 'disconnected';
    badge.className = 'ws-badge disconnected';
    // Auto reconnect
    if (!reconnectTimer) {
      reconnectTimer = setInterval(() => connectWS(), 5000);
    }
  };

  ws.onerror = () => ws.close();
}

// --- Modal ---

window.closeModal = function() {
  document.getElementById('task-modal').classList.add('hidden');
};

window.showTaskDetail = async function(taskId) {
  try {
    const task = await fetchJSON(`/api/tasks/${taskId}`);
    const modal = document.getElementById('task-modal');
    const body = document.getElementById('modal-body');

    body.innerHTML = `
      <h3>${task.id} <span class="task-agent ${task.agent}">${task.agent}</span></h3>
      <div class="detail-row"><span class="detail-label">Status:</span> ${task.status}</div>
      <div class="detail-row"><span class="detail-label">Created:</span> ${new Date(task.createdAt).toLocaleString()}</div>
      ${task.result ? `
        <div class="detail-row"><span class="detail-label">Duration:</span> ${task.result.duration.toFixed(1)}s</div>
        <div class="detail-row"><span class="detail-label">Exit code:</span> ${task.result.exitCode}</div>
        <div class="detail-row"><span class="detail-label">Files:</span> ${task.result.filesChanged.join(', ') || 'none'}</div>
        <div class="detail-row"><span class="detail-label">Changes:</span> +${task.result.diffStats.additions} / -${task.result.diffStats.deletions}</div>
      ` : ''}
      <h4 style="margin-top:16px">Prompt</h4>
      <pre>${escapeHtml(task.prompt)}</pre>
      ${task.result?.stdout ? `
        <h4>Output</h4>
        <pre>${escapeHtml(task.result.stdout.slice(0, 5000))}</pre>
      ` : ''}
      ${task.logs?.stderr ? `
        <h4>Stderr</h4>
        <pre>${escapeHtml(task.logs.stderr.slice(0, 2000))}</pre>
      ` : ''}
    `;

    modal.classList.remove('hidden');
  } catch (e) {
    console.error('Failed to load task:', e);
  }
};

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Close modal on background click
document.getElementById('task-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'task-modal') closeModal();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// --- Init ---

refresh();
connectWS();

// Poll fallback (in case WS isn't working)
setInterval(refresh, 10000);

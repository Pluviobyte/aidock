export function renderHandoffChain(container, tasks, handoffs) {
  if (!container) return;

  if (!handoffs || handoffs.length === 0) {
    container.innerHTML = '<div class="chain-empty">No handoffs yet. Use <code>aidock handoff &lt;taskId&gt; &lt;agent&gt;</code> to create one.</div>';
    return;
  }

  // Build chains: group handoffs by tracing parentTaskId
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const chains = buildChains(handoffs, taskMap);

  container.innerHTML = chains.map(chain => renderChain(chain, taskMap)).join('');
}

function buildChains(handoffs, taskMap) {
  // Group related handoffs into chains
  const chains = [];
  const used = new Set();

  for (const h of handoffs) {
    if (used.has(h.id)) continue;

    const chain = [h];
    used.add(h.id);

    // Find subsequent handoffs in this chain
    let currentTask = findTaskByHandoff(h, taskMap);
    while (currentTask) {
      const next = handoffs.find(hh => hh.fromTask === currentTask.id && !used.has(hh.id));
      if (!next) break;
      chain.push(next);
      used.add(next.id);
      currentTask = findTaskByHandoff(next, taskMap);
    }

    chains.push(chain);
  }

  return chains;
}

function findTaskByHandoff(handoff, taskMap) {
  // Find the task that was created by this handoff
  for (const [, task] of taskMap) {
    if (task.handoffId === handoff.id) return task;
  }
  return null;
}

function renderChain(chain, taskMap) {
  const nodes = [];

  // First node: source task of first handoff
  const firstTask = taskMap.get(chain[0].fromTask);
  if (firstTask) {
    nodes.push(renderNode(firstTask));
  }

  for (const h of chain) {
    nodes.push(`<div class="chain-arrow">→</div>`);

    const targetTask = findTaskByHandoff(h, taskMap);
    if (targetTask) {
      nodes.push(renderNode(targetTask));
    } else {
      // Task hasn't been created yet or not found
      nodes.push(`
        <div class="chain-node ${h.toAgent}">
          <div class="node-agent">${h.toAgent}</div>
          <div class="node-id">${h.id}</div>
          <div class="node-status" style="color:var(--pending)">pending</div>
        </div>
      `);
    }
  }

  return `<div class="chain">${nodes.join('')}</div>`;
}

function renderNode(task) {
  const statusColors = {
    pending: 'var(--pending)',
    running: 'var(--running)',
    done: 'var(--done)',
    failed: 'var(--failed)',
    handed_off: 'var(--handed-off)',
  };

  return `
    <div class="chain-node ${task.agent}" onclick="showTaskDetail('${task.id}')" style="cursor:pointer">
      <div class="node-agent">${task.agent}</div>
      <div class="node-id">${task.id}</div>
      <div class="node-status" style="color:${statusColors[task.status] || 'var(--text-dim)'}">
        ${task.status}${task.result ? ` (${task.result.duration.toFixed(1)}s)` : ''}
      </div>
    </div>
  `;
}

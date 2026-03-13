export function renderAgentCards(container, agents) {
  if (!container || !agents) return;

  container.innerHTML = agents.map(a => `
    <div class="agent-card ${a.name}">
      <div class="name">
        <span class="status-dot ${a.available && a.supported ? 'ready' : 'unavailable'}"></span>
        <span class="${a.name}-name">${a.name}</span>
      </div>
      <div class="meta">
        ${a.available
          ? `v${a.version} ${a.supported ? '' : '(outdated)'}`
          : 'Not installed'
        }
      </div>
      ${a.warnings.length > 0
        ? `<div class="meta" style="color:var(--running);margin-top:4px">${a.warnings[0]}</div>`
        : ''
      }
    </div>
  `).join('');
}

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const AGENT_COLORS: Record<string, string> = {
  claude: COLORS.blue,
  codex: COLORS.green,
  gemini: COLORS.cyan,
};

export function info(msg: string): void {
  console.log(`${COLORS.dim}[aidock]${COLORS.reset} ${msg}`);
}

export function success(msg: string): void {
  console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${COLORS.red}✗${COLORS.reset} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${COLORS.yellow}!${COLORS.reset} ${msg}`);
}

export function agent(name: string, msg: string): void {
  const color = AGENT_COLORS[name] || COLORS.gray;
  console.log(`${color}[${name}]${COLORS.reset} ${msg}`);
}

export function table(rows: Record<string, string>[]): void {
  if (rows.length === 0) return;

  const keys = Object.keys(rows[0]);
  const widths = keys.map(k =>
    Math.max(k.length, ...rows.map(r => (r[k] || '').length))
  );

  // Header
  const header = keys.map((k, i) => k.padEnd(widths[i])).join('  ');
  console.log(`${COLORS.bold}${header}${COLORS.reset}`);
  console.log(widths.map(w => '─'.repeat(w)).join('──'));

  // Rows
  for (const row of rows) {
    const line = keys.map((k, i) => {
      const val = row[k] || '';
      // Color status values
      if (k === 'Status') {
        if (val === 'done') return `${COLORS.green}${val.padEnd(widths[i])}${COLORS.reset}`;
        if (val === 'running') return `${COLORS.yellow}${val.padEnd(widths[i])}${COLORS.reset}`;
        if (val === 'failed') return `${COLORS.red}${val.padEnd(widths[i])}${COLORS.reset}`;
      }
      // Color agent names
      if (k === 'Agent') {
        const c = AGENT_COLORS[val] || '';
        return `${c}${val.padEnd(widths[i])}${COLORS.reset}`;
      }
      return val.padEnd(widths[i]);
    }).join('  ');
    console.log(line);
  }
}

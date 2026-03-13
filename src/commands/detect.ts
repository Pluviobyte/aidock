import { detectAll } from '../adapters/detect.js';
import * as log from '../utils/logger.js';

export async function runDetect(): Promise<void> {
  log.info('Detecting installed AI CLIs...\n');
  const results = await detectAll();

  const rows = results.map(r => ({
    Agent: r.name,
    Status: r.available ? (r.supported ? 'ready' : 'outdated') : 'not found',
    Version: r.version || '-',
    'Min Version': r.minVersion,
  }));

  log.table(rows);

  const available = results.filter(r => r.available && r.supported);
  if (available.length === 0) {
    console.log('');
    log.warn('No supported AI CLIs found. Install at least one:');
    log.info('  claude: npm install -g @anthropic-ai/claude-code');
    log.info('  codex:  npm install -g @openai/codex');
    log.info('  gemini: npm install -g @anthropic-ai/gemini-cli');
  } else {
    console.log('');
    log.success(`${available.length} CLI(s) ready to use`);
  }

  // Show warnings
  for (const r of results) {
    for (const w of r.warnings) {
      log.warn(`${r.name}: ${w}`);
    }
  }
}

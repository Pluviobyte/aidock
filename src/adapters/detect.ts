import type { AgentStatus, AgentName } from '../types/agent.js';
import { ClaudeAdapter } from './claude-adapter.js';
import { CodexAdapter } from './codex-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { BaseAdapter } from './base-adapter.js';

const ADAPTERS: Record<AgentName, () => BaseAdapter> = {
  claude: () => new ClaudeAdapter(),
  codex: () => new CodexAdapter(),
  gemini: () => new GeminiAdapter(),
};

export function getAdapter(name: AgentName): BaseAdapter {
  const factory = ADAPTERS[name];
  if (!factory) {
    throw new Error(`Unknown agent: ${name}. Available: ${Object.keys(ADAPTERS).join(', ')}`);
  }
  return factory();
}

export async function detectAll(): Promise<AgentStatus[]> {
  const results = await Promise.all(
    Object.values(ADAPTERS).map(factory => factory().detect())
  );
  return results;
}

export function isValidAgent(name: string): name is AgentName {
  return name in ADAPTERS;
}

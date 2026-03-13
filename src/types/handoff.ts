import type { AgentName } from './agent.js';

export interface FileContext {
  path: string;
  role: 'modified' | 'created' | 'relevant';
  snippet?: string;
}

export interface HandoffDocument {
  id: string;
  fromTask: string;
  toAgent: AgentName;
  createdAt: string;
  summary: string;
  currentState: string;
  issues: string[];
  relevantFiles: FileContext[];
  constraints: string[];
  gitDiff: string;
  suggestedNextSteps: string[];
  userNotes?: string;
}

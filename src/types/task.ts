import type { AgentName } from './agent.js';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'handed_off';

export interface TaskResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  filesChanged: string[];
  diffStats: { additions: number; deletions: number };
}

export interface Task {
  id: string;
  prompt: string;
  agent: AgentName;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: TaskResult;
  parentTaskId?: string;
  handoffId?: string;
  cwd: string;
}

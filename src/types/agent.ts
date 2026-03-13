export type AgentName = 'claude' | 'codex' | 'gemini';

export interface AgentStatus {
  name: AgentName;
  available: boolean;
  version: string | null;
  minVersion: string;
  supported: boolean;
  features: {
    jsonOutput: boolean;
    streamOutput: boolean;
    sessionResume: boolean;
  };
  warnings: string[];
}

export type PermissionLevel = 'safe' | 'auto' | 'full';

export interface NormalizedResult {
  content: string;
  sessionId?: string;
  filesChanged: string[];
  tokensUsed?: number;
  rawOutput: string;
  rawStderr: string;
  exitCode: number;
  duration: number;
}

export interface ExecuteOptions {
  cwd: string;
  timeout: number;
  model?: string;
  context?: string;
  permissionLevel: PermissionLevel;
}

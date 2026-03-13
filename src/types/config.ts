import type { PermissionLevel } from './agent.js';

export interface AidockConfig {
  defaultTimeout: number;
  permissionLevel: PermissionLevel;
  promptLengthThreshold: number;
  models: {
    claude?: string;
    codex?: string;
    gemini?: string;
  };
  webPort: number;
}

export const DEFAULT_CONFIG: AidockConfig = {
  defaultTimeout: 300,
  permissionLevel: 'auto',
  promptLengthThreshold: 4096,
  models: {},
  webPort: 3457,
};

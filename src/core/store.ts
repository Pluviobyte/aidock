import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Task } from '../types/task.js';
import type { HandoffDocument } from '../types/handoff.js';
import type { AidockConfig } from '../types/config.js';
import { DEFAULT_CONFIG } from '../types/config.js';

export class Store {
  private root: string;

  constructor(projectRoot: string) {
    this.root = join(projectRoot, '.aidock');
  }

  get dir(): string {
    return this.root;
  }

  init(): void {
    mkdirSync(this.root, { recursive: true });
    mkdirSync(join(this.root, 'logs'), { recursive: true });
    if (!existsSync(join(this.root, 'tasks.json'))) {
      this.write('tasks.json', []);
    }
    if (!existsSync(join(this.root, 'handoffs.json'))) {
      this.write('handoffs.json', []);
    }
    if (!existsSync(join(this.root, 'config.json'))) {
      this.write('config.json', DEFAULT_CONFIG);
    }
  }

  isInitialized(): boolean {
    return existsSync(join(this.root, 'tasks.json'));
  }

  // Tasks
  loadTasks(): Task[] {
    return this.read<Task[]>('tasks.json') ?? [];
  }

  saveTasks(tasks: Task[]): void {
    this.write('tasks.json', tasks);
  }

  // Handoffs
  loadHandoffs(): HandoffDocument[] {
    return this.read<HandoffDocument[]>('handoffs.json') ?? [];
  }

  saveHandoffs(handoffs: HandoffDocument[]): void {
    this.write('handoffs.json', handoffs);
  }

  // Config
  loadConfig(): AidockConfig {
    return { ...DEFAULT_CONFIG, ...this.read<Partial<AidockConfig>>('config.json') };
  }

  saveConfig(config: AidockConfig): void {
    this.write('config.json', config);
  }

  // Logs
  writeLog(taskId: string, stream: 'stdout' | 'stderr', content: string): void {
    const path = join(this.root, 'logs', `${taskId}.${stream}.log`);
    writeFileSync(path, content, 'utf-8');
  }

  readLog(taskId: string, stream: 'stdout' | 'stderr'): string | null {
    const path = join(this.root, 'logs', `${taskId}.${stream}.log`);
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf-8');
  }

  // Helpers
  private read<T>(filename: string): T | null {
    const path = join(this.root, filename);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as T;
    } catch {
      return null;
    }
  }

  private write(filename: string, data: unknown): void {
    const path = join(this.root, filename);
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }
}

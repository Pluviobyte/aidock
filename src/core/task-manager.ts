import { nanoid } from 'nanoid';
import type { Task, TaskResult, TaskStatus } from '../types/task.js';
import type { AgentName } from '../types/agent.js';
import { Store } from './store.js';

export class TaskManager {
  constructor(private store: Store) {}

  create(agent: AgentName, prompt: string, cwd: string, opts?: { parentTaskId?: string; handoffId?: string }): Task {
    const tasks = this.store.loadTasks();
    const task: Task = {
      id: `t_${nanoid(8)}`,
      prompt,
      agent,
      status: 'pending',
      createdAt: new Date().toISOString(),
      cwd,
      parentTaskId: opts?.parentTaskId,
      handoffId: opts?.handoffId,
    };
    tasks.push(task);
    this.store.saveTasks(tasks);
    return task;
  }

  start(taskId: string): Task {
    return this.updateTask(taskId, {
      status: 'running',
      startedAt: new Date().toISOString(),
    });
  }

  complete(taskId: string, result: TaskResult): Task {
    return this.updateTask(taskId, {
      status: 'done',
      completedAt: new Date().toISOString(),
      result,
    });
  }

  fail(taskId: string, result: TaskResult): Task {
    return this.updateTask(taskId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      result,
    });
  }

  handoff(taskId: string): Task {
    return this.updateTask(taskId, { status: 'handed_off' });
  }

  get(taskId: string): Task | null {
    const tasks = this.store.loadTasks();
    return tasks.find(t => t.id === taskId) ?? null;
  }

  list(filter?: { status?: TaskStatus; agent?: AgentName }): Task[] {
    let tasks = this.store.loadTasks();
    if (filter?.status) {
      tasks = tasks.filter(t => t.status === filter.status);
    }
    if (filter?.agent) {
      tasks = tasks.filter(t => t.agent === filter.agent);
    }
    return tasks;
  }

  private updateTask(taskId: string, updates: Partial<Task>): Task {
    const tasks = this.store.loadTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }
    tasks[index] = { ...tasks[index], ...updates };
    this.store.saveTasks(tasks);
    return tasks[index];
  }
}

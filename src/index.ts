export * from './types/index.js';
export { Store } from './core/store.js';
export { TaskManager } from './core/task-manager.js';
export { ContextCollector } from './core/context-collector.js';
export { getAdapter, detectAll, isValidAgent } from './adapters/detect.js';
export { buildPrompt, handoffToMarkdown } from './utils/prompt-builder.js';

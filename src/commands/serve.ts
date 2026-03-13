import { startServer } from '../server/server.js';
import { Store } from '../core/store.js';
import * as log from '../utils/logger.js';

export async function runServe(cwd: string, port: number): Promise<void> {
  const store = new Store(cwd);
  if (!store.isInitialized()) {
    store.init();
    log.info('Auto-initialized .aidock/');
  }

  startServer(cwd, port);
}

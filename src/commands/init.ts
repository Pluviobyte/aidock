import { Store } from '../core/store.js';
import * as log from '../utils/logger.js';

export function runInit(cwd: string): void {
  const store = new Store(cwd);

  if (store.isInitialized()) {
    log.warn('.aidock/ already exists in this directory');
    return;
  }

  store.init();
  log.success('Initialized .aidock/ in current directory');
  log.info('Run `aidock detect` to check available AI CLIs');
}

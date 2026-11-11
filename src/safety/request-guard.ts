import type { Page } from 'puppeteer-core';
import { createFetchGuard } from './fetch-guard.js';
import { createGuardLog, type GuardLog } from './guard-log.js';
import { installPopupGuard } from './popup-guard.js';

export interface GuardPolicy {
  /** --allow-mutations: first-party non-GET requests to matching URLs pass. Never use the g or y flag (stateful test()). */
  readonly allowMutations: RegExp | null;
}

export const DEFAULT_GUARD_POLICY: GuardPolicy = { allowMutations: null };

export interface RequestGuard {
  readonly log: GuardLog;
  /** Call after the initial navigation completed: from now on navigations are cancelled and mutations blocked. */
  arm(): Promise<void>;
  disarm(): Promise<void>;
  dispose(): Promise<void>;
}

/** Production safety for one page: install before the first goto, arm() once the page is loaded. */
export async function installRequestGuard(page: Page, policy: GuardPolicy): Promise<RequestGuard> {
  if (policy.allowMutations !== null && (policy.allowMutations.global || policy.allowMutations.sticky)) {
    throw new Error(`[safety] --allow-mutations ${String(policy.allowMutations)} must not use the g or y flag`);
  }
  const log = createGuardLog();
  const fetchGuard = await createFetchGuard(page, policy.allowMutations, log);
  const removePopupGuard = await installPopupGuard(page, log);
  return {
    log,
    arm: () => fetchGuard.arm(),
    disarm: () => fetchGuard.disarm(),
    dispose: async () => {
      await removePopupGuard();
      await fetchGuard.dispose();
    },
  };
}

export interface BlockedRequest {
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly reason: string;
}

export interface CancelledNavigation {
  readonly url: string;
  readonly method: string;
}

export interface DialogRecord {
  readonly type: string;
  readonly message: string;
}

export interface ClosedTab {
  readonly url: string;
}

/** Everything the guard prevented; the report shows it next to the measurements. */
export interface GuardLog {
  readonly blockedRequests: readonly BlockedRequest[];
  readonly cancelledNavigations: readonly CancelledNavigation[];
  readonly dialogs: readonly DialogRecord[];
  readonly closedTabs: readonly ClosedTab[];
  readonly deniedDownloads: readonly string[];
  /** CDP failures while handling an intercepted request (e.g. the page closed mid-request). */
  readonly errors: readonly string[];
}

export interface MutableGuardLog {
  readonly blockedRequests: BlockedRequest[];
  readonly cancelledNavigations: CancelledNavigation[];
  readonly dialogs: DialogRecord[];
  readonly closedTabs: ClosedTab[];
  readonly deniedDownloads: string[];
  readonly errors: string[];
}

export function createGuardLog(): MutableGuardLog {
  return { blockedRequests: [], cancelledNavigations: [], dialogs: [], closedTabs: [], deniedDownloads: [], errors: [] };
}

export function recordGuardError(log: MutableGuardLog, what: string, error: unknown): void {
  const message = `${what}: ${error instanceof Error ? error.message : String(error)}`;
  log.errors.push(message);
  console.error(`[safety] ${message}`);
}

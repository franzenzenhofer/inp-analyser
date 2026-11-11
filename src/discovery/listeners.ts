import type { CDPSession, Protocol } from 'puppeteer-core';
import { DISCOVERY_OBJECT_GROUP } from './collect-candidates.js';
import type { GlobalListener, Listener } from './types.js';

/** Event types of taps, clicks and key presses that discovery reports listeners for. */
export const INTERACTION_EVENT_TYPES: ReadonlySet<string> = new Set([
  'click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend',
  'keydown', 'keyup', 'keypress', 'input', 'change',
]);

export interface ListenerScan {
  /** Own listeners (depth 0) per node, index-aligned with the object ids passed in. */
  readonly perNode: readonly (readonly Listener[])[];
  readonly global: readonly GlobalListener[];
}

type ScriptUrls = ReadonlyMap<string, string>;

/** CDP line/column are 0-based; reported 1-based like DevTools. */
function toListener(raw: Protocol.DOMDebugger.EventListener, urls: ScriptUrls): Listener {
  const url = urls.get(raw.scriptId);
  if (url === undefined) {
    throw new Error(`[discovery] listener ${raw.type} references script ${raw.scriptId} that was never reported by Debugger.scriptParsed`);
  }
  return { type: raw.type, url, line: raw.lineNumber + 1, column: raw.columnNumber + 1 };
}

async function listenersOf(session: CDPSession, objectId: string, urls: ScriptUrls): Promise<Listener[]> {
  const { listeners } = await session.send('DOMDebugger.getEventListeners', { objectId, depth: 0 });
  return listeners.filter((l) => INTERACTION_EVENT_TYPES.has(l.type)).map((l) => toListener(l, urls));
}

async function globalListenersOf(session: CDPSession, on: GlobalListener['on'], urls: ScriptUrls): Promise<GlobalListener[]> {
  const { result } = await session.send('Runtime.evaluate', { expression: on, objectGroup: DISCOVERY_OBJECT_GROUP });
  if (result.objectId === undefined) throw new Error(`[discovery] could not get a handle on ${on}`);
  const own = await listenersOf(session, result.objectId, urls);
  return own.map((l) => ({ type: l.type, url: l.url, line: l.line, column: l.column, on }));
}

/**
 * Debugger.enable replays Debugger.scriptParsed for every script already in the page, which gives the
 * scriptId -> url map listeners are resolved against (https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#method-enable).
 */
export async function collectListeners(session: CDPSession, nodeObjectIds: readonly string[]): Promise<ListenerScan> {
  const urls = new Map<string, string>();
  const onParsed = (event: Protocol.Debugger.ScriptParsedEvent): void => void urls.set(event.scriptId, event.url);
  session.on('Debugger.scriptParsed', onParsed);
  await session.send('Debugger.enable');
  try {
    const perNode = await Promise.all(nodeObjectIds.map((id) => listenersOf(session, id, urls)));
    const global = [...await globalListenersOf(session, 'document', urls), ...await globalListenersOf(session, 'window', urls)];
    return { perNode, global };
  } finally {
    session.off('Debugger.scriptParsed', onParsed);
    await session.send('Debugger.disable');
  }
}

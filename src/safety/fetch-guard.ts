import type { CDPSession, Page, Protocol } from 'puppeteer-core';
import { decideRequest, type DecisionContext } from './fetch-decision.js';
import { recordGuardError, type MutableGuardLog } from './guard-log.js';

/**
 * Only these resource types are intercepted. Script, Stylesheet, Image, Font, Media never pause, so the
 * guard adds no round trip to the resources that decide load and rendering speed.
 */
const INTERCEPTED_TYPES: readonly Protocol.Network.ResourceType[] = ['Document', 'XHR', 'Fetch', 'Ping', 'Other'];
const NO_CONTENT = 204;

export interface FetchGuard {
  arm(): Promise<void>;
  disarm(): Promise<void>;
  dispose(): Promise<void>;
}

async function answer(session: CDPSession, event: Protocol.Fetch.RequestPausedEvent, context: DecisionContext | null, log: MutableGuardLog): Promise<void> {
  const { requestId, request, resourceType, frameId } = event;
  if (context === null) {
    await session.send('Fetch.continueRequest', { requestId });
    return;
  }
  const decision = decideRequest({ url: request.url, method: request.method, resourceType, frameId }, context);
  switch (decision.action) {
    case 'continue':
      await session.send('Fetch.continueRequest', { requestId });
      return;
    case 'cancel-navigation':
      log.cancelledNavigations.push({ url: request.url, method: request.method });
      console.log(`[safety] navigation-cancelled ${request.method} ${request.url} (answered ${NO_CONTENT})`);
      await session.send('Fetch.fulfillRequest', { requestId, responseCode: NO_CONTENT, responseHeaders: [], body: '' });
      return;
    case 'block':
      log.blockedRequests.push({ url: request.url, method: request.method, resourceType, reason: decision.reason });
      console.log(`[safety] blocked ${decision.reason} ${request.url}`);
      await session.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      return;
  }
}

async function mainFrameId(session: CDPSession): Promise<string> {
  const { frameTree } = await session.send('Page.getFrameTree');
  return frameTree.frame.id;
}

/**
 * Fetch interception on its own CDP session. Not enabled until arm(): the initial navigation and the page
 * load run untouched; after arm() the policy of decideRequest applies.
 */
export async function createFetchGuard(page: Page, allowMutations: RegExp | null, log: MutableGuardLog): Promise<FetchGuard> {
  const session = await page.createCDPSession();
  let context: DecisionContext | null = null;
  session.on('Fetch.requestPaused', (event) => {
    answer(session, event, context, log).catch((error: unknown) => recordGuardError(log, `answering ${event.request.method} ${event.request.url}`, error));
  });
  return {
    arm: async () => {
      context = { pageUrl: page.url(), mainFrameId: await mainFrameId(session), allowMutations };
      await session.send('Fetch.enable', { patterns: INTERCEPTED_TYPES.map((resourceType) => ({ urlPattern: '*', resourceType })) });
      console.log(`[safety] guard armed on ${context.pageUrl}`);
    },
    disarm: async () => {
      await session.send('Fetch.disable');
      context = null;
    },
    dispose: () => session.detach(),
  };
}

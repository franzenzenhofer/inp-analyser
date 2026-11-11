import { TargetType, type Dialog, type Page, type Target } from 'puppeteer-core';
import { recordGuardError, type MutableGuardLog } from './guard-log.js';

async function closePopup(target: Target, log: MutableGuardLog): Promise<void> {
  const popup = await target.asPage();
  const url = target.url();
  await popup.close();
  log.closedTabs.push({ url });
  console.log(`[safety] closed tab opened by the page: ${url}`);
}

/** Download denial is browser-context wide (https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-setDownloadBehavior). */
async function denyDownloads(page: Page, log: MutableGuardLog): Promise<() => Promise<void>> {
  const session = await page.browser().target().createCDPSession();
  session.on('Browser.downloadWillBegin', (event) => {
    log.deniedDownloads.push(event.url);
    console.log(`[safety] download denied: ${event.url}`);
  });
  const contextId = page.browserContext().id;
  await session.send('Browser.setDownloadBehavior', { behavior: 'deny', eventsEnabled: true, ...(contextId === undefined ? {} : { browserContextId: contextId }) });
  return () => session.detach();
}

/**
 * Closes tabs/windows the page opens (target opener = our page), dismisses every JS dialog
 * (alert/confirm/prompt/beforeunload) and denies downloads. Active from install, armed or not.
 */
export async function installPopupGuard(page: Page, log: MutableGuardLog): Promise<() => Promise<void>> {
  const onTarget = (target: Target): void => {
    if (target.type() !== TargetType.PAGE || target.opener() !== page.target()) return;
    closePopup(target, log).catch((error: unknown) => recordGuardError(log, `closing tab ${target.url()}`, error));
  };
  const onDialog = (dialog: Dialog): void => {
    log.dialogs.push({ type: dialog.type(), message: dialog.message() });
    console.log(`[safety] dismissed ${dialog.type()} dialog: ${dialog.message()}`);
    dialog.dismiss().catch((error: unknown) => recordGuardError(log, `dismissing ${dialog.type()} dialog`, error));
  };
  page.browser().on('targetcreated', onTarget);
  page.on('dialog', onDialog);
  const undoDownloads = await denyDownloads(page, log);
  return async () => {
    page.browser().off('targetcreated', onTarget);
    page.off('dialog', onDialog);
    await undoDownloads();
  };
}

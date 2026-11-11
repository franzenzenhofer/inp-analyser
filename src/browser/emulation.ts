import { TargetType, type Browser, type CDPSession, type Page, type Target } from 'puppeteer-core';
import type { Condition } from '../model/scenario.js';
import { DEVICE_PROFILES, NETWORK_PROFILES } from './devices.js';

const KBPS_TO_BYTES_PER_S = 1024 / 8;

async function applyNetwork(client: CDPSession, condition: Condition): Promise<void> {
  const n = NETWORK_PROFILES[condition.device];
  await client.send('Network.enable');
  // 'cold' is the only declared cache condition: every load starts with an empty HTTP cache.
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: n.latencyMs,
    downloadThroughput: n.downloadKbps * KBPS_TO_BYTES_PER_S, uploadThroughput: n.uploadKbps * KBPS_TO_BYTES_PER_S,
  });
}

async function applyDevice(page: Page, client: CDPSession, condition: Condition): Promise<void> {
  const d = DEVICE_PROFILES[condition.device];
  await page.setUserAgent({ userAgent: d.userAgent });
  await client.send('Emulation.setDeviceMetricsOverride', { width: d.width, height: d.height, deviceScaleFactor: d.deviceScaleFactor, mobile: d.mobile });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: d.mobile, maxTouchPoints: d.mobile ? 5 : 1 });
}

/** CPU throttling applies per renderer target: https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate */
async function throttleTarget(target: Target, rate: number): Promise<void> {
  const session = await target.createCDPSession();
  await session.send('Emulation.setCPUThrottlingRate', { rate });
}

export interface AppliedEmulation {
  /** Stops throttling newly created OOPIF targets (ads in cross-origin iframes). */
  dispose(): void;
}

export async function applyCondition(page: Page, client: CDPSession, condition: Condition): Promise<AppliedEmulation> {
  await applyDevice(page, client, condition);
  await applyNetwork(client, condition);
  await client.send('Emulation.setCPUThrottlingRate', { rate: condition.cpuRate });
  const browser: Browser = page.browser();
  const context = page.browserContext();
  const onTarget = (target: Target): void => {
    if (target.type() !== TargetType.OTHER || target.browserContext() !== context) return;
    throttleTarget(target, condition.cpuRate).catch((e: unknown) => {
      console.error(`[emulation] could not throttle OOPIF target ${target.url()}: ${String(e)}`);
    });
  };
  browser.on('targetcreated', onTarget);
  return { dispose: () => { browser.off('targetcreated', onTarget); } };
}

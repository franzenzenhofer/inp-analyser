import { launchChrome } from '../browser/launch.js';
import type { DiscoveryResult } from '../discovery/types.js';
import type { Condition } from '../model/scenario.js';
import { createPoliteness, SYSTEM_CLOCK } from '../safety/politeness.js';
import { discoverStable } from '../scenario/discover-stable.js';

/** Two discovery passes on fresh loads; prints every stable target with its safety class and listeners. */
export async function discoverCommand(url: string, options: { device: 'mobile' | 'desktop'; maxTargets: number }): Promise<DiscoveryResult> {
  const browser = await launchChrome();
  try {
    const condition: Condition = { device: options.device, cpuRate: 1, thirdParty: { kind: 'allow' }, consent: 'none', cache: 'cold' };
    const result = await discoverStable({ browser, url, condition, maxTargets: options.maxTargets, politeness: createPoliteness({ minIntervalMs: 10_000, clock: SYSTEM_CLOCK }) });
    for (const t of result.targets) {
      const listeners = t.listeners.map((l) => `${l.type}@${l.url}:${l.line}`).join(' ');
      console.log(`[discover] ${t.target.safety.padEnd(25)} ${t.target.kind.padEnd(10)} ${t.target.selector}  "${t.target.label}"  x${t.mergedCount}  ${listeners}`);
    }
    for (const t of result.excluded) console.log(`[discover] EXCLUDED ${t.target.selector} "${t.target.label}": ${t.target.safetyReason}`);
    for (const g of result.globalListeners) console.log(`[discover] global ${g.on} ${g.type} ${g.url}:${g.line}`);
    return result;
  } finally {
    await browser.close();
  }
}

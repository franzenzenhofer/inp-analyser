import type { RunMeta } from './run-meta.js';

/** What a lab run cannot see. Printed in every report so lab numbers are never read as field INP. */
export function limitations(meta: RunMeta): string[] {
  const c = meta.condition;
  return [
    `Lab values are "lab @ CPU ${c.cpuRate}x, ${c.device} emulation, headless Chrome ${meta.chromeVersion}" on one machine - not INP. INP is the CrUX field p75 above.`,
    'CrUX INP is the 75th percentile over 28 days of real Chrome users\' page loads, each load\'s INP being its worst interaction minus one per 50 (https://developers.google.com/speed/docs/insights/v5/about, https://web.dev/articles/inp#what-is-inp).',
    'Only interactions the tool discovered and could trigger safely were measured; logged-in states, real form input, ads and cross-origin iframes were not.',
    'First-party mutating requests were blocked and cross-document navigations answered with 204, so work that depends on those responses is not measured.',
    'GPU/raster work is not CPU-throttled by Chrome\'s CPU throttling; presentation delay on real mid-tier phones can be larger.',
  ];
}

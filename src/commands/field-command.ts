import { join } from 'node:path';
import { buildFieldSummary, type DeviceField } from '../field/field-summary.js';
import { readGoogleApiKey } from '../field/http.js';
import { RunStore } from '../store/jsonl.js';

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function deviceLine(name: string, device: DeviceField): string {
  const inp = device.inp;
  if (inp.kind === 'no-data') return `${name}: no CrUX INP (${inp.reason})`;
  const d = inp.densities;
  return `${name}: INP p75 ${inp.p75} ms (${inp.level} level, ${inp.collectionPeriod.firstDate}..${inp.collectionPeriod.lastDate}) good ${pct(d.good)} / needs improvement ${pct(d.needsImprovement)} / poor ${pct(d.poor)} | PSI: ${device.psiParity.page.kind}`;
}

/** CrUX + PSI field data for one URL: the numbers PSI and Search Console show. No page loads. */
export async function fieldCommand(url: string, out: string): Promise<string> {
  const summary = await buildFieldSummary(url, readGoogleApiKey());
  const store = new RunStore(out);
  await store.init();
  await store.writeJson('field.json', summary);
  console.log(deviceLine('phone  ', summary.phone));
  console.log(deviceLine('desktop', summary.desktop));
  for (const note of summary.sourceNotes) console.log(`  - ${note}`);
  return join(out, 'field.json');
}

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FieldSummary } from '../field/field-summary.js';
import { buildReport } from '../report/build-report.js';
import { parseRunMeta } from '../report/run-meta.js';
import { writeReports } from '../report/write-reports.js';
import { RunStore } from '../store/jsonl.js';
import { TOOL } from '../tool.js';

/** field.json was written by this tool from zod-validated API responses (src/field). */
function isFieldSummary(value: unknown): value is FieldSummary {
  return typeof value === 'object' && value !== null && 'phone' in value && 'desktop' in value && 'collectionPeriods' in value;
}

/** Rebuilds report.json (and the rendered reports) from runs.jsonl + meta.json (+ field.json) - no measuring. */
export async function reportCommand(dir: string): Promise<string> {
  const store = new RunStore(dir);
  const meta = parseRunMeta(await store.readJson('meta.json'), join(dir, 'meta.json'));
  const fieldRaw: unknown = existsSync(join(dir, 'field.json')) ? await store.readJson('field.json') : undefined;
  if (fieldRaw !== undefined && !isFieldSummary(fieldRaw)) throw new Error(`[report] ${join(dir, 'field.json')} is not a field summary`);
  const report = buildReport({ meta, records: await store.readAll(), ...(fieldRaw === undefined ? {} : { field: fieldRaw }), tool: TOOL });
  await writeReports(store, report);
  return join(dir, 'report.json');
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FieldSummary } from '../../src/field/field-summary.js';
import type { AnalysisReport } from '../../src/model/report.js';
import { reconcile } from '../../src/report/reconcile.js';

/**
 * Real samples (test data only): a real `inp analyse` run on the local test site (no field data) and real
 * CrUX/PSI field data for en.wikipedia.org (public example origin). Combined, they give a full report.
 */
const SAMPLES = join(import.meta.dirname, '..', '..', 'tests', 'samples');

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(SAMPLES, name), 'utf8'));
}

function isObjectWith(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && keys.every((k) => k in value);
}

/** Written by this tool from its own types (report.json / field.json); a shape check guards against a wrong file. */
function isAnalysisReport(value: unknown): value is AnalysisReport {
  return isObjectWith(value, ['tool', 'url', 'condition', 'issues', 'comparisons', 'scenarios', 'hazard', 'targets', 'run', 'limitations']);
}

function isFieldSummary(value: unknown): value is FieldSummary {
  return isObjectWith(value, ['phone', 'desktop', 'history', 'collectionPeriods', 'sourceNotes']);
}

export function labOnlySample(): AnalysisReport {
  const value = readJson('report-boot-long-tasks.json');
  if (!isAnalysisReport(value)) throw new Error('tests/samples/report-boot-long-tasks.json is not an AnalysisReport');
  return value;
}

export function fieldSample(): FieldSummary {
  const value = readJson('field-wikipedia.json');
  if (!isFieldSummary(value)) throw new Error('tests/samples/field-wikipedia.json is not a FieldSummary');
  return value;
}

/** Lab report + field data, reconciled with the real reconcile() exactly as build-report.ts does. */
export function fullSample(): AnalysisReport {
  const report = labOnlySample();
  const field = fieldSample();
  const device = report.condition.device === 'mobile' ? field.phone : field.desktop;
  return { ...report, field, reconciliation: reconcile(device.inp, report.scenarios.map((s) => s.summary), `lab @ CPU ${report.condition.cpuRate}x, ${report.condition.device}`) };
}

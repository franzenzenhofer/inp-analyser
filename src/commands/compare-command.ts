import { compareSamples, durationsOf, finaliseComparisons, type Comparison } from '../issues/comparisons.js';
import { parseRunMeta } from '../report/run-meta.js';
import { RunStore } from '../store/jsonl.js';

/**
 * Before/after: for every scenario both run directories measured (same target selector + phase + offset),
 * Hodges-Lehmann shift (after - before) with 95% CI, Mann-Whitney p (Holm over all scenarios), Cliff's delta.
 */
export async function compareCommand(beforeDir: string, afterDir: string): Promise<Comparison[]> {
  const [before, after] = [new RunStore(beforeDir), new RunStore(afterDir)];
  const [metaA, metaB] = [parseRunMeta(await before.readJson('meta.json'), beforeDir), parseRunMeta(await after.readJson('meta.json'), afterDir)];
  const [runsA, runsB] = [await before.readAll(), await after.readAll()];
  const shared = metaA.scenarios.filter((a) => metaB.scenarios.some((b) => b.id === a.id));
  if (shared.length === 0) throw new Error('[compare] the two runs share no scenario (different targets or phases)');
  const drafts = shared.flatMap((s) => compareSamples({ kind: 'phase', label: `${s.id}: after vs before`, baselineScenarioId: s.id, variantScenarioId: s.id }, durationsOf(runsA, s.id), durationsOf(runsB, s.id)) ?? []);
  const result = finaliseComparisons(drafts);
  for (const c of result) {
    console.log(`[compare] ${c.label}: ${Math.round(c.medianBaselineMs)} -> ${Math.round(c.medianVariantMs)} ms, shift ${Math.round(c.shift.estimate)} [${Math.round(c.shift.low)}, ${Math.round(c.shift.high)}], p(Holm) ${c.pHolm.toPrecision(2)}, ${c.significant ? 'significant' : 'not significant'}`);
  }
  return result;
}

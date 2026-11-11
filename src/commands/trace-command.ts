import { analyseTrace } from '../analysis/attribution.js';
import { loadEntityMap } from '../analysis/entities.js';
import { loadTraceEvents, parseTrace } from '../analysis/trace-engine-adapter.js';
import { ALL_RULES } from '../issues/registry.js';
import type { MeasuredRun, RuleContext } from '../issues/types.js';
import type { RunRecord } from '../model/run.js';
import type { Condition } from '../model/scenario.js';

export interface TraceFinding {
  readonly interactionId: number;
  readonly eventTypes: readonly string[];
  readonly startTimeMs: number;
  readonly durationMs: number;
  readonly phases: { readonly inputDelay: number; readonly processing: number; readonly presentationDelay: number };
  readonly issues: ReadonlyArray<{ readonly ruleId: string; readonly title: string; readonly evidence: readonly string[] }>;
  readonly measurementArtifacts: readonly string[];
}

const TRACE_CONDITION: Condition = { device: 'mobile', cpuRate: 1, thirdParty: { kind: 'allow' }, consent: 'none', cache: 'cold' };

/** Adapter so the per-run rules can read one trace interaction; never stored or reported as a run. */
function asRun(a: ReturnType<typeof analyseTrace>[number]): MeasuredRun {
  const record: RunRecord = {
    runId: `trace-${a.interaction.timing.interactionId}`, scenarioId: 'trace', stage: 'preflight', block: 0, mode: 'attribution', startedAt: '', chromeVersion: '',
    outcome: { kind: 'measured', timing: a.interaction.timing }, attribution: a.attribution, pageExceptions: [], blockedRequests: [],
    machine: { benchmarkIndex: 0, loadAverage1m: 0, onBattery: false }, notes: ['from an existing trace file'],
  };
  return { record, timing: a.interaction.timing, attribution: a.attribution };
}

/**
 * Issues in an existing DevTools recording (one recording = one sample: no statistics, certainty is the
 * reader's job). Page-scope rules that need live page facts (DOM size, viewport) cannot run on a trace.
 */
export async function traceCommand(path: string, entityMapPath?: string): Promise<TraceFinding[]> {
  const events = await loadTraceEvents(path);
  const entityMap = entityMapPath === undefined ? { entities: [] } : await loadEntityMap(entityMapPath);
  const analysed = analyseTrace(await parseTrace(events), events, entityMap);
  const ctx: RuleContext = { scenario: { id: 'trace', targetId: 'trace', phase: 'idle', condition: TRACE_CONDITION }, target: { id: 'trace', selector: '', label: '', kind: 'listener', rect: { x: 0, y: 0, width: 0, height: 0 }, aboveFold: true, handlerSignature: '', safety: 'safe', safetyReason: '' } };
  return analysed.map((a) => {
    const run = asRun(a);
    const t = a.interaction.timing;
    const issues = ALL_RULES.filter((r) => r.scope === 'interaction').flatMap((rule) => {
      const finding = rule.check(run, ctx);
      return finding === undefined ? [] : [{ ruleId: rule.id, title: rule.title, evidence: finding.evidence.slice(0, 4).map((e) => `${e.label}: ${e.value}`) }];
    });
    return { interactionId: t.interactionId, eventTypes: t.eventTypes, startTimeMs: t.startTime, durationMs: t.durationExact, phases: { inputDelay: t.inputDelay, processing: t.processing, presentationDelay: t.presentationDelay }, issues, measurementArtifacts: a.attribution.measurementArtifacts };
  });
}

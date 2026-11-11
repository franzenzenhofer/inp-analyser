import type { Browser } from 'puppeteer-core';
import { analyseTrace } from '../analysis/attribution.js';
import type { EntityMap } from '../analysis/entities.js';
import { joinLoaf } from '../analysis/loaf-join.js';
import { parseTrace, type TraceEvent } from '../analysis/trace-engine-adapter.js';
import { openSession } from '../browser/session.js';
import { stopTrace } from '../browser/tracing.js';
import type { Attribution, Outcome } from '../model/measurement.js';
import type { MachineSnapshot, RunRecord } from '../model/run.js';
import type { RunMode, Scenario, Stage, Target } from '../model/scenario.js';
import type { GuardLog } from '../safety/guard-log.js';
import type { GuardPolicy } from '../safety/request-guard.js';
import { interactBoot, interactIdle, type Interacted } from './interact.js';
import { MATCH_TOLERANCE_MS, matchInteraction } from './match-interaction.js';

export interface RunPlan {
  readonly runId: string;
  readonly url: string;
  readonly scenario: Scenario;
  readonly target: Target;
  readonly stage: Stage;
  readonly block: number;
  readonly mode: RunMode;
  readonly blockedUrlPatterns: readonly string[];
  readonly entityMap: EntityMap;
  readonly guardPolicy: GuardPolicy;
}

export interface RunResult {
  readonly record: RunRecord;
  readonly traceEvents: readonly TraceEvent[];
}

interface Interaction { readonly interacted: Interacted; readonly events: TraceEvent[]; readonly guard: GuardLog }

async function interact(browser: Browser, plan: RunPlan): Promise<Interaction> {
  const { condition } = plan.scenario;
  const session = await openSession(browser, { condition, mode: plan.mode, blockedUrlPatterns: plan.blockedUrlPatterns, guardPolicy: plan.guardPolicy });
  try {
    const run = plan.scenario.phase === 'boot' ? interactBoot : interactIdle;
    const interacted = await run(session, plan, condition.device);
    return { interacted, events: await stopTrace(session.page), guard: session.guard.log };
  } finally {
    await session.close();
  }
}

function guardNotes(log: GuardLog): { blockedRequests: string[]; notes: string[] } {
  return {
    blockedRequests: log.blockedRequests.map((r) => `${r.method} ${r.url} (${r.reason})`),
    notes: [
      ...log.cancelledNavigations.map((n) => `navigation cancelled (204): ${n.method} ${n.url}`),
      ...log.dialogs.map((d) => `dialog dismissed: ${d.type} "${d.message}"`),
      ...log.closedTabs.map((t) => `new tab closed: ${t.url}`),
      ...log.deniedDownloads.map((d) => `download denied: ${d}`),
      ...log.errors.map((e) => `guard error: ${e}`),
    ],
  };
}

/** The page saw the interaction but the trace did not: events were dropped (e.g. full trace buffer). */
function missedReason(interacted: Extract<Interacted, { kind: 'interacted' }>): string {
  const seen = interacted.store.events.find((e) => e.interactionId > 0 && Math.abs(e.startTime - interacted.expectedStartMs) <= MATCH_TOLERANCE_MS);
  return seen === undefined ? 'no interaction in the trace at the input time' : `trace dropped the interaction (page observed ${seen.name} ${Math.round(seen.duration)} ms)`;
}

interface Analysed { readonly outcome: Outcome; readonly attribution?: Attribution; readonly hitVerified?: boolean }

async function analyse(interacted: Interacted, events: readonly TraceEvent[], plan: RunPlan): Promise<Analysed> {
  if (interacted.kind === 'target-missing') return { outcome: { kind: 'target-missing' } };
  const analysed = analyseTrace(await parseTrace(events), events, plan.entityMap);
  const match = matchInteraction(analysed.map((a) => a.interaction), interacted.expectedStartMs);
  if (match === undefined) return { outcome: { kind: 'missed', reason: missedReason(interacted) } };
  const hitVerified = interacted.store.hits[match.timing.interactionId];
  if (hitVerified === false) return { outcome: { kind: 'missed', reason: 'input landed on another element' }, hitVerified };
  const traceAttribution = analysed.find((a) => a.interaction === match)?.attribution;
  if (traceAttribution === undefined) throw new Error('[run] matched interaction has no attribution');
  const withLoaf = { ...traceAttribution, scripts: joinLoaf(traceAttribution.scripts, interacted.store.frames) };
  const attribution: Attribution = plan.mode === 'attribution' ? { ...withLoaf, live: { mutationsAfterInput: interacted.store.mutations } } : withLoaf;
  const outcome: Outcome = { kind: 'measured', timing: match.timing };
  return hitVerified === undefined ? { outcome, attribution } : { outcome, attribution, hitVerified };
}

/** One page session: open, interact, trace, close - then analyse with the browser idle (no parsing during measurement). */
export async function executeRun(browser: Browser, plan: RunPlan, machine: MachineSnapshot): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const { interacted, events, guard } = await interact(browser, plan);
  const analysed = await analyse(interacted, events, plan);
  const guarded = guardNotes(guard);
  const record: RunRecord = {
    runId: plan.runId, scenarioId: plan.scenario.id, stage: plan.stage, block: plan.block, mode: plan.mode, startedAt,
    chromeVersion: await browser.version(), outcome: analysed.outcome, pageExceptions: interacted.kind === 'interacted' ? interacted.store.errors : [],
    blockedRequests: guarded.blockedRequests, machine, notes: [...interacted.notes, ...guarded.notes],
    ...(interacted.kind === 'interacted' ? { page: interacted.store.page } : {}),
    ...(analysed.attribution === undefined ? {} : { attribution: analysed.attribution }),
    ...(analysed.hitVerified === undefined ? {} : { hitVerified: analysed.hitVerified }),
  };
  return { record, traceEvents: events };
}

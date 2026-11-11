import type { TraceAttribution } from '../model/measurement.js';
import { activities } from './activities.js';
import { nonCompositedAnimations } from './animations.js';
import { blockingTasks } from './blocking-tasks.js';
import { EntityResolver, type EntityMap } from './entities.js';
import { extractInteractions, type TraceInteraction } from './interactions.js';
import { mainFrameMainThread } from './main-thread.js';
import { renderingCosts } from './rendering-costs.js';
import { scriptCosts } from './script-costs.js';
import type { ParsedTrace, TraceEvent } from './trace-engine-adapter.js';

export interface AnalysedInteraction {
  readonly interaction: TraceInteraction;
  readonly attribution: TraceAttribution;
}

function unattributed(interaction: TraceInteraction, attribution: Omit<TraceAttribution, 'unattributedMs'>): number {
  const script = attribution.scripts.reduce((sum, s) => sum + s.selfMs, 0);
  const rendering = attribution.rendering.reduce((sum, r) => sum + r.ms, 0);
  const other = attribution.activities.reduce((sum, a) => sum + a.ms, 0);
  return Math.max(0, interaction.timing.durationExact - script - rendering - other);
}

/** Every interaction in the trace with its script, rendering and blocking-task attribution. */
export function analyseTrace(parsed: ParsedTrace, events: readonly TraceEvent[], entityMap?: EntityMap): AnalysedInteraction[] {
  const thread = mainFrameMainThread(parsed);
  const entities = new EntityResolver(parsed, entityMap);
  const ctx = { parsed, thread, entities };
  return extractInteractions(parsed).map((interaction) => {
    const partial = {
      scripts: scriptCosts(interaction, ctx),
      rendering: renderingCosts(interaction, parsed, thread),
      blockingTasks: blockingTasks(interaction, ctx),
      nonCompositedAnimations: nonCompositedAnimations(interaction, events),
      ...activities(interaction, parsed, thread),
    };
    return { interaction, attribution: { ...partial, unattributedMs: unattributed(interaction, partial) } };
  });
}

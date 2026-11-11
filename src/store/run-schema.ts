import { z } from 'zod';

/** Validates runs.jsonl lines on read: the store outlives code versions, so shapes are checked, not trusted. */
const timing = z.object({
  interactionId: z.number(), interactionType: z.enum(['pointer', 'keyboard']), eventTypes: z.array(z.string()),
  startTime: z.number(), durationExact: z.number(), durationRounded: z.number(),
  inputDelay: z.number(), processing: z.number(), presentationDelay: z.number(),
  backendNodeId: z.number().exactOptional(), targetSelector: z.string().exactOptional(),
});

const outcome = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('measured'), timing }),
  z.object({ kind: z.literal('censored-below-threshold'), thresholdMs: z.number() }),
  z.object({ kind: z.literal('missed'), reason: z.string() }),
  z.object({ kind: z.literal('no-paint') }),
  z.object({ kind: z.literal('target-missing') }),
  z.object({ kind: z.literal('navigation-cancelled'), timing: timing.exactOptional() }),
]);

const phase = z.enum(['input-delay', 'processing', 'presentation']);

const attribution = z.object({
  scripts: z.array(z.object({
    url: z.string(), entity: z.string(), isFirstParty: z.boolean(), functionName: z.string(), line: z.number(), column: z.number(),
    selfMs: z.number(), phase, invoker: z.string(),
    invokerType: z.enum(['classic-script', 'module-script', 'event-listener', 'user-callback', 'resolve-promise', 'reject-promise', 'unknown']),
  })),
  rendering: z.array(z.object({
    kind: z.enum(['style', 'layout', 'paint', 'commit']), ms: z.number(), forced: z.boolean(), stack: z.array(z.string()),
    elementCount: z.number().exactOptional(), dirtyObjects: z.number().exactOptional(), totalObjects: z.number().exactOptional(),
  })),
  blockingTasks: z.array(z.object({ startTime: z.number(), durationMs: z.number(), topScriptUrl: z.string(), entity: z.string(), isFirstParty: z.boolean() })),
  nonCompositedAnimations: z.array(z.object({ name: z.string(), nodeName: z.string(), failureCode: z.number(), unsupportedProperties: z.array(z.string()) })),
  activities: z.array(z.object({ name: z.string(), ms: z.number() })),
  measurementArtifacts: z.array(z.string()),
  unattributedMs: z.number(),
  live: z.object({ mutationsAfterInput: z.number() }).exactOptional(),
});

export const runRecordSchema = z.object({
  runId: z.string(), scenarioId: z.string(),
  stage: z.enum(['preflight', 'screening', 'deep-dive', 'causal']), block: z.number(), mode: z.enum(['timing', 'attribution']),
  startedAt: z.string(), chromeVersion: z.string(), outcome, attribution: attribution.exactOptional(),
  pageExceptions: z.array(z.string()), blockedRequests: z.array(z.string()), tracePath: z.string().exactOptional(),
  machine: z.object({ benchmarkIndex: z.number(), loadAverage1m: z.number(), onBattery: z.boolean() }),
  hitVerified: z.boolean().exactOptional(), notes: z.array(z.string()), excluded: z.string().exactOptional(),
  page: z.object({ domElements: z.number(), maxDepth: z.number(), maxChildren: z.number(), hasMobileViewport: z.boolean() }).exactOptional(),
});

/** One Chrome interaction (Event Timing entries sharing an interactionId), all times in ms. */
export interface InteractionTiming {
  readonly interactionId: number;
  readonly interactionType: 'pointer' | 'keyboard';
  readonly eventTypes: readonly string[];
  /** Event timestamp relative to navigation start. */
  readonly startTime: number;
  /** Exact duration from the trace (Chromium does not round it there). */
  readonly durationExact: number;
  /** round(d/8)*8, parity with PerformanceEventTiming.duration and web-vitals. */
  readonly durationRounded: number;
  readonly inputDelay: number;
  readonly processing: number;
  readonly presentationDelay: number;
  /** BackendNodeId of the event target from the trace (resolve via DOM.resolveNode while the page lives). */
  readonly backendNodeId?: number;
  readonly targetSelector?: string;
}

/** Why a run produced no latency value. Outcomes are recorded, never silently dropped. */
export type Outcome =
  | { readonly kind: 'measured'; readonly timing: InteractionTiming }
  | { readonly kind: 'censored-below-threshold'; readonly thresholdMs: number }
  | { readonly kind: 'missed'; readonly reason: string }
  | { readonly kind: 'no-paint' }
  | { readonly kind: 'target-missing' }
  | { readonly kind: 'navigation-cancelled'; readonly timing?: InteractionTiming };

export type InvokerType = 'classic-script' | 'module-script' | 'event-listener' | 'user-callback' | 'resolve-promise' | 'reject-promise' | 'unknown';
export type TimingPhase = 'input-delay' | 'processing' | 'presentation';

export interface ScriptCost {
  readonly url: string;
  readonly entity: string;
  readonly isFirstParty: boolean;
  readonly functionName: string;
  readonly line: number;
  readonly column: number;
  readonly selfMs: number;
  readonly phase: TimingPhase;
  readonly invokerType: InvokerType;
  readonly invoker: string;
}

export interface RenderingCost {
  readonly kind: 'style' | 'layout' | 'paint' | 'commit';
  readonly ms: number;
  readonly forced: boolean;
  readonly elementCount?: number;
  readonly dirtyObjects?: number;
  readonly totalObjects?: number;
  readonly stack: readonly string[];
}

export interface LongTask { readonly startTime: number; readonly durationMs: number; readonly topScriptUrl: string; readonly entity: string; readonly isFirstParty: boolean }

/** An animation running in the interaction window that the compositor could not take over (main-thread animation). */
export interface NonCompositedAnimation { readonly name: string; readonly nodeName: string; readonly failureCode: number; readonly unsupportedProperties: readonly string[] }

/** What the trace says about one interaction window. */
export interface TraceAttribution {
  readonly scripts: readonly ScriptCost[];
  readonly rendering: readonly RenderingCost[];
  /** Long tasks that were running when the input arrived (input delay causes). */
  readonly blockingTasks: readonly LongTask[];
  readonly nonCompositedAnimations: readonly NonCompositedAnimation[];
  /** Other main-thread self time by trace event name (GC, compile, parse, hit test, ...). */
  readonly activities: readonly ActivityCost[];
  /** Interaction overlaps tracing-tool work (e.g. CpuProfiler::StartProfiling) - not a page problem. */
  readonly measurementArtifacts: readonly string[];
  /** Interaction time not explained by main-thread work (GPU/compositor/frame wait). */
  readonly unattributedMs: number;
}

export interface ActivityCost { readonly name: string; readonly ms: number }

/** What only the live page can tell during the run (listener facts live on the discovered Target). */
export interface LiveContext {
  /** DOM mutation records observed by the in-page MutationObserver (attribution runs only). */
  readonly mutationsAfterInput: number;
}

export interface Attribution extends TraceAttribution {
  readonly live?: LiveContext;
}

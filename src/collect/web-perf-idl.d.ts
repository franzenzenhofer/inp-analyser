/**
 * DOM typings missing from lib.dom, transcribed from the specs:
 * LoAF IDL https://w3c.github.io/long-animation-frames/#sec-PerformanceLongAnimationFrameTiming
 * Event Timing durationThreshold https://w3c.github.io/event-timing/#sec-modifications-perf-timeline
 */
interface PerformanceObserverInit {
  durationThreshold?: number;
}

type ScriptInvokerType = 'classic-script' | 'module-script' | 'event-listener' | 'user-callback' | 'resolve-promise' | 'reject-promise';
type ScriptWindowAttribution = 'self' | 'descendant' | 'ancestor' | 'same-page' | 'other';

interface PerformanceScriptTiming extends PerformanceEntry {
  readonly startTime: number;
  readonly duration: number;
  readonly executionStart: number;
  readonly forcedStyleAndLayoutDuration: number;
  readonly pauseDuration: number;
  readonly invoker: string;
  readonly invokerType: ScriptInvokerType;
  readonly windowAttribution: ScriptWindowAttribution;
  readonly sourceURL: string;
  readonly sourceFunctionName: string;
  readonly sourceCharPosition: number;
}

interface PerformanceLongAnimationFrameTiming extends PerformanceEntry {
  readonly renderStart: number;
  readonly styleAndLayoutStart: number;
  readonly blockingDuration: number;
  readonly firstUIEventTimestamp: number;
  readonly scripts: readonly PerformanceScriptTiming[];
}

declare const PerformanceLongAnimationFrameTiming: {
  prototype: PerformanceLongAnimationFrameTiming;
  new (): PerformanceLongAnimationFrameTiming;
};

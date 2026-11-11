/** Shapes the in-page observers write into `window.inpAnalyserStore`; read back via page.evaluate. */
export interface ObservedEvent {
  readonly name: string;
  readonly interactionId: number;
  readonly startTime: number;
  readonly duration: number;
  readonly processingStart: number;
  readonly processingEnd: number;
  readonly targetSelector: string;
}

export interface ObservedScript {
  readonly invoker: string;
  readonly invokerType: string;
  readonly sourceURL: string;
  readonly sourceFunctionName: string;
  readonly sourceCharPosition: number;
  readonly startTime: number;
  readonly duration: number;
  readonly forcedStyleAndLayoutDuration: number;
  readonly pauseDuration: number;
}

export interface ObservedFrame {
  readonly startTime: number;
  readonly duration: number;
  readonly renderStart: number;
  readonly styleAndLayoutStart: number;
  readonly blockingDuration: number;
  readonly firstUIEventTimestamp: number;
  readonly scripts: readonly ObservedScript[];
}

export interface InpStore {
  readonly events: ObservedEvent[];
  readonly frames: ObservedFrame[];
  readonly errors: string[];
  /** Event target per interactionId, to verify which element a scheduled tap really hit. */
  readonly targets: Map<number, WeakRef<Element>>;
  mutations: number;
}

declare global {
  interface Window {
    inpAnalyserStore: InpStore;
  }
}

import type { ConsentState } from '../consent/consent-state.js';

/** When the interaction happens relative to the page lifecycle (boot-vs-idle method). */
export type Phase = 'boot' | 'consent' | 'idle';
export type Device = 'mobile' | 'desktop';
export type ConsentChoice = 'accept' | 'reject' | 'none';

/** Third-party arm of an experiment: everything allowed, everything blocked, or one entity left out. */
export type ThirdPartyArm =
  | { readonly kind: 'allow' }
  | { readonly kind: 'block-all' }
  | { readonly kind: 'block-entity'; readonly entity: string };

export interface Condition {
  readonly device: Device;
  readonly cpuRate: number;
  readonly thirdParty: ThirdPartyArm;
  readonly consent: ConsentChoice;
  readonly cache: 'cold';
  /** consent 'accept': the stored accepted-consent state seeded into every fresh context (see src/consent). */
  readonly consentState?: ConsentState;
}

export type TargetKind = 'button' | 'link' | 'input-text' | 'select' | 'checkbox' | 'summary' | 'role' | 'listener';
export type SafetyClass = 'safe' | 'cross-document-navigation' | 'mutating' | 'dangerous';

export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface Target {
  readonly id: string;
  readonly selector: string;
  readonly label: string;
  readonly kind: TargetKind;
  readonly rect: Rect;
  readonly aboveFold: boolean;
  /** Listener script:line set + DOM signature; targets sharing it are one target (dedupe). */
  readonly handlerSignature: string;
  readonly safety: SafetyClass;
  readonly safetyReason: string;
}

export interface Scenario {
  readonly id: string;
  readonly targetId: string;
  readonly phase: Phase;
  /** Milliseconds after navigation start for boot taps; undefined for consent/idle. */
  readonly offsetMs?: number;
  /** Boot taps: viewport point of the target as laid out at offsetMs (boot layout differs from the final one). */
  readonly tapPoint?: { readonly x: number; readonly y: number };
  readonly condition: Condition;
}

export type Stage = 'preflight' | 'screening' | 'deep-dive' | 'causal';
export type RunMode = 'timing' | 'attribution';

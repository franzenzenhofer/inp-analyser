import type { Rect, Target, TargetKind } from '../model/scenario.js';

/** Options handed to the in-page scan; constants live on the Node side (in-page code cannot import). */
export interface PageScanOptions {
  readonly interactiveSelector: string;
  readonly interactiveRoles: readonly string[];
  /** Cap for elements accepted only because their computed cursor is pointer. */
  readonly maxPointerCandidates: number;
  /** Cap for elements whose computed cursor is read at all (bounds the cost on huge DOMs). */
  readonly maxPointerScan: number;
  readonly maxLabelLength: number;
}

export interface FormContext {
  /** Effective method: submitter formmethod attribute, else form.method ('get' | 'post' | 'dialog'). */
  readonly method: string;
  readonly hasPassword: boolean;
  /** Any field with autocomplete cc-* (https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill-field). */
  readonly hasPayment: boolean;
  readonly isSubmit: boolean;
}

/** One interactive element as seen in the page (plain JSON, produced by in-page-describe.ts). */
export interface Candidate {
  /**
   * Puppeteer selector. `tag#id`, `tag[data-testid="x"]` or a short `>`-path with :nth-of-type.
   * Open shadow roots are crossed with puppeteer's deep combinator: `host >>> inner`
   * (https://pptr.dev/guides/page-interactions#querying-elements-in-shadow-dom).
   */
  readonly selector: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly value: string;
  readonly title: string;
  readonly kind: TargetKind;
  /** Page coordinates (getBoundingClientRect + scroll offset). */
  readonly rect: Rect;
  readonly aboveFold: boolean;
  /** Resolved absolute href of a[href]; null for everything else. */
  readonly href: string | null;
  readonly linkTarget: string | null;
  readonly download: boolean;
  readonly form: FormContext | null;
  /** Tag + sorted class list with digits stripped + behaviour attributes (type, role, target, download). */
  readonly domSignature: string;
}

/** An event listener registered on a node; line and column are 1-based. */
export interface Listener {
  readonly type: string;
  readonly url: string;
  readonly line: number;
  readonly column: number;
}

export interface GlobalListener extends Listener {
  readonly on: 'document' | 'window';
}

export interface DiscoveredTarget {
  readonly target: Target;
  readonly candidate: Candidate;
  /** Own listeners of the element (depth 0), interaction event types only. */
  readonly listeners: readonly Listener[];
  /** How many candidates with the same handler signature were collapsed into this one (incl. itself). */
  readonly mergedCount: number;
}

export interface DiscoveryResult {
  readonly pageUrl: string;
  /** Clickable targets (safe, cross-document-navigation, mutating), ordered and capped at maxTargets. */
  readonly targets: readonly DiscoveredTarget[];
  /** Targets classified 'dangerous': never clicked, reported. */
  readonly excluded: readonly DiscoveredTarget[];
  /** Interaction listeners on document and window (often third-party tag managers). */
  readonly globalListeners: readonly GlobalListener[];
  readonly candidateCount: number;
}

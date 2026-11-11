import type { CDPSession, Protocol } from 'puppeteer-core';
import { parseCandidates } from './candidate-schema.js';
import {
  deepSelector, describeElement, domSignature, formContextOf, inputKind, isSubmitControl, kindOf, labelOf,
  localSelector, nthOfType, pageRect, pathSelector, uniqueIn, valueOf,
} from './in-page-describe.js';
import {
  collectRoots, composedContains, findCandidateElements, insideCandidate, isCovered, isInteractable,
  pointerElements, startsPointerRegion,
} from './in-page-find.js';
import type { Candidate, PageScanOptions } from './types.js';

/** Remote objects of one scan live in this group and are released together. */
export const DISCOVERY_OBJECT_GROUP = 'inp-analyser-discovery';

const INTERACTIVE_ROLES = ['button', 'tab', 'menuitem', 'link', 'checkbox', 'switch', 'option', 'combobox'] as const;
const INTERACTIVE_SELECTOR = [
  'button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
  ...INTERACTIVE_ROLES.map((role) => `[role=${role}]`), '[onclick]', '[tabindex]:not([tabindex^="-"])',
].join(',');

export const DEFAULT_SCAN_OPTIONS: PageScanOptions = {
  interactiveSelector: INTERACTIVE_SELECTOR,
  interactiveRoles: INTERACTIVE_ROLES,
  maxPointerCandidates: 300,
  maxPointerScan: 6000,
  maxLabelLength: 80,
};

/** Every declaration the in-page scan needs; they are injected side by side into one function scope. */
const IN_PAGE_FUNCTIONS: readonly ((...args: never[]) => unknown)[] = [
  collectRoots, composedContains, isCovered, isInteractable, insideCandidate, startsPointerRegion, pointerElements,
  findCandidateElements, nthOfType, uniqueIn, pathSelector, localSelector, deepSelector, domSignature, valueOf,
  labelOf, inputKind, kindOf, isSubmitControl, formContextOf, pageRect, describeElement,
];

/** The self-contained scan expression; evaluates to `{ nodes: Element[], candidates: Candidate[] }`. */
export function candidateScript(options: PageScanOptions): string {
  const declarations = IN_PAGE_FUNCTIONS.map((fn) => fn.toString()).join('\n');
  return `(() => {\n${declarations}\nconst options = ${JSON.stringify(options)};\n`
    + 'const nodes = findCandidateElements(options);\n'
    + 'return { nodes, candidates: nodes.map((el) => describeElement(el, options)) };\n})()';
}

export interface CandidateScan {
  readonly candidates: readonly Candidate[];
  /** Remote object ids of the candidate elements, index-aligned with `candidates`. */
  readonly nodeObjectIds: readonly string[];
}

function requireObjectId(object: Protocol.Runtime.RemoteObject, what: string): string {
  if (object.objectId === undefined) {
    throw new Error(`[discovery] ${what} came back without an object id (type ${object.type})`);
  }
  return object.objectId;
}

async function nodeObjectIdsOf(session: CDPSession, scanId: string): Promise<string[]> {
  const nodes = await session.send('Runtime.callFunctionOn', { objectId: scanId, functionDeclaration: 'function nodes() { return this.nodes; }', objectGroup: DISCOVERY_OBJECT_GROUP });
  const props = await session.send('Runtime.getProperties', { objectId: requireObjectId(nodes.result, 'node array'), ownProperties: true });
  return props.result
    .filter((p) => /^\d+$/.test(p.name))
    .toSorted((a, b) => Number(a.name) - Number(b.name))
    .map((p) => requireObjectId(p.value ?? { type: 'undefined' }, `node ${p.name}`));
}

/** Runs the scan in the page's main world; the caller releases DISCOVERY_OBJECT_GROUP afterwards. */
export async function collectCandidates(session: CDPSession, options: PageScanOptions): Promise<CandidateScan> {
  const scan = await session.send('Runtime.evaluate', { expression: candidateScript(options), objectGroup: DISCOVERY_OBJECT_GROUP });
  if (scan.exceptionDetails !== undefined) {
    throw new Error(`[discovery] candidate scan threw in the page: ${scan.exceptionDetails.exception?.description ?? scan.exceptionDetails.text}`);
  }
  const scanId = requireObjectId(scan.result, 'scan result');
  const values = await session.send('Runtime.callFunctionOn', { objectId: scanId, functionDeclaration: 'function candidates() { return this.candidates; }', returnByValue: true });
  const candidates = parseCandidates(values.result.value);
  const nodeObjectIds = await nodeObjectIdsOf(session, scanId);
  if (nodeObjectIds.length !== candidates.length) {
    throw new Error(`[discovery] ${candidates.length} candidates but ${nodeObjectIds.length} node handles`);
  }
  return { candidates, nodeObjectIds };
}

export async function releaseCandidates(session: CDPSession): Promise<void> {
  await session.send('Runtime.releaseObjectGroup', { objectGroup: DISCOVERY_OBJECT_GROUP });
}

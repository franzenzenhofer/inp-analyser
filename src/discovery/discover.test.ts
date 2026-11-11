import { describe, expect, it } from 'vitest';
import type { TargetKind } from '../model/scenario.js';
import { buildDiscovery, targetId } from './build-result.js';
import { stableTargets } from './discover.js';
import type { Candidate, Listener } from './types.js';

const PAGE = 'https://site.example/list';

function candidate(selector: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    selector, label: selector, ariaLabel: '', value: '', title: '', kind: 'button', rect: { x: 0, y: 0, width: 100, height: 40 },
    aboveFold: true, href: null, linkTarget: null, download: false, form: null, domSignature: selector, ...overrides,
  };
}

function discover(candidates: readonly Candidate[], maxTargets = 12, listeners?: readonly (readonly Listener[])[]) {
  return buildDiscovery({ pageUrl: PAGE, candidates, listeners: listeners ?? candidates.map(() => []), globalListeners: [] }, maxTargets);
}

describe('buildDiscovery ranking', () => {
  it('orders above the fold first, then button/role/listener > input > select > link, then larger area', () => {
    const kinds: [string, TargetKind, boolean, number][] = [
      ['link', 'link', true, 100], ['select', 'select', true, 100], ['input', 'input-text', true, 100],
      ['small-button', 'button', true, 10], ['big-role', 'role', true, 500], ['below-button', 'button', false, 900],
    ];
    const result = discover(kinds.map(([s, kind, aboveFold, width]) => candidate(s, { kind, aboveFold, rect: { x: 0, y: 0, width, height: 10 } })));
    expect(result.targets.map((t) => t.target.selector)).toStrictEqual(['big-role', 'small-button', 'input', 'select', 'link', 'below-button']);
  });

  it('caps at maxTargets and keeps dangerous targets out of the clickable list', () => {
    const result = discover([candidate('a'), candidate('b'), candidate('c'), candidate('kill', { label: 'Konto löschen' })], 2);
    expect(result.targets.map((t) => t.target.selector)).toStrictEqual(['a', 'b']);
    expect(result.excluded.map((t) => [t.target.selector, t.target.safety])).toStrictEqual([['kill', 'dangerous']]);
  });

  it('merges repeated elements sharing listener location and DOM signature', () => {
    const shared: Listener = { type: 'click', url: 'https://site.example/app.js', line: 3, column: 9 };
    const cards = ['card-1', 'card-2', 'card-3'].map((s) => candidate(s, { domSignature: 'button.card' }));
    const result = discover([...cards, candidate('solo')], 12, [[shared], [shared], [shared], []]);
    expect(result.targets.map((t) => [t.target.selector, t.mergedCount])).toStrictEqual([['card-1', 3], ['solo', 1]]);
    expect(result.targets[0]?.target.handlerSignature).toBe('button.card|https://site.example/app.js:3:9');
  });

  it('fails loud on a missing listener list', () => {
    expect(() => discover([candidate('a')], 12, [])).toThrow(/no listener list/);
  });

  it('rejects a non-positive maxTargets', () => {
    expect(() => discover([candidate('a')], 0)).toThrow(/maxTargets/);
  });
});

describe('stableTargets', () => {
  it('keeps only selectors found in both passes, in the order and with the data of the first pass', () => {
    const a = discover([candidate('x'), candidate('flaky'), candidate('y', { label: 'first pass' })]).targets;
    const b = discover([candidate('y', { label: 'second pass' }), candidate('x'), candidate('late')]).targets;
    const stable = stableTargets(a, b);
    expect(stable.map((t) => t.target.selector)).toStrictEqual(['x', 'y']);
    expect(stable[1]?.target.label).toBe('first pass');
  });

  it('ids are deterministic per selector', () => {
    expect(targetId('button#show-details')).toBe(targetId('button#show-details'));
    expect(targetId('button#show-details')).not.toBe(targetId('button#other'));
  });
});

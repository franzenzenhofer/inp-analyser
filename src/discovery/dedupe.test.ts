import { describe, expect, it } from 'vitest';
import type { SafetyClass } from '../model/scenario.js';
import { dedupe, handlerSignature } from './dedupe.js';
import type { Listener } from './types.js';

const L = (url: string, line: number, column = 5, type = 'click'): Listener => ({ type, url, line, column });

describe('handlerSignature', () => {
  it('is order independent and ignores duplicate locations (click + keydown on one handler)', () => {
    const a = handlerSignature('button.card-btn', [L('app.js', 10), L('app.js', 20), L('app.js', 10, 5, 'keydown')]);
    const b = handlerSignature('button.card-btn', [L('app.js', 20), L('app.js', 10)]);
    expect(a).toBe(b);
    expect(a).toBe('button.card-btn|app.js:10:5,app.js:20:5');
  });

  it('separates handlers on the same minified line by column', () => {
    expect(handlerSignature('div', [L('bundle.min.js', 1, 100)])).not.toBe(handlerSignature('div', [L('bundle.min.js', 1, 900)]));
  });

  it('separates different DOM signatures with the same handler', () => {
    expect(handlerSignature('button.a', [L('app.js', 1)])).not.toBe(handlerSignature('a.a', [L('app.js', 1)]));
  });
});

function item(name: string, signature: string, aboveFold: boolean, safety: SafetyClass = 'safe') {
  return { name, handlerSignature: signature, aboveFold, safety };
}

describe('dedupe', () => {
  it('collapses one signature into one item, keeping the first above-the-fold one and counting the merged', () => {
    const out = dedupe([item('below-1', 's', false), item('above-1', 's', true), item('above-2', 's', true), item('other', 't', false)]);
    expect(out.map((m) => [m.item.name, m.mergedCount])).toStrictEqual([['above-1', 3], ['other', 1]]);
  });

  it('keeps the first item when none is above the fold', () => {
    expect(dedupe([item('b1', 's', false), item('b2', 's', false)])[0]?.item.name).toBe('b1');
  });

  it('never merges items of different safety classes', () => {
    expect(dedupe([item('hash', 'a|', true, 'safe'), item('doc', 'a|', true, 'cross-document-navigation')])).toHaveLength(2);
  });
});

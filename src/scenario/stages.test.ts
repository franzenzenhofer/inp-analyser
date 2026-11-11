import { describe, expect, it } from 'vitest';
import type { Condition, Target } from '../model/scenario.js';
import { seededRandom } from './random.js';
import { blockOrder, screeningScenarios, selectDeepDive } from './stages.js';

const condition: Condition = { device: 'mobile', cpuRate: 4, thirdParty: { kind: 'allow' }, consent: 'none', cache: 'cold' };
const target = (id: string, aboveFold: boolean): Target => ({ id, selector: `#${id}`, label: id, kind: 'button', rect: { x: 0, y: 0, width: 10, height: 10 }, aboveFold, handlerSignature: id, safety: 'safe', safetyReason: '' });

describe('stages', () => {
  it('boot scenarios only for above-the-fold targets visible at that offset, with that offset\'s tap point', () => {
    const bootGeometry = new Map([[800, new Map([['a', { x: 5, y: 9 }]])], [2400, new Map([['a', { x: 5, y: 40 }], ['b', { x: 1, y: 1 }]])]]);
    const scenarios = screeningScenarios({ targets: [target('a', true), target('b', false)], phases: ['boot', 'idle'], condition, bootGeometry });
    expect(scenarios.map((s) => s.id)).toEqual(['boot@800:a', 'boot@2400:a', 'idle:a', 'idle:b']);
    expect(scenarios[1]?.tapPoint).toEqual({ x: 5, y: 40 });
  });
  it('each block contains every scenario exactly once, reproducible by seed', () => {
    const scenarios = screeningScenarios({ targets: [target('a', true), target('b', true)], phases: ['idle'], condition, bootGeometry: new Map() });
    const order = blockOrder(scenarios, 3, seededRandom(9));
    expect(order).toHaveLength(6);
    for (const block of [0, 1, 2]) expect(order.filter((r) => r.block === block).map((r) => r.scenario.id).toSorted()).toEqual(['idle:a', 'idle:b']);
    expect(blockOrder(scenarios, 3, seededRandom(9))).toEqual(order);
  });
  it('deep-dives scenarios whose slowest screening run exceeded 200 ms, slowest median first', () => {
    const base = { runs: 3, measured: 3, values: [], outcomes: {} };
    const picked = selectDeepDive([
      { ...base, scenarioId: 'fast', median: 80, max: 120 },
      { ...base, scenarioId: 'edge', median: 150, max: 230 },
      { ...base, scenarioId: 'slow', median: 600, max: 700 },
    ]);
    expect(picked).toEqual(['slow', 'edge']);
  });
});

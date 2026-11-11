import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * In-page functions are serialised with Function.prototype.toString. Under tsx (esbuild keepNames) a named
 * inner function gets a __name() wrapper that does not exist in the page -> ReferenceError at runtime.
 * This loads the modules through tsx itself, exactly like `npm run inp` does.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const MODULES: ReadonlyArray<[string, readonly string[]]> = [
  ['src/collect/in-page-observers.ts', ['installInPageObservers', 'installMutationCounter']],
  ['src/collect/in-page-page-facts.ts', ['collectPageFacts']],
  ['src/machine/in-page-benchmark.ts', ['computeBenchmarkIndex']],
  ['src/scenario/boot-geometry.ts', ['pointsNow']],
  ['src/consent/consent-state.ts', ['seedLocalStorage']],
];

describe('in-page functions survive tsx serialisation', () => {
  it.each(MODULES)('%s has no __name helper inside its functions', (module, names) => {
    const script = `const m = await import(${JSON.stringify(join(ROOT, module))}); console.log(JSON.stringify(${JSON.stringify(names)}.map((n) => m[n].toString().includes('__name'))));`;
    const out = execFileSync(join(ROOT, 'node_modules', '.bin', 'tsx'), ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' });
    expect(JSON.parse(out.trim().split('\n').at(-1) ?? '[]')).toEqual(names.map(() => false));
  });
});

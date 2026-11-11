import type { ScriptCost } from '../model/measurement.js';
import type { Evidence } from '../model/issue.js';

export function ms(value: number): string {
  return `${Math.round(value)} ms`;
}

export function scriptLabel(s: ScriptCost): string {
  const invoker = s.invoker === '' ? '' : ` via ${s.invoker}`;
  return `${s.functionName} (${s.url}:${s.line}:${s.column})${invoker}`;
}

export function scriptEvidence(scripts: readonly ScriptCost[], limit: number): Evidence[] {
  return scripts.slice(0, limit).map((s) => ({ label: `${s.entity}${s.isFirstParty ? ' (1st party)' : ' (3rd party)'}`, value: scriptLabel(s), ms: s.selfMs, url: s.url }));
}

export function sumMs<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

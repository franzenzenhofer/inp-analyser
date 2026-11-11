import type { ObservedFrame, ObservedScript } from '../collect/in-page-store.js';
import type { InvokerType, ScriptCost } from '../model/measurement.js';

const INVOKER_TYPES: readonly InvokerType[] = ['classic-script', 'module-script', 'event-listener', 'user-callback', 'resolve-promise', 'reject-promise'];

function toInvokerType(value: string): InvokerType {
  return INVOKER_TYPES.find((t) => t === value) ?? 'unknown';
}

function sameScript(cost: ScriptCost, script: ObservedScript): boolean {
  return script.sourceURL === cost.url && (script.sourceFunctionName === cost.functionName || script.sourceFunctionName === '');
}

/**
 * Adds LoAF script attribution (invoker, invokerType) to the trace's script costs. LoAF names only the
 * entry point and only scripts > 5 ms (https://w3c.github.io/long-animation-frames/#long-script-monitoring),
 * so costs without a LoAF match keep invokerType 'unknown'.
 */
export function joinLoaf(costs: readonly ScriptCost[], frames: readonly ObservedFrame[]): ScriptCost[] {
  const scripts = frames.flatMap((f) => f.scripts);
  return costs.map((cost) => {
    const match = scripts.find((s) => sameScript(cost, s));
    return match === undefined ? cost : { ...cost, invoker: match.invoker, invokerType: toInvokerType(match.invokerType) };
  });
}

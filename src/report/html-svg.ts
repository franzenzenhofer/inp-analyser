/** Small SVG helpers shared by the report charts (inline SVG, no library, no script). */
export type Scale = (value: number) => number;

export interface Range {
  readonly from: number;
  readonly to: number;
}

export function linearScale(domain: Range, range: Range): Scale {
  const span = domain.to - domain.from;
  if (span <= 0) throw new Error(`[svg] empty domain ${domain.from}..${domain.to}`);
  return (value) => range.from + ((value - domain.from) / span) * (range.to - range.from);
}

/** 1, 2 or 5 times a power of ten, so that span / step is close to `ticks`. */
export function niceStep(span: number, ticks: number): number {
  if (span <= 0 || ticks <= 0) throw new Error(`[svg] niceStep needs a positive span and tick count, got ${span}, ${ticks}`);
  const raw = span / ticks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 5, 10].find((f) => f * power >= raw) ?? 10;
  return factor * power;
}

export function ticksBetween(from: number, to: number, step: number): number[] {
  const first = Math.ceil(from / step) * step;
  const count = Math.floor((to - first) / step) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => first + i * step);
}

export function thousands(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** Rounds coordinates so the SVG source stays readable and deterministic. */
export function px(value: number): number {
  return Math.round(value * 10) / 10;
}

import { InvalidArgumentError } from 'commander';
import type { Phase } from './model/scenario.js';

export function positiveNumber(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new InvalidArgumentError(`expected a positive number, got "${value}"`);
  return n;
}

export function nonNegativeNumber(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new InvalidArgumentError(`expected a number >= 0, got "${value}"`);
  return n;
}

const PHASES: readonly Phase[] = ['boot', 'consent', 'idle'];

export function phaseList(value: string): Phase[] {
  const list = value.split(',').map((p) => p.trim());
  const phases = PHASES.filter((p) => list.includes(p));
  if (phases.length !== list.length) throw new InvalidArgumentError(`phases must be a comma list of ${PHASES.join(', ')}, got "${value}"`);
  return phases;
}

export function device(value: string): 'mobile' | 'desktop' {
  if (value !== 'mobile' && value !== 'desktop') throw new InvalidArgumentError(`device must be mobile or desktop, got "${value}"`);
  return value;
}

export function defaultOutDir(url: string, now: Date): string {
  const host = URL.canParse(url) ? new URL(url).hostname : 'site';
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `inp-report-${host}-${stamp}`;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

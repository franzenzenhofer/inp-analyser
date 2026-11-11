import { describe, expect, it } from 'vitest';
import { fullSample, labOnlySample } from '../../tests/support/report-samples.js';
import { renderTerminal, terminalColors } from './render-terminal.js';

const ESC = String.fromCodePoint(27);
const plain = terminalColors(false);

describe('renderTerminal', () => {
  const full = renderTerminal(fullSample(), '/runs/x/report.html', plain);
  const lines = full.split('\n');

  it('starts with the field INP: CrUX PHONE p75, level, period, densities, PSI parity', () => {
    expect(lines[1]).toBe('Field INP PHONE: 130 ms (good)');
    expect(lines[2]).toBe('  CrUX p75, PHONE, page (URL) level, 2026-10-12 to 2026-11-08');
    expect(lines[3]).toBe('  real users: good 86.5% | needs improvement 9.7% | poor 3.9%');
    expect(lines[4]).toBe('  PSI shows the same: 130 ms');
    expect(full).toContain('Reconciliation: Field INP p75 (CrUX PHONE, url level, 2026-10-12..2026-11-08) = 130 ms. 1 lab scenario(s) reach it');
  });

  it('lists the ranked issues with lab-labelled numbers, top evidence and spec URL, then the HTML path', () => {
    expect(full).toContain('1. [needs improvement | confirmed | input delay] Input waited for a first-party long task');
    expect(full).toContain('   button#menu-toggle - lab @ CPU 4x, mobile: median 349 ms (95% CI 346-360 ms); fired in 6 of 6 runs (95% CI 61-100%)');
    expect(full).toContain('   evidence: long task 401 ms (inp.test): http://site.inp.test:56655/busy.js');
    expect(full).toContain('   why this counts: https://web.dev/articles/optimize-input-delay');
    expect(full).toContain('Run: 22 runs (0 excluded), 26 page loads, seed 42, Chrome/155.0.8059.39, lab @ CPU 4x, mobile');
    expect(lines.at(-1)).toBe('HTML report: /runs/x/report.html');
    expect(full.indexOf('Field INP')).toBeLessThan(full.indexOf('Issues (1, ranked):'));
  });

  it('says plainly when there is no field data', () => {
    const text = renderTerminal(labOnlySample(), 'r.html', plain);
    expect(text).toContain('Field INP PHONE: none');
    expect(text).toContain('No field data: CrUX and PSI were not fetched for this run');
    expect(text).not.toContain('Reconciliation:');
  });

  it('prints no colour codes off a TTY, and colours on one', () => {
    expect(full).not.toContain(ESC);
    expect(renderTerminal(fullSample(), 'r.html', terminalColors(true))).toContain(`${ESC}[1m`);
  });
});

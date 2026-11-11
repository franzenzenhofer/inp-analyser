#!/usr/bin/env node
import { Command } from 'commander';
import { analyseCommand } from './commands/analyse-command.js';
import { calibrateCommand } from './commands/calibrate-command.js';
import { compareCommand } from './commands/compare-command.js';
import { discoverCommand } from './commands/discover-command.js';
import { fieldCommand } from './commands/field-command.js';
import { reportCommand } from './commands/report-command.js';
import { traceCommand } from './commands/trace-command.js';
import { defaultOutDir, device, nonNegativeNumber, phaseList, positiveNumber, randomSeed } from './cli-options.js';
import { TOOL } from './tool.js';

const program = new Command();
program.name('inp').description('Finds the issues behind Interaction to Next Paint, measured over multiple runs.').version(TOOL.version);

program
  .command('analyse')
  .description('preflight, discovery, screening, deep-dive and diagnosis for one URL; writes runs.jsonl, meta.json, report.json')
  .argument('<url>', 'page to analyse')
  .option('--device <device>', 'mobile (touch) or desktop (mouse)', device, 'mobile')
  .option('--cpu <rate>', 'CPU throttling rate (Lighthouse default 4)', positiveNumber, 4)
  .option('--budget <minutes>', 'time budget for all stages', positiveNumber, 120)
  .option('--quick', 'stop after screening (no deep-dive)', false)
  .option('--max-targets <n>', 'interaction targets to measure', positiveNumber, 12)
  .option('--phases <list>', 'boot,idle (consent: planned)', phaseList, ['boot', 'idle'])
  .option('--seed <n>', 'seed for the randomised run order (printed in the report)', nonNegativeNumber)
  .option('--out <dir>', 'output directory')
  .option('--entity-map <file>', 'extra script owners: {"entities":[{"name","category","domains"}]}')
  .option('--allow-mutations <regex>', 'first-party non-GET URLs allowed to pass the guard')
  .option('--min-load-interval <seconds>', 'politeness: minimum seconds between loads of the same origin', nonNegativeNumber, 10)
  .option('--no-field', 'skip CrUX/PSI field data')
  .option('--host-resolver-rules <rules>', 'Chrome host resolver rules (local test site only)')
  .option('--consent-state <file>', 'seed an accepted-consent state (cookies + localStorage, see scripts/capture-consent-state.ts) into every load')
  .option('--max-load <n>', 'busy-machine limit for the start gate (1-minute load, default: half the cores)', positiveNumber)
  .option('--proxy-server <url>', 'Chrome proxy for page traffic, e.g. socks5://127.0.0.1:1080 (load from a whitelisted IP)')
  .action(async (url: string, o: { device: 'mobile' | 'desktop'; cpu: number; budget: number; quick: boolean; maxTargets: number; phases: ReturnType<typeof phaseList>; seed?: number; out?: string; entityMap?: string; allowMutations?: string; minLoadInterval: number; field: boolean; hostResolverRules?: string; proxyServer?: string; consentState?: string; maxLoad?: number }) => {
    const seed = o.seed ?? randomSeed();
    const out = o.out ?? defaultOutDir(url, new Date());
    console.log(`[inp] analyse ${url} -> ${out} (seed ${seed})`);
    const report = await analyseCommand(url, {
      device: o.device, cpu: o.cpu, budgetMinutes: o.budget, quick: o.quick, maxTargets: o.maxTargets, seed, out, minLoadIntervalSeconds: o.minLoadInterval, field: o.field, phases: o.phases,
      ...(o.entityMap === undefined ? {} : { entityMap: o.entityMap }), ...(o.allowMutations === undefined ? {} : { allowMutations: o.allowMutations }),
      ...(o.hostResolverRules === undefined ? {} : { hostResolverRules: o.hostResolverRules }),
      ...(o.proxyServer === undefined ? {} : { proxyServer: o.proxyServer }),
      ...(o.consentState === undefined ? {} : { consentState: o.consentState }),
      ...(o.maxLoad === undefined ? {} : { maxLoad: o.maxLoad }),
    });
    console.log(`[inp] report: ${report}`);
  });

program
  .command('report')
  .description('rebuild report.json and the rendered reports from a run directory (runs.jsonl + meta.json)')
  .argument('<dir>', 'output directory of a previous analyse')
  .action(async (dir: string) => {
    console.log(`[inp] report: ${await reportCommand(dir)}`);
  });

program
  .command('field')
  .description('CrUX + PSI field INP (the numbers PSI and Search Console show) for phone and desktop; no page loads')
  .argument('<url>', 'page')
  .option('--out <dir>', 'output directory for field.json')
  .action(async (url: string, o: { out?: string }) => {
    console.log(`[inp] field: ${await fieldCommand(url, o.out ?? defaultOutDir(url, new Date()))}`);
  });

program
  .command('trace')
  .description('issues in an existing DevTools trace (.json or .json.gz); one recording = one sample, no statistics')
  .argument('<file>', 'trace file')
  .option('--entity-map <file>', 'extra script owners')
  .action(async (file: string, o: { entityMap?: string }) => {
    for (const f of await traceCommand(file, o.entityMap)) {
      const p = f.phases;
      console.log(`[trace] ${f.eventTypes.join('/')} @${Math.round(f.startTimeMs)} ms: ${Math.round(f.durationMs)} ms (input ${Math.round(p.inputDelay)} / processing ${Math.round(p.processing)} / presentation ${Math.round(p.presentationDelay)})${f.measurementArtifacts.length > 0 ? ` ARTIFACT: ${f.measurementArtifacts.join(', ')}` : ''}`);
      for (const i of f.issues) console.log(`  - ${i.ruleId}: ${i.title}${i.evidence.length > 0 ? ` | ${i.evidence.join(' | ')}` : ''}`);
    }
  });

program
  .command('compare')
  .description('before/after: Hodges-Lehmann shift + CI, Mann-Whitney (Holm), Cliff\'s delta per shared scenario')
  .argument('<before>', 'run directory')
  .argument('<after>', 'run directory')
  .action(async (before: string, after: string) => {
    await compareCommand(before, after);
  });

program
  .command('discover')
  .description('list the interaction targets the analyser would measure (two passes, stable targets only)')
  .argument('<url>', 'page')
  .option('--device <device>', 'mobile or desktop', device, 'mobile')
  .option('--max-targets <n>', 'targets to keep', positiveNumber, 12)
  .action(async (url: string, o: { device: 'mobile' | 'desktop'; maxTargets: number }) => {
    await discoverCommand(url, o);
  });

program
  .command('calibrate')
  .description('measure Lighthouse BenchmarkIndex under each CPU throttling rate and name the device class it reaches')
  .action(async () => {
    await calibrateCommand();
  });

await program.parseAsync();

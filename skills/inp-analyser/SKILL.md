---
name: inp-analyser
description: Use when someone wants to analyse the Interaction to Next Paint (INP) of a URL, find out WHY a page has poor INP, investigate slow interactions or slow clicks/taps, check the Core Web Vitals INP field value the way PageSpeed Insights (PSI) or Search Console shows it, compare INP before/after a release or deploy, analyse an existing Chrome DevTools performance trace for slow interactions, or says "INP analysis", "INP issues", "why is INP poor", "run the INP analyser", "inp analyse".
---

# INP Analyser

`inp` is a CLI that finds the **issues** behind Interaction to Next Paint. For each issue it reports:

- the element (CSS selector) that was clicked or tapped
- the INP phase: input delay, processing, or presentation delay
- whose code: script URL:line:function and the third-party entity that owns it
- how many milliseconds (median with a 95% confidence interval)
- how certain the finding is, based on multiple runs

**The headline INP is always the field number**: the CrUX p75 that PSI and Search Console show, checked against PSI.
Lab values are evidence only, and they are labelled `lab @ CPU Nx`. The tool reports issues. It never prints fixes.

Repo: https://github.com/franzenzenhofer/inp-analyser (MIT).

## One-time setup

Requirements: Node.js >= 26, git. `analyse` checks the power state (macOS `pmset`, Linux `/sys/class/power_supply`) before it measures.

```bash
git clone https://github.com/franzenzenhofer/inp-analyser ~/inp-analyser
cd ~/inp-analyser
npm ci
npm run chrome:install        # pinned Chrome for Testing, used headless
npm run build && npm link     # optional: puts `inp` on PATH
```

Field data (`inp field`, and the field part of `inp analyse`) needs a Google Cloud API key with the
Chrome UX Report API and the PageSpeed Insights API enabled (see `.env.example`). The user exports it in
their own shell:

```bash
export INP_GOOGLE_API_KEY=...   # the user runs this, not the agent
```

- Never ask the user to paste a key into the chat. Never write a key to a file, a log or a commit.
- Without a key, run lab-only: `inp analyse <url> --no-field`.

## Where the tool lives

Use `inp` if it is on PATH. Otherwise run it from the clone:

```bash
INP_DIR="${INP_ANALYSER_DIR:-$HOME/inp-analyser}"
cd "$INP_DIR" && npx tsx src/cli.ts <command> ...
```

`npx tsx src/cli.ts <command> --help` lists every option. Examples below write `inp`. Read it as either form.

## Commands

| Command | What it does | Duration |
|---|---|---|
| `inp field <url> [--out <dir>]` | CrUX + PSI field INP p75 for phone and desktop, history, collection period. No page loads. Writes `field.json`. | 2-4 min (PSI is slow) |
| `inp discover <url> [--device mobile\|desktop] [--max-targets 12]` | Lists the interaction targets it would measure (two passes, only stable targets), their safety class, listeners, and global third-party listeners | a few minutes |
| `inp analyse <url> [--out <dir>]` | Full run: preflight, discovery, screening, deep-dive, third-party causal blocks, diagnosis. Default budget 120 min. | ~1.5-2 h |
| `inp analyse <url> --quick [--out <dir>]` | Stops after screening (no deep-dive). Findings stay `screening-only`. | 20-40 min |
| `inp report <dir>` | Rebuilds `report.json` + `report.html` from `runs.jsonl` + `meta.json` | seconds |
| `inp trace <file.json[.gz]> [--entity-map <file>]` | Issues in an existing DevTools trace. One recording = one sample, no statistics. | seconds |
| `inp compare <before-dir> <after-dir>` | Before/after per shared scenario: Hodges-Lehmann shift + CI, Mann-Whitney with Holm correction, Cliff's delta | seconds |
| `inp calibrate` | Measures Lighthouse BenchmarkIndex for each CPU throttling rate and names the device class each rate reaches on this machine | a few minutes |

Useful `analyse` options:

| Option | Default | Meaning |
|---|---|---|
| `--device mobile\|desktop` | `mobile` | touch or mouse emulation |
| `--cpu <rate>` | `4` | CPU throttling. Run `inp calibrate` to see which device class this reaches on your machine. |
| `--budget <minutes>` | `120` | time budget for all stages |
| `--max-targets <n>` | `12` | interaction targets to measure |
| `--phases boot,idle` | `boot,idle` | when to interact: while the page boots, or once it is idle |
| `--seed <n>` | random | seed for the randomised run order. It is printed in the report, so a run can be reproduced. |
| `--out <dir>` | `inp-report-<host>-<stamp>` | output directory |
| `--entity-map <file>` | - | extra script owners, `{"entities":[{"name","category","domains"}]}` |
| `--allow-mutations <regex>` | - | first-party non-GET URLs that may pass the safety guard (no `g`/`y` flag) |
| `--min-load-interval <s>` | `10` | politeness: minimum seconds between loads of the same origin |
| `--no-field` | - | skip CrUX/PSI (lab only) |
| `--consent-state <file>` | - | seed an accepted-consent state (cookies + localStorage) into every load. Capture it with `scripts/capture-consent-state.ts`. |
| `--max-load <n>` | half the cores | busy-machine limit (1-minute load average) for the start gate |
| `--proxy-server <url>` | - | Chrome proxy for page traffic |

## Running long jobs

`analyse` takes minutes to hours. Run it in the background with a log. Never block on it and never wait blind:

```bash
inp analyse https://en.wikipedia.org/wiki/Web_performance --out ./inp-wiki > ./inp-wiki.log 2>&1 &
echo $! > ./inp-wiki.pid
```

Check progress in short polls that each have a timeout. For example, look at the last lines of the log
(`tail -n 20 ./inp-wiki.log`) every few minutes, and check that the log is still growing and the process is
still alive (`kill -0 $(cat ./inp-wiki.pid)`). If the log stops growing for more than 10 minutes, report that
instead of waiting longer. The run is done when the log prints `[inp] report: <path>`.

## Outputs (in `--out`)

| File | Content |
|---|---|
| `report.json` | the machine-readable result. Read this. |
| `report.html` | self-contained human report |
| `runs.jsonl` | single source of truth, one line per measured page load. Every report is rebuilt from it. |
| `meta.json` | run metadata (condition, seed, Chrome version) |
| `field.json` | CrUX + PSI field data |
| `traces/*.json.gz` | DevTools traces, open them in the Chrome DevTools Performance panel |

## Reading report.json

- `field`: CrUX/PSI per device (`phone`, `desktop`) with p75, level (url or origin), collection periods, history, and `sourceNotes` (where each number comes from, plus no-data or fallback cases).
- `reconciliation`: `verdict` (`reproduced` / `not-reproduced` / `no-field-data`), `text` (one paragraph to quote), `scenarios[]` with lab median, bucket and `reachesFieldP75`.
- `issues[]`, one entry per diagnosed problem:
  - `ruleId`, for example `processing/slow-event-handlers`, `input-delay/long-task`, `presentation/large-style-recalc`, `third-party/causal-delta`
  - `title`, `phase` (`input-delay` / `processing` / `presentation` / `context`)
  - `severity` (`poor` / `needs-improvement` / `info`), `certainty` (`confirmed` / `intermittent` / `screening-only`)
  - `targetSelector`, `scenarioIds`
  - `medianMs` + `medianCi` (`low`/`high`). `quantity` says whether this is a `median` or a Hodges-Lehmann `shift` between two arms.
  - `reproducibility`: `fired` / `runs`, with a Wilson interval
  - `evidence[]`: label, value, ms, url (script URL:line:function, entity)
  - `specUrl`: the spec or engine source that defines why this counts
- `comparisons[]`: phase comparisons (boot vs idle) and third-party block comparisons, with sample sizes, medians, shift + CI, `p`, `pHolm`, `cliffsDelta`, `significant`, and `confounded` when present.
- `scenarios[]`, `targets` (measured, excluded with reason, global listeners), `run` (runs, excluded runs, loads made), `limitations[]` (what this lab run cannot see).

## Interpreting

- `certainty: confirmed` means the issue was deep-dived with >= 5 attribution runs and the rule fired in >= 60% of them.
  `intermittent` means it was deep-dived but fired in fewer runs. `screening-only` means there was no deep-dive or there were fewer than 5 runs. Treat it as a lead, not a finding.
- `context/measurement-artifact`: the tool's own profiler start-up overlapped the interaction. This is not a page problem. Do not report it as one.
- `third-party/causal-delta`: blocking that third party made the interaction measurably faster (paired blocks, Holm-corrected).
  `third-party/confounded`: blocking it broke first-party code, so the speed-up cannot be credited to the third party.
- `reconciliation.verdict: not-reproduced`: no lab scenario reached the field p75. Say so plainly, and list what the lab cannot see (real devices, logged-in states, iframes, untested interactions) from `limitations[]`.
- `no-field-data`: CrUX has no INP for that URL or origin. The lab results stand alone and are **not** an INP value.

## Rules for the agent

- **Only analyse sites the user owns or is allowed to load-test.** A full `analyse` makes many page loads.
- **One measurement per machine at a time.** No parallel analyses, and no heavy builds or tests while one runs. The tool gates every block on BenchmarkIndex drift and a sentinel page, and drops noisy blocks.
- **AC power and a quiet machine.** The tool refuses to run on battery, in Low Power Mode, under thermal limits, or on a busy machine.
- **Be polite.** Keep the default of at most 1 page load per 10 s per origin. The report states how many loads were made.
- **THE INP is the field p75.** Always quote it with level (url/origin), device and collection period, for example "field INP p75 (CrUX phone, origin level, 2026-10-12..2026-11-08) = 240 ms". Never present a lab number as "the INP". Lab numbers are always quoted as `lab @ CPU Nx`.
- **The tool reports issues, not fixes.** You may suggest fixes separately. Label them clearly as your suggestions, not tool output, and link the relevant guidance, for example https://web.dev/articles/optimize-inp, https://web.dev/articles/optimize-input-delay, https://web.dev/articles/optimize-long-tasks.
- Do not open files or browser windows for the user. Point them to `report.html` by path, or summarise from `report.json`.

## Example

```bash
inp field https://en.wikipedia.org/wiki/Main_Page --out ./wiki-field
inp analyse https://example.com/ --quick --no-field --out ./example-quick > ./example-quick.log 2>&1 &
```

## Install this skill

Copy the folder `skills/inp-analyser` from the repo into `~/.claude/skills/` (for all projects) or into a
project's `.claude/skills/`:

```bash
cp -R ~/inp-analyser/skills/inp-analyser ~/.claude/skills/
```

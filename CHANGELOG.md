# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-11

First public release.

- `inp analyse`: preflight, target discovery, screening, deep-dive and diagnosis for one URL, in headless Chrome for Testing, for mobile (touch) or desktop (mouse), with CPU throttling.
- Issues per interaction: element, INP phase (input delay / processing / presentation), script URL:line:function, third-party entity (third-party-web plus a custom `--entity-map`), median ms with 95% CI, reproducibility, and certainty (confirmed / intermittent / screening-only).
- Issue rules for long tasks, third-party tasks, missing mobile viewport, slow event handlers, forced reflow, layout thrashing, large style recalculation and layout, large DOM changes, non-composited animations, script before paint, rendering-dominant frames, DOM size, page exceptions and measurement artifacts. Each rule links its spec.
- Boot vs idle phase comparison, and third-party causal blocks (paired, Holm-corrected) with confounding detection.
- `inp field`: CrUX + PSI field INP p75 for phone and desktop, with history, collection period and a PSI parity check. Field INP is the headline, and lab values are labelled `lab @ CPU Nx`.
- Reconciliation of lab scenarios against the field p75 (reproduced / not reproduced / no field data), with listed lab limitations.
- `inp compare`: before/after per scenario with Hodges-Lehmann shift + CI, Mann-Whitney (Holm) and Cliff's delta.
- `inp trace`: issues in an existing DevTools trace.
- `inp discover`, `inp report` (rebuild from `runs.jsonl`) and `inp calibrate` (BenchmarkIndex per CPU rate).
- Measurement hygiene: power, thermal and busy-machine gates, BenchmarkIndex drift and sentinel checks, randomised seeded run order.
- Safety: guard against first-party mutations and navigations, popup and download blocking, a denylist for dangerous targets, bot-wall detection, and politeness (1 load per 10 s per origin).
- Outputs: `report.json`, self-contained `report.html`, `runs.jsonl`, `meta.json`, `field.json` and gzipped DevTools traces.
- Agent skill in `skills/inp-analyser/` for Claude Code and other agents.
- Local test site with one page per known INP problem, used by the e2e tests.

# Examples: real runs on Wikipedia

Two unedited runs of `inp analyse`, made on 11 Nov 2026 on an Apple Silicon MacBook (mobile emulation, CPU 4x,
Chrome for Testing 155.0.8059.39, seed 42). Field data is the CrUX collection period 2026-10-12 to 2026-11-08.

| Folder | Command | Field INP p75 (phone, URL level) | Lab result |
|---|---|---|---|
| [`wikipedia-main-page/`](wikipedia-main-page/) | `inp analyse https://en.wikipedia.org/wiki/Main_Page --budget 35 --max-targets 6 --seed 42` | **130 ms** good (86.5% / 9.7% / 3.9%), PSI identical | no lab scenario reached the field p75; no issues; no deep-dive needed |
| [`wikipedia-united-states/`](wikipedia-united-states/) | `inp analyse https://en.wikipedia.org/wiki/United_States --quick --budget 25 --max-targets 6 --seed 42` | **103 ms** good (91.3% / 6.7% / 2.1%), PSI identical | 7 lab scenarios reach the field p75, all taps during page boot (up to 309 ms lab median for the header menu link at 5.8 s); screening only |

Each folder holds `terminal.txt` (what the CLI printed), `report.html` (open it in a browser), `report.json`,
`runs.jsonl` (one line per measured page load), `meta.json` and `field.json`.

Read them honestly:

- Wikipedia is fast in the field. Both pages are **good** for real users; that is the headline, and the tool says so.
- The machine was busy with other work during these runs: the BenchmarkIndex gate **excluded** 18 of 27 and 28 of 42
  runs, so most lab medians rest on one valid run. That is the gate doing its job - the excluded runs are kept in
  `runs.jsonl` with the reason, but never counted.
- The United States run is `--quick` (screening only). Issues with element, phase and `URL:line:function` come from the
  deep-dive attribution runs; run without `--quick` on a quiet machine to get them.
- Traces (`traces/*.json.gz`) are left out to keep the repo small; the tool writes them next to every report.
- In the logged beacon URLs, Wikipedia's geolocation query values were replaced with `country=XX` and `region=0`.

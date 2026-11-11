# Examples: real runs

Unedited runs of `inp analyse`, made on 11 Nov 2026 on an Apple Silicon MacBook (mobile emulation, CPU 4x,
Chrome for Testing 155.0.8059.39, seed 42). Field data is the CrUX collection period 2026-10-12 to 2026-11-08.

| Folder | Command | Field INP p75 (phone, URL level) | Lab result |
|---|---|---|---|
| [`test-site-third-party/`](test-site-third-party/) | `inp analyse http://site.inp.test:<port>/ab-known-delta --no-field --entity-map test-site/entity-map.json --budget 25 --max-targets 6 --seed 42 --host-resolver-rules "MAP site.inp.test 127.0.0.1, MAP cdn.thirdparty.test 127.0.0.1"` (bundled test site, `npm run test-site`) | none (local page) | 4 confirmed issues: `knownDeltaListener (known-delta.js:4:65)` of "Test Tracker Inc." runs 198 ms inside every click on `button#apply-sort`; median 222 ms (95% CI 221-223), 8 of 8 runs; blocking it is 134 ms faster (95% CI 97-179, 28 paired runs) |
| [`wikipedia-united-states/`](wikipedia-united-states/) | `inp analyse https://en.wikipedia.org/wiki/United_States --budget 50 --max-targets 6 --seed 42` | **103 ms** good (91.3% / 6.7% / 2.1%), PSI identical | 8 issues, 1 confirmed: `div#mwBA > a:nth-of-type(2)` is 199 ms slower when tapped during boot (95% CI 116-265 ms, 9 of 9 runs); 147 runs, 0 excluded; budget ended before the last deep-dive block (`INCOMPLETE`) |
| [`wikipedia-main-page/`](wikipedia-main-page/) | `inp analyse https://en.wikipedia.org/wiki/Main_Page --budget 35 --max-targets 6 --seed 42` | **130 ms** good (86.5% / 9.7% / 3.9%), PSI identical | no lab scenario reached the field p75, no issues; the machine was busy (18 of 27 runs excluded by the BenchmarkIndex gate) |
| [`cnn-southern-taurids/`](cnn-southern-taurids/) | `inp analyse https://edition.cnn.com/2026/11/04/science/southern-taurids-meteor-shower --budget 50 --max-targets 6 --seed 42 --max-load 6` | **115 ms** good (88.1% / 6.9% / 5.0%), PSI identical; CrUX 2026-10-13 to 2026-11-09 | 3 issues, all `screening only` context (DOM size 2178, page exceptions, non-composited animation of the consent banner); no scenario over 200 ms, so no deep-dive; 18 runs, 0 excluded |
| [`techcrunch-basic-kindle/`](techcrunch-basic-kindle/) | `inp field https://techcrunch.com/2026/11/07/amazons-new-basic-kindle-proves-you-dont-need-all-the-bells-and-whistles/` | **229 ms** needs improvement (69.8% / 22.7% / 7.5%), PSI identical; CrUX 2026-10-13 to 2026-11-09 | lab pending: one preflight load timed out (60 s), the latest run stopped at a Cloudflare challenge (`[safety] bot wall`); field data only |

Machines: the test site and the two Wikipedia runs ran on an Apple Silicon MacBook. The CNN run and the TechCrunch field data
come from a second, always-on Apple Silicon MacBook Air (8 cores) that was busy with other jobs; its start gate was raised to
`--max-load 6` (default: half the cores, 4). Every measured block still has to pass the BenchmarkIndex health gate, and the CNN run
excluded 0 of 18 runs. `techcrunch-basic-kindle/` holds `field.json` and the `inp field` output only.

Each folder holds `terminal.txt` (what the CLI printed), `report.html` (open it in a browser), `report.json`,
`runs.jsonl` (one line per measured page load) and `meta.json`; the Wikipedia folders also hold `field.json`.

Read them honestly:

- Wikipedia is fast in the field. Both pages are **good** for real users; that is the headline, and the tool says so.
- The test-site third party really adds 200 ms per click (`test-site/third-party/known-delta.js`); the trace attributes 198 ms
  to it. That is the ground truth the tool is tested against.
- Excluded runs (busy machine) stay in `runs.jsonl` with the reason, but are never counted.
- Traces (`traces/*.json.gz`) are left out to keep the repo small; the tool writes them next to every report.
- Privacy: Wikipedia's geolocation query values in logged beacon URLs were replaced with `country=XX` / `region=0`, and the
  local checkout path inside Puppeteer's injected-script URLs was shortened to the project folder.

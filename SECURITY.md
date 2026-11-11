# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories:
https://github.com/franzenzenhofer/inp-analyser/security/advisories/new

Do not open a public issue for a security problem. Include the version (`inp --version`), the command you ran,
and the steps to reproduce. You will get an answer as soon as possible.

## Supported versions

Only the latest release gets security fixes.

## How the tool handles secrets and target sites

- **API keys:** the optional `INP_GOOGLE_API_KEY` is read from the environment only. The tool never writes it to
  disk, to reports, to logs or to `runs.jsonl`. Never commit a real key (`.env` is git-ignored).
- **Safety guard:** once a page has loaded, the request guard (`src/safety/`):
  - fails every first-party request that is not GET, HEAD or OPTIONS, unless you allow it with `--allow-mutations <regex>`
  - answers main-frame navigations with 204, so the page stays put
  - closes tabs the page opens and denies downloads
- Before clicking, interaction targets are classified, and targets whose labels or URLs mean money, deletion,
  logout or cancellation are excluded. Bot walls and challenge pages are detected and not measured.
- **Politeness:** at most one page load per origin every 10 seconds by default (`--min-load-interval`).

Only run the analyser against sites you own or are allowed to load-test.

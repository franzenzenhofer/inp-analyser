# Contributing

Thanks for helping. Bug reports, new issue rules, test pages and documentation fixes are all welcome.

## Dev setup

Requirements: Node.js >= 26 and git.

```bash
git clone https://github.com/franzenzenhofer/inp-analyser
cd inp-analyser
npm ci
npm run chrome:install   # pinned Chrome for Testing, used headless by the e2e tests
```

Run the CLI from source with `npm run inp -- <command> ...` or `npx tsx src/cli.ts <command> ...`.

## Before you open a pull request

CI runs the same steps:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

- `npm run test` runs the `unit` project (`src/**/*.test.ts`) and the `e2e` project (`tests/e2e/`, real headless Chrome against the local test site).
- `npm run test:unit` / `npm run test:e2e` run one project.
- `npm run test:field` runs real CrUX + PSI calls. It needs `INP_GOOGLE_API_KEY` exported in your shell (see `.env.example`). It is not part of `npm run test`.

## Test site

`npm run test-site` serves `test-site/pages/` on a first-party origin plus a separate third-party origin.
It prints the `--host-resolver-rules` flag you need to point `inp analyse` at it. Every page shows one known
INP problem and declares what the analyser should find in a meta tag:

```html
<meta name="inp-expect" content="slow-handler; target=#show-details; phase=processing; named function expensiveDetailsHandler burns 250 ms">
```

## Adding an issue rule

1. Add the rule to the matching file in `src/issues/rules/` (`input-delay.ts`, `processing.ts`, `presentation.ts`, `context.ts`). The id is `<phase>/<name>`.
2. Link the spec or engine source that defines why it counts (`specUrl`). Describe what is slow and why. Never describe how to fix it.
3. Add a page to `test-site/pages/` that triggers the rule, with an `inp-expect` meta tag.
4. Add a case for the page in `tests/e2e/test-site-pages.test.ts` (latency band, dominant phase), plus unit tests next to the rule.

## Code style

- Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No `any`.
- `oxlint --type-aware --deny-warnings`. Small files and functions: max 200 lines per file and 30 lines per function (see `.oxlintrc.json`).
- No mocks for browser behaviour. Anything that depends on Chrome is tested in real headless Chrome against the test site.
- Every number in a report carries its source, and every threshold links its spec.
- The tool reports issues, never fixes.

## Commits and pull requests

Keep pull requests focused. Say what changed and how you tested it, and fill in the pull request template.
By contributing you agree that your contribution is licensed under the MIT License.

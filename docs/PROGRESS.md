# Tracewell: Progress

Active work: **V1.1 (`V1.1.md`) is finished as far as this project takes it. Two items are with the user: deploying the app, and confirming speed in desktop Chrome. Waiting for the V2 plan. Do not start Phase 8 of `PLAN.md` before then.**

## Phase checklist

- [x] Phase 0: Project setup
- [x] Phase 1: Engine core
- [x] Phase 2: Simulated PostgreSQL
- [x] Phase 3: HTTP request pipeline and first scenario
- [x] Phase 4: UI shell, request builder, trace list
- [x] Phase 5: Player (step mode and animation mode)
- [x] Phase 6: Code panel and data flow view
- [x] Phase 7: Fix toggles, comparison, N+1 scenario (V1 milestone, review with user)
- [ ] Phase 8: Payload driven bug scenarios
- [ ] Phase 9: Concurrency, transactions, locks, pool, event loop
- [ ] Phase 10: Learning layer
- [ ] Phase 11: Persistence, accessibility, docs, polish

---

## V1.1

Plan: `V1.1.md`. Steps: 1 Node upgrade and tooling, 2 Engine fixes, 3 Separate N+1 from the missing index, 4 UI improvements, 5 End-to-end tests, 6 Speed check, 7 CI and deployment.

- [x] Step 1: Node upgrade and tooling (done without the Node upgrade, see below)
- [x] Step 2: Engine fixes
- [x] Step 3: Separate N+1 from the missing index
- [x] Step 4: UI improvements
- [x] Step 5: End-to-end tests with Playwright
- [x] Step 6: Speed check (measured in headless Chromium; desktop Chrome check by the user still open)
- [x] Step 7: CI and deployment (CI workflow and README written; deployment is done manually by the user)

### V1.1 status against its "done when" list (2026-10-07)

| # | Criterion | Status |
| --- | --- | --- |
| 1 | All seven steps meet their criteria | Partly. Step 1 kept Node 20.18.1. Step 6 lacks the desktop Chrome confirmation. Step 7 has no deployment and the workflow has not run on GitHub |
| 2 | All checks pass on the new Node version and in CI | Locally yes, on Node 20.18.1: 163 unit tests, 14 end-to-end tests, lint, typecheck, build. Not run in CI |
| 3 | N+1 is still several times slower than eager loading even with the index | Yes: 63.078 ms against 14.078 ms, 4.5 times |
| 4 | The app is live at a public link | No. The user deploys manually |
| 5 | `docs/PROGRESS.md` has a V1.1 section and `docs/V1.md` sections 11 and 12 are updated | Yes |

### Step 7: CI and deployment (done 2026-10-07, without deployment)

**Deployment was taken out of this step by the user.** Asked for the repository and the hosting choice, the user answered: "nah I will deploy this manually".

#### Built

- `.github/workflows/ci.yml`: on push and pull request, installs with pnpm (version from `packageManager`, Node from `.nvmrc`), then runs `lint`, `typecheck`, `test`, installs Playwright's Chromium, and runs `test:e2e`. `test:e2e` builds the app first, so there is no separate build step. On failure it uploads `test-results`.
- `README.md`: one paragraph on what Tracewell is, how to run it locally, the checks, and links to `docs/V1.md`, `docs/PROGRESS.md` and `PLAN.md`. The tracked file `readme.md` was renamed to `README.md`.
- `docs/V1.md` sections 11 and 12 rewritten to match the code, with a note at the top that sections 1 to 10 still describe V1.

#### Not built, by the user's decision

- No deploy job, no hosting setup, no Vite `base` change, no live link in the README.

#### Not verified

- The workflow has not run on GitHub. Nothing was pushed. The `@v4` action versions in it are from memory and unchecked.
- `pnpm test:speed` is not part of the workflow.

#### For the manual deployment

- `pnpm build` writes a static site to `dist/`. Any static host can serve it.
- If it is served from a sub-path (GitHub Pages serves this repository at `/Tracewell/`), set `base: "/Tracewell/"` in `vite.config.ts` first, or the page loads without its script and styles.
- Once there is a link, add it to `README.md`.

### Step 6: Speed check (measured 2026-10-07, desktop Chrome check still open)

#### Built

- `e2e/speed.spec.ts`, its own Playwright project `speed`, run with `pnpm test:speed` (`pnpm build && playwright test --project=speed --workers=1`). It is left out of `pnpm test:e2e`, so other tests do not compete with it for the CPU.
- It measures inside the page, on the production build, from the user's action until the DOM shows the result: 7 Run clicks to the first trace row, and 12 arrow-key steps to the position text changing.
- Loose assertions only: median Run under 500 ms, median step under 200 ms.

#### Numbers (Playwright's headless Chromium 153, production build, three runs)

| | Run to first trace row, median | First Run of the page | Step, median | Step, max |
| --- | --- | --- | --- | --- |
| Product API, "Valid" (7 events) | 1.8 to 2.0 ms | 6 to 7 ms | 0.9 to 1.0 ms | 1.7 ms |
| N+1, default run (55 events) | 5.4 to 5.6 ms | about 14 ms | 1.0 to 1.1 ms | 2.2 ms |

Both are far inside the step's targets (Run under 100 ms, step under 50 ms).

#### Finding

- The slow Run reported in V1 (0.3 to 0.8 s) does not reproduce. That measurement was taken in the system Chrome, driven by a script from inside a restricted tool sandbox, where everything ran slowly: a CPU profile there showed the time spread evenly over all functions, and `performance.now()` alone took about 0.07 ms per call. The same build in Playwright's Chromium takes 2 to 6 ms.
- So nothing in the app was found to be slow, and nothing was changed. No memoization was added. The four likely causes listed in the plan were not investigated further, because there is no slowness to explain.

#### What the measurement does not cover

- It stops when the DOM is updated. Layout and paint of that frame are not included.
- It is headless Chromium, not a normal desktop browser.

#### Done when

- "In normal desktop Chrome, Run feels instant and stepping is under 50 ms": **not confirmed yet.** This needs the user. Asked on 2026-10-07 to run `pnpm build && pnpm preview`, try Run and the arrow keys on the N+1 scenario, and report whether anything lags.
- If it does lag there, start from a Performance panel recording of one Run and five steps.

### Step 5: End-to-end tests with Playwright (done 2026-10-06)

#### Built

- `@playwright/test` 1.63.0, Chromium only (it supports Node 20).
- `playwright.config.ts`: tests in `e2e/`, run against `pnpm preview` on port 4173, which Playwright starts itself. Reduced motion is on by default so the app is in step mode and nothing moves on its own; the play mode test turns motion back on.
- Script `test:e2e`: `pnpm build && playwright test`. `pnpm test` still runs Vitest only (it matches `src/**/*.test.ts`).
- `e2e/helpers.ts` and four spec files, 14 tests:

| Plan item | Test | File |
| --- | --- | --- |
| 1 | every preset runs and shows its status | `product-api.spec.ts` |
| 2 | invalid JSON is rejected with 400 at the parsing stage | `product-api.spec.ts` |
| 3 | the N+1 loop: 51 queries, turn on eager loading, 2 queries, compare | `n-plus-one.spec.ts` |
| 4 | with the index on, an item query is an Index Scan | `n-plus-one.spec.ts` |
| 5 | the previous run is kept automatically, and pinning locks A | `n-plus-one.spec.ts` |
| 6 | keyboard: Right, Left, Home, End and Space move through the trace | `player.spec.ts` |
| 7 | with reduced motion, the app opens in step mode | `player.spec.ts` |
| 8 | narrow viewport: the page never scrolls sideways | `layout.spec.ts` |
| 9 | a wrong method gets 404, like Express | `product-api.spec.ts` |

- Five more, beyond the plan's list: the response appears only at the end of the trace; without the index an item query is a Seq Scan with `4,000 x 0.005 =` `20.000 ms`; the Why section opens and shows inline code; keys are left alone while typing in a field; with motion allowed the app opens in play mode and animates to the end.

#### Decisions

- Elements are found by role and label: `region` by panel heading, `group` "Payload presets" and "Player", `checkbox` by fix label, `row` and `cell` in the tables. No `data-testid` was added. Three places use a CSS class because there is no accessible name to use: the run summary's `dl.run-summary`, the moving dot `.strip-dot`, and `.why code`.
- `tsconfig.json` now includes `e2e` and `playwright.config.ts`, so `typecheck` covers them. ESLint ignores `test-results` and `playwright-report`, and both are in `.gitignore`.
- `reuseExistingServer` is on, so a preview server already running on port 4173 is used as it is. It serves `dist` from disk, so it still serves the fresh build.

#### Done when

- `pnpm test:e2e` passed three times in a row: 14 passed each time, in 6.2 s, 5.9 s and 4.9 s.
- 163 Vitest tests, `lint`, `typecheck` pass.

#### Note

- This replaces the browser check scripts from Phases 4 to 7 and V1.1 Steps 3 and 4, which lived outside the repository.
- First use on another machine needs `pnpm exec playwright install chromium` (about 95 MB).

### Step 4: UI improvements (done 2026-10-06)

#### 4.1 Cost breakdown in the inspector

- Under the SQL block of a `SQL_QUERY` event, a "Where the time goes" table: Round trip, Rows scanned, Rows returned, Rows written, Sort, then Total. Lines that are zero are hidden. Each line shows its formula with the actual numbers, for example `4,000 x 0.005 = 20.000 ms`.
- `ui/inspector/costLines.ts` builds the lines. The amounts come from `sql.cost` and the total from the event's duration, both computed by the engine. Only the per-row constants are read in the UI, from the engine's exported `COST_CONFIG`, to print the formula.
- Times in this table always show three decimals (`formatMsFixed`).

#### 4.2 Keep the previous run automatically

- `ui/compare/compare.ts`: `CompareState { a, b, pinned }` with `addRun`, `pinA`, `unpinA`, `comparedRuns`. B is always the latest run. Without a pin, each new run moves B to A. With a pin, A stays and new runs replace only B.
- The A column is headed "A (previous run)" or "A (pinned run)", and a line under the table says which mode is active.
- One button: "Pin A" when two runs are shown, "Pin this run as A" with a single run, "Unpin A" while pinned.
- Changing scenario clears both runs. The comparison shows nothing until there are two runs.
- Decisions:
  - Picking a preset clears the trace on screen but keeps the comparison's runs, as before.
  - Pinning with a single run locks that run as A. The comparison appears when a second run arrives.
  - Unpinning keeps the current A and B. The next run then moves B to A.

#### 4.3 Run summary next to the response

- Under the status in the response viewer: Total virtual time, SQL queries, Rows scanned, from `result.metrics`. It appears with the response, when the cursor reaches the end.

#### 4.4 "Why" panel per scenario

- `Scenario.why?: string[]`. Rendered in the header under the description as a collapsible "Why" section (`<details>`), closed by default and closed again when the scenario changes.
- `ui/layout/inlineCode.ts`: `splitInlineCode` splits a paragraph on backticks into text and code parts. No Markdown library and nothing rendered as HTML. A backtick without a partner stays as normal text.
- Content written for both scenarios: four paragraphs for `product-api`, five for `orders-n-plus-one`. A test checks each scenario has three to six paragraphs, balanced backticks, and no dash punctuation or angle brackets.
- The N+1 text says an indexed item query takes "about 1 ms". That figure comes from the cost model (1.12 ms). If `COST_CONFIG` changes, the sentence needs checking.

#### Done when

- All four work in the browser at desktop (1440 px) and narrow (390 px) widths, checked in headless Chrome with no console errors and no horizontal page scroll:
  - cost table for an N+1 item query: `1.000`, `4,000 x 0.005 = 20.000`, `3 x 0.010 = 0.030`, total `21.030 ms`; for an INSERT it adds `Rows written 1 x 0.100 = 0.100 ms`;
  - two runs without pinning showed "A (previous run)" with 51 against 2 queries; a third run moved B to A; after pinning, two more runs left A unchanged; unpinning returned to "A (previous run)";
  - run summary: `1059.083 ms`, `51`, `201,000`;
  - Why section: closed at first, opens, four and five paragraphs, inline code rendered.
- Unit tests cover the auto-keep logic (`compare.test.ts`), the backtick splitting (`inlineCode.test.ts`) and the cost lines (`costLines.test.ts`). 163 tests pass. `lint`, `typecheck`, `build` pass.

Also fixed: a long duration such as `1051.99 ms` overflowed its column in a trace row.

### Step 3: Separate N+1 from the missing index (done 2026-10-06)

#### Built

- Second fix on `orders-n-plus-one`: `indexOrderItems`, "Index order_items.order_id".
- `Scenario.world` may be a function of the fixes. With the fix on, `order_items` gets `indexes: ["order_id"]`. The rows are the same objects in both cases.
- Display code: with the fix on, a three-line block is added at the top (`// Migration`, `// CREATE INDEX order_items_order_id_idx ON order_items (order_id);`, a blank line). The scenario now has four code variants.
- The scenario description says it has two separate problems, each with its own fix.
- Engine: `PerFixes<T>` (`T | (fixes) => T`) and `withFixes(value, fixes)`. `world`, `routes`, `code` and `lines` are all `PerFixes`.

#### The four totals for `GET /users/1/orders`

| | Queries | Total time | Rows scanned | Item query plan |
| --- | --- | --- | --- | --- |
| N+1, no index (default) | 51 | 1059.083 ms | 201,000 | Seq Scan, 4,000 rows each |
| N+1, with index | 51 | 63.078 ms | 1,799 | Index Scan, 15 to 17 rows each |
| Eager load, no index | 2 | 30.083 ms | 5,000 | Seq Scan, 4,000 rows |
| Eager load, with index | 2 | 14.078 ms | 1,799 | Index Scan, 799 rows |

- N+1 with the index is 4.48 times slower than eager load with the index (63.078 / 14.078). The plan requires at least 3.
- Eager load with the index is faster than without it (14.078 against 30.083), not equal. The orders query does not dominate: it takes 6.5 ms in every run.
- With the index, one item query costs 1.12 ms, of which 1 ms is the round trip. That is the lesson: 50 of them is about 56 ms of round trips that the index cannot remove.
- N+1 with the index (63 ms) is slower than eager load without it (30 ms).
- `COST_CONFIG` was not changed.
- All four return exactly the same response body. Rows returned is 249 in all four.

#### Decisions

- The plan says a comment at the top of the display code needs no other change because line numbers come from `lineOf`. That holds for the handler's lines, but the lines the pipeline uses (`scenario.lines.bodyParser`, `route.line`) were fixed per scenario, and the comment moves them by 3. So `routes` and `lines` became `PerFixes` too. A test checks that the body parser, route, both queries and the response point at the right text in all four variants.
- The orders query stays a Seq Scan in all four runs. It filters on `orders.user_id`, which neither fix indexes.

#### Done when

- All four combinations work in tests (147 tests pass) and in the UI. In headless Chrome each was run from the fix checkboxes: the trace had 55 or 6 events, the code panel started with `// Migration` only when the index fix was on, the highlighted response line moved accordingly (29, 32, 32, 35), and the inspector showed Seq Scan or "Index Scan using index on order_id" for an item query. No console errors.
- The comparison view named the right differing fixes: index only, eager only, both, and with A and B swapped (`Eager load items (A on, B off)`). A unit test covers all pairs.
- `lint`, `typecheck`, `build` pass.

### Step 2: Engine fixes (done 2026-10-05)

#### 2.1 Wrong method returns 404, like Express

- A path that exists only under another method now answers 404 with body `{ "error": "Cannot DELETE /products/42" }`.
- The event is `ROUTE_NOT_FOUND` with the label `No route for DELETE /products/42 (GET exists)`. Its snapshot lists the other methods.
- `METHOD_NOT_ALLOWED`, the 405 and the `Allow` header are gone. `matchRoute` returns `{ type: "not-found", otherMethods }`.
- Decision: a path that matches nothing at all gets the same body shape, `Cannot GET /nope`, and the label `No route for GET /nope`. It used to say `No route matches GET /nope`. Express sends the same text in both cases, so both now match.

#### 2.2 Error pointer points at the cause of the final status

- `SimEvent.handled?: boolean`. When a `DbError` is thrown into a handler and the handler catches it and carries on, the query's event gets `handled: true` and " (caught)" on its label.
- `SimError` for a status of 400 or above points at, in order: (1) the failed query whose error reached the error handler; (2) otherwise the last failed event the handler did not recover from; (3) otherwise `RESPONSE_SENT`, with a code derived from the status (`NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, ...).
- How the runner tells caught from uncaught: the error handler's `ERROR_HANDLED` trace effect carries the thrown error as `cause`. If the next effect after a query error is that trace with the same error, the handler did not catch it. Any other next effect means it was caught.
- Behaviour changes that follow from the rules:
  - An uncaught 23505 now points at the failed `SQL_QUERY` event. It used to point at `ERROR_HANDLED`. In the UI, "Show where it went wrong" on the "Duplicate name" preset now jumps to the INSERT.
  - A 404 the handler returns on purpose has code `NOT_FOUND`. It used to be `HTTP_404`.
- Decisions for cases the plan does not cover:
  - A handler that catches a query error, does other work, and then throws the same error again: the error did reach the error handler, so rule 1 applies. The query is the cause and its `handled` mark and " (caught)" label are removed again.
  - A handler that catches a query error and throws a different error: the query stays `handled`, and the error points at `ERROR_HANDLED` with that error's code (rule 2).
  - A handler that catches a query error and answers 200: no `SimError` at all.
- UI follow-up: the code panel's "not reached" logic ignores failed events that are `handled`, so a recovered failure does not dim the rest of the route.

#### 2.3 Cost breakdown on every SQL event

- `SqlInfo.cost: { baseMs, scanMs, sentMs, writeMs, sortMs }`, computed by `queryCost` in `engine/db/cost.ts`. The duration is now the sum of the parts (`costTotal`), so they cannot drift apart.
- Each part is rounded to 0.001 ms. Durations are unchanged from V1: every existing timing assertion still passes.
- A failed query reports the cost of the work done before it failed.

Left as is, as the plan says: `GET /products?limit=-1` reaches the database and returns 500.

#### Done when

- All new and updated tests pass: 137 tests. `lint`, `typecheck`, `build` pass.
- Every product-api preset gives the same status as in V1 (200, 200, 201, 400, 400, 404, 401, 403, 409). This is now a test. Wrong-method requests give 404.
- The plan's three named tests exist: catch a 23505 and return 422 (`handled: true`, points at `RESPONSE_SENT`, code `UNPROCESSABLE_ENTITY`); uncaught 23505 gives 409 and points at the failed SQL event; `GET /products/999999` points at `RESPONSE_SENT` with code `NOT_FOUND`.
- Not checked in a browser. The changes are in the engine; the UI was not opened for this step.

### Step 1: Node upgrade and tooling (done 2026-10-05, Node not upgraded)

**The step's goal, moving off Node 20, was not met. This was the user's decision.** Asked which Node to target, the user answered: "current node version installed in my pc is 20.18.1, work with that". Node 20 reached end of life in April 2026, so this stays an open item.

#### Built

- `.nvmrc` with `20.18.1`, and `engines.node` `>=20.18.1 <21` in `package.json`.
- pnpm 10.34.6 is installed globally under Node 20, so `pnpm` works directly. The `packageManager` pin is kept.
- Vitest 3.2.7 to 4.1.11. Vitest 4 supports Node 20 and Vite 6. Nothing needed changing.
- typescript-eslint 8.71.0 to 8.71.1.
- `src/lint-guard.test.ts`: lints short code strings through ESLint's Node API with the real `eslint.config.js`, using file paths inside `src/engine` and `src/scenarios`. Expects errors for React imports, imports from a `ui` folder, `Date.now()`, `Math.random()`, `setTimeout` and `setInterval`, and no errors for a normal engine import, a scenario importing the engine, or a UI file.
- `src/scratch.test.ts` deleted. It had been committed in the "Phase 7 completed" commit.

#### Not upgraded, because they need a newer Node

| Package | Installed | Newest | Newest needs |
| --- | --- | --- | --- |
| Vite | 6.4.3 | 8.3.2 | Node 20.19 or 22.12 (Vite 7 has the same floor) |
| `@vitejs/plugin-react` | 4.7.0 | 6.1.2 | Node 20.19 or 22.12 (version 5 has the same floor) |
| ESLint, `@eslint/js` | 9.39.5 | 10.x | Node 20.19, 22.13 or 24 |
| Vitest | 4.1.11 | 5.0.3 | Node 22.12 or 24 |

ESLint 9 now prints a "no longer supported" deprecation warning on install. TypeScript (5.9.3) and Zod (4.6.5) were left on their current majors, as the plan says. `eslint-plugin-react-hooks` 7.1.1 is already the newest.

#### Done when

- `node -v` matches `.nvmrc`: yes, both 20.18.1.
- All checks pass on the new versions: 127 tests, `lint`, `typecheck` and `build` pass with Vitest 4.
- The lint guard test passes, and fails if the guard rules are removed: checked by hand once. With the guard block removed from `eslint.config.js`, 6 of the 9 tests failed. The block was restored.

#### Consequences for later steps

- Step 5 (Playwright) and Step 7 (CI) should use Node 20.18.1 too, from `.nvmrc`.
- When Node is upgraded later: raise `.nvmrc` and `engines.node`, then upgrade Vite, `@vitejs/plugin-react`, Vitest and ESLint together.

---

## Phase 7: Fix toggles, comparison, N+1 scenario (done 2026-10-04, V1 milestone)

### Built

- Fix toggle system: `Scenario.fixes` (`{ id, label, description }`). Handlers read `ctx.fixes.<id>`. `Scenario.code` may be a function of the fixes, read through `scenarioCode(scenario, fixes)`.
- `scenarios/orders-n-plus-one`: `world.ts` (20 users, 1,000 orders, about 4,000 order items, primary key indexes only), `code.ts` (two code variants and their line maps), `handlers.ts`, `fixes.ts`, `presets.ts`, `index.ts`, `scenario.test.ts`. Route `GET /users/:id/orders`.
- Metrics: `sqlQueries`, `rowsScanned`, `rowsReturned` next to `totalTime`, computed from events only.
- `ui/request-builder/FixToggles.tsx`: a checkbox per fix in the request panel.
- `ui/compare`: `CompareView` and `compare.ts`. Pin the run on screen as A; the next run is B. Shows request, status, total time, SQL queries, rows scanned, rows returned and fixes for both, the change from A to B, and which fixes differ.

### Done when (verified by tests and in headless Chrome)

- Default run: 51 queries (1 for orders, 50 for items), 55 events, total 1059.083 ms.
- With "Eager load items": 2 queries, total 30.083 ms, and exactly the same response body.
- The comparison shows both runs: 51 vs 2 queries, 201,000 vs 5,000 rows scanned, 249 rows returned in both, and "Eager load items (A off, B on)".
- Tests cover both variants, including that each variant's events point at the right lines of its own code.
- The section 9 loop was walked in the browser: open the scenario, run, step (the 50 item queries collapse into one row that shows "11 of 50" and expands to 50 rows), play, turn on the fix, run again, compare.

### Decisions

- Both code variants share the same text up to the orders query, so the lines the pipeline uses (body parser, route) do not move. The handler picks its line map from the same fix flag. This scenario's display code has no error handler.
- Toggling a fix does not clear the run on screen. The code panel keeps showing the code that run used, and a notice says to run again. This keeps a run available to pin.
- The comparison's B is always the run on screen once it differs from A. It compares whole runs, not state at the cursor. Picking a preset clears the run on screen but keeps A. Changing scenario clears both and resets the fixes.
- Every metric in the comparison is "lower is better", so a drop is marked as an improvement with an arrow as well as colour.
- Playback: events of the same group are 140 ms apart at 1x, so 50 repeated queries do not take 50 full pauses. The maximum gap dropped from 3000 ms to 1800 ms.
- Item queries read the whole `order_items` table (4,000 rows) because nothing indexes `order_id`, as the plan specifies. So the fix saves both round trips and scans: 201,000 rows scanned becomes 5,000.
- A user with no orders returns early, so the eager variant never builds an empty `IN ()`.
- Orders are interleaved across users in the table (order 1 belongs to user 1, order 2 to user 2, ...).

### Not built

- A metrics line in the response viewer. Query and row counts are visible in the comparison only.

---

## Phase 6: Code panel and data flow view (done 2026-10-04)

### Built

- `ui/code-panel/CodePanel.tsx`: the scenario's display code with line numbers. The line of the event at the cursor is highlighted and kept in view.
- `ui/code-panel/lines.ts`: `lineStates` (current, executed, failed, not reached) and `blockEnd` (bracket matching to find where a route's code ends).
- `ui/code-panel/highlight.ts`: a small tokenizer for keywords, strings, numbers and comments. No editor library.
- `ui/inspector/flowItems.ts` and `DataFlow.tsx`: the data flow view, a vertical list of Raw body, Parsed JSON, Validated DTO, SQL params, DB row, Response body.
- `ui/inspector/Inspector.tsx`: a switch between "This step" (the previous inspector) and "Data flow".
- Layout: the right column now holds the code panel above the inspector.
- Engine: a successful `SQL_QUERY` event's snapshot holds the first rows the query returned (`ENGINE_CONFIG.snapshotRowLimit`, 5). The handler still gets every row.

### Done when (verified by tests and in headless Chrome)

- Stepping through `POST /products` highlights lines 7, 40, 42, 43, 47, 50 in order (body parser, route, auth, validate, INSERT, 201 response). The first event, the request arriving, has no code line.
- A validation failure shows Raw body and Parsed JSON, then "Validation failed", then the response, and no Validated DTO.

### Decisions

- "Not reached" applies to the matched route's own code: after the first failed event at or before the cursor, every non-blank line of that route after the last line that ran is dimmed and its number struck through. A 404 the handler returns on purpose counts, so the success path below it is marked too. A failure before routing (invalid JSON) marks nothing.
- Lines that already ran get a dot in the gutter, the current line an arrow, a failed line a cross. Each state also has screen reader text.
- Long code lines wrap instead of scrolling sideways.
- Data flow items appear only once the cursor reaches the event that produced them. The item produced by the current event is tagged "this step". A later query replaces the SQL params and DB rows of an earlier one. A failed step shows the failure in place of its data.
- The data flow view reads event types (`BODY_PARSED`, `VALIDATION_OK`, ...) and snapshot fields. A new kind of data needs a case in `flowItems.ts`.
- The inspector opens on "This step". The choice is kept while stepping and between runs.
- Two switch buttons are used, not ARIA tabs, so the arrow keys keep stepping the player.

### Deferred

- Display code that changes with a fix toggle: Phase 7.

### Note

- macOS file names are case-insensitive: `dataFlow.ts` and `DataFlow.tsx` in one folder broke the typecheck. Do not create files whose names differ only by case.

---

## Phase 5: Player (step mode and animation mode) (done 2026-10-04)

### Built

- `ui/player/usePlayer.ts`: `usePlayer(events, reducedMotion)` with `cursor`, `mode`, `speed`, `granularity`, `next`, `prev`, `first`, `last`, `seek`, `play`, `pause`, `toggle`.
- `ui/player/logic.ts`: pure `nextIndex`, `prevIndex`, `stepDelay` and the `PLAYBACK` constants.
- `ui/player/PlayerControls.tsx`: First, Prev, Play / Pause / Replay, Next, Last, position, mode, speed (0.5x, 1x, 2x, 4x), step granularity.
- `ui/player/PipelineStrip.tsx` and `pipeline.ts`: stage boxes above the trace, with a dot that moves in play mode.
- `ui/player/usePlayerKeys.ts`: Left / Right, Space, Home / End.
- `ui/player/useReducedMotion.ts`.
- `ui/trace/rows.ts` and `TraceList.tsx`: events after the cursor are dimmed, the current row is highlighted and kept in view, consecutive events with the same `groupKey` collapse into one expandable row.
- Inspector and response viewer follow the cursor.
- Engine: `groupKey` can be set on `db` and `trace` effects and is copied to the event.

### Done when (verified in headless Chrome)

- Switching modes mid-run keeps the cursor: paused at event 3, it stayed at 3; Next moved to 4; Play resumed from 4.
- Changing speed during play works without restarting: switching to 4x at event 2 kept the cursor at 2 and kept playing.
- With `prefers-reduced-motion: reduce` the app opens in step mode, stays on the first event after Run, and shows no moving dot. Play still works when asked for.
- Also checked: Left, Right, Home, End and Space; keys are ignored while typing in a field; clicking a trace row moves the cursor; the response appears only at the end of the trace.

### Decisions

- The mode is kept between runs. In play mode a new run animates from the first event; in step mode it waits on the first event. Play mode is the default unless reduced motion is set.
- Any manual move (Next, Prev, First, Last, clicking a row, arrow keys) switches to step mode. At the end of a trace the Play button becomes Replay and starts again from the first event.
- Animation gap = virtual time between two event starts x 600, kept between 450 ms and 3000 ms, divided by speed. The plan asks only for a minimum; the maximum keeps a slow query from stalling the animation.
- "Step by stage" stops on the last event of each run of same-stage events, so a stage's work is complete at every stop.
- The response viewer shows the response only when the cursor is on the last event, with a "Skip to the end" link before that. This follows "the whole UI renders state at cursor".
- Strip boxes are Parse, Router, Middleware, Auth, Validation, Controller, DB, Response. Auth comes before Validation (the plan lists them the other way round) because that is the order `product-api` runs them. The request event and body parsing both count as Parse; Middleware is for other middlewares. An Error handler box appears only in runs that reach the error handler. Boxes a request never passes through are dashed.
- Clicking a collapsed group moves the cursor to the group's last event. While the cursor is inside a collapsed group the row shows "12 of 50".
- Space pressed on a button outside the trace presses that button instead of toggling play.
- The current trace row is kept in view by scrolling the trace panel only, never the page.

### Not exercised yet

- No scenario sets `groupKey` until Phase 7, so grouped rows are covered by unit tests (`player.test.ts`) but have not been seen in the browser. (Seen and checked in Phase 7.)

### Open question

- In the headless Chrome used for checking, a Run click took about 0.3 to 0.8 s and the first few steps of a session 0.2 to 0.7 s (later steps 6 to 90 ms). The same simulation takes 1 to 3 ms in Node, and a CPU profile showed the time spread evenly over every function with no hot spot, which points at that browser environment and not at app code. Not confirmed in a normal browser. If Run feels slow there, profile it before Phase 7 adds bigger traces.
- `ResponseViewer` now takes `response`, `error` and `totalTime` instead of the whole result, so React does not compare every table row in development.

---

## Phase 4: UI shell, request builder, trace list (done 2026-10-04)

### Built

- `App.tsx`: holds the scenario, the request draft, the last `SimulationResult` and the selected event. Calls `runSimulation`.
- `ui/layout/Header.tsx`: scenario picker fed by the registry, with the scenario description.
- `ui/request-builder`: `RequestBuilder` (presets, method, path, Run, JSON body with inline parse hint), `KeyValueTable` (query params and headers), `draft.ts` (the editable request and its conversion to a `SimRequest`).
- `ui/trace`: `TraceList` (one row per event: status icon, stage, label, start time, duration) and `StatusIcon`.
- `ui/inspector/Inspector.tsx`: label, status, stage, event type, times, code line, SQL block (text, params, plan, rows), snapshot JSON.
- `ui/response/ResponseViewer.tsx`: status, total virtual time, headers, body, and the error with a link to the event where it went wrong.
- `ui/format.ts`: `formatMs`, `formatJson`.
- `index.css`: one plain stylesheet, light and dark through `prefers-color-scheme`, three columns that stack below 960px.

### Done when (verified)

- In headless Chrome against the dev server: every `product-api` preset was clicked and run, and showed the expected status and trace (200, 200, 201, 400, 400, 404, 401, 403, 409). A hand-typed `GET /products?category=audio&limit=3`, an unknown path (404) and a wrong method (405) also worked. No console errors. At 390px wide the layout is one column with no horizontal scroll.
- No engine logic in UI files: UI code imports only `runSimulation`, `createRequest`, `statusLabel` and types from `src/engine`. The one piece of logic in the UI is `draft.ts`, which shapes user input into a request and is covered by `draft.test.ts`.

### Decisions

- Picking a preset loads it and clears the previous run. Editing any field deselects the preset.
- After a run, the selected event is the one that explains the error, or the first event when there is no error.
- Invalid JSON in the body shows an inline warning but does not block Run, because the 400 at the parsing stage is something to learn from.
- Pressing Enter in the path field runs the request (the builder is a form).
- A query string typed into the path works as well as the query params table.
- The engine exports `statusLabel` so the UI does not keep its own status text table.
- A response viewer folder, `ui/response`, was added to the section 4 structure.
- An exception thrown by `runSimulation` shows as a plain message above the workspace, not a stack trace.
- Status is shown with a symbol and screen reader text, not colour alone.
- No UI test library was added. UI behaviour was checked in a real browser, as above.

### Deferred

- Player, dimming events after the cursor, pipeline strip, event grouping, keyboard navigation of the trace: Phase 5.
- Code panel and data flow view: Phase 6. The inspector shows the code line number only.
- Saving the draft across reloads: Phase 11.

---

## Phase 3: HTTP request pipeline and first scenario (done 2026-10-04)

### Built

- `engine/http/pipeline.ts`: one request as a single generator: request received, body parsing, routing, middlewares, handler, error handler, response.
- `engine/http/request.ts`: `createRequest(parts)` fills defaults and moves a query string typed into the path into `query`.
- `engine/http/router.ts`: method + path patterns with params. No match gives 404, wrong method gives 405 with an `Allow` header.
- `engine/http/auth.ts`: `requireAuth({ role, line })` and `fakeJwt(payload)` (base64 JSON, no crypto).
- `engine/http/validate.ts`: `validateBody(zodSchema, { line })`.
- `engine/http/errors.ts`: `HttpError` and the error handler mapping (23505 to 409, unknown to 500).
- `engine/http/response.ts`: `ctx.res.status(code).json(body, { line })` and `ctx.res.json(body, { line })`.
- `engine/core/effects.ts`: `trace({...})`, a general effect that records one event at any stage.
- `engine/core/code.ts`: `lineOf(code, snippet)` so handlers point at display code without hard-coded line numbers.
- `scenarios/index.ts`: registry (`scenarios`, `getScenario`).
- `scenarios/product-api`: `world.ts` (1,000 products, 3 users), `code.ts`, `handlers.ts`, `presets.ts`, `index.ts`, `scenario.test.ts`.
- Zod added as a dependency.

### Done when (verified by `scenario.test.ts`)

- `GET /products/42` gives 200, one SQL event, no errors.
- `GET /products/999999` gives 404 after a DB event.
- `POST /products` without token gives 401 and no DB event.
- `POST /products` with `price: -5` gives 400 and no DB event.
- Duplicate product name gives 409.
- Also covered: wrong role 403, missing field 400, invalid JSON 400, 404 and 405 from the router, expired and unreadable tokens, middleware ending a request early, and every event pointing at the right display code line.

### Event types added

`REQUEST_RECEIVED` (network), `BODY_PARSED` / `BODY_PARSE_SKIPPED` / `BODY_PARSE_FAILED` (middleware), `ROUTE_MATCHED` / `ROUTE_NOT_FOUND` / `METHOD_NOT_ALLOWED` (router), `AUTH_OK` / `AUTH_MISSING_TOKEN` / `AUTH_INVALID_TOKEN` / `AUTH_TOKEN_EXPIRED` / `AUTH_FORBIDDEN` (auth), `VALIDATION_OK` / `VALIDATION_FAILED` (validation), `ERROR_HANDLED` (error), `RESPONSE_SENT` (response).

### Decisions

- The whole request is one generator. Middlewares and the handler run inside it through `yield*`, so the runner drives a single generator per request. The Phase 9 scheduler can interleave requests by stepping these generators.
- `Scenario` now has `routes` instead of a single `handler`, plus `code`, `lines` (body parser and error handler lines) and `presets`.
- `SimRequest.body` is the raw body text (`string | null`), not parsed JSON. The engine parses it so invalid JSON fails at the parsing stage. This changes the section 5 type.
- The body is parsed only when `Content-Type` contains `application/json`, like `express.json()`. Otherwise `req.body` is undefined and the event has status `skip`. Header names are case-insensitive.
- A wrong method gives 405 as the plan says. Real Express would answer 404.
- A middleware returning a response ends the request. Returning nothing passes it on.
- Auth and validation reject by returning a response after a `fail` event. Thrown errors (`HttpError`, `DbError`, anything else) go to the error handler, which records `ERROR_HANDLED`.
- `result.errors` has one `SimError` for every response with status 400 or above, including a 404 a handler returns on purpose. Its `code` and `eventSeq` come from the last failed event (for example `AUTH_FORBIDDEN`, `VALIDATION_FAILED`, `23505`), or `HTTP_<status>` when no event failed.
- Engine aborts (`ENGINE_STEP_LIMIT`, `ENGINE_INVALID_EFFECT`, `ENGINE_INTERNAL_ERROR`) stop the simulation with no `RESPONSE_SENT` event. The pipeline's own events count toward the step limit.
- Token expiry is checked against a fixed simulated date, `ENGINE_CONFIG.nowEpochSeconds`, never the real date.
- The invalid JSON message is a fixed string, because the parser's own message differs between JS engines.
- All cost constants moved into `COST_CONFIG` in `engine/core/config.ts` (HTTP and database together). `db/cost.ts` keeps the formulas. Response and body parsing cost grow with JSON size.
- Every duration is rounded to 0.001 ms with `roundMs`.
- Snapshots are deep-copied when recorded, so they keep the data as it was at that moment.
- The display code uses `pg` style `db.query` calls whose SQL matches the generated SQL text exactly.
- Three presets beyond the plan's six: Get product, List by category, Duplicate name.
- ESLint `require-yield` is off, because a handler that only returns a response is valid.

### Known limits

- If a handler catches a failed query and later returns a different 4xx, the `SimError` still points at the failed query.
- `GET /products?limit=-1` reaches the database and fails with 2201W, giving a 500. That is left as it is; the pagination scenario in Phase 8 covers limits.

### Deferred

- `fixes.ts` and fix toggles: Phase 7. `learn.md`: Phase 10.

---

## Phase 2: Simulated PostgreSQL (done 2026-10-04)

### Built

- `engine/db/types.ts`: table model (`TableDef`: name, columns, primary key, unique columns, indexed columns, rows), query objects, `QueryStats`.
- `engine/db/database.ts`: `createDatabase(defs)` copies and checks seed rows; `snapshotDatabase` produces `worldAfter`.
- `engine/db/where.ts`: conditions (equality, `ne`, `in`, `gt`, `gte`, `lt`, `lte`, NULL checks), combined with AND.
- `engine/db/sql.ts`: `toSql(query)` gives display SQL with `$1, $2` params.
- `engine/db/execute.ts`: `executeQuery` for select (where, orderBy, limit, offset, columns), insert, update, delete, with plan choice and constraint checks.
- `engine/db/cost.ts`: `COST_CONFIG` and `queryDuration`. All constants in one object, labeled as model parameters.
- `engine/db/errors.ts`: `DbError` with Postgres codes, `isDbError`.
- `engine/db/effects.ts`: `db.select`, `db.insert`, `db.update`, `db.delete`.
- Runner: a `db` effect runs the query, records a `SQL_QUERY` event (stage `db`) and resumes the handler with rows, or throws the `DbError` into it.
- `Scenario` gained `world?: TableDef[]`. Each run builds a fresh database from it.

### Done when (verified by tests)

- Select by indexed vs non-indexed column gives a different plan and `rowsScanned` (11 vs 1,000 on 1,000 rows).
- Insert with a duplicate unique value fails with 23505 and writes nothing.
- Generated SQL text matches expected strings for select, insert, update, delete.
- The same query twice gives the same cost.
- Also covered: NOT NULL (23502), sort cost, limit and offset, IN lookups, NULL handling, update and delete, handlers catching DB errors, `worldAfter`, seed data never mutated.

### Decisions

- Cost model: `duration = base + scanned * perRowScan + returned * perRowSent + written * perRowWrite + sort`, where sort is `n * log2(n) * perSortCompare`. Durations are rounded to 0.001 ms and the clock stays on that grid.
- Index scan `rowsScanned` = `ceil(log2(n))` per lookup key, plus the rows the index points at. Seq scan = table size.
- Only equality and `IN` on an indexed column use an index. Range comparisons and NULL checks always seq scan. Primary key and unique columns are indexed automatically.
- Sort cost applies when the first `orderBy` column has no index.
- Indexes are declared columns that change the plan and cost. Rows are still found by filtering the real row array, so results are always real. There is no separate index data structure.
- Writes behave like `RETURNING *`: every db effect resumes the handler with `Row[]`, and the display SQL ends with `RETURNING *`.
- An integer primary key left out of an insert is filled from a per-table sequence (like `SERIAL`). A failed insert does not use up an id.
- `SqlInfo.plan` has a third value, `"Insert"`. `SqlInfo` also carries `index`, `rowsSorted`, `rowsWritten` (additions to the section 5 type).
- A failed query still records a `SQL_QUERY` event with `status: "fail"` and the error in `snapshot.error`.
- A `DbError` the handler does not catch ends the run with an `UNHANDLED_DB_ERROR` event, status 500, and the Postgres code as `SimError.code`. Phase 3's error handler will map codes to statuses (23505 to 409).
- Extra error codes beyond the plan: 42P01 (unknown table), 42703 (unknown column), 2201W (bad LIMIT or OFFSET).
- Keys and indexes are single column only.
- The handler generator's resume type is `any`, because TypeScript cannot type each yield separately. Handlers annotate results: `const rows: Row[] = yield db.select(...)`. Standalone handler functions need the return type `HandlerGenerator`.
- Bad seed data (duplicate key, missing NOT NULL value, index on an unknown column) throws a plain `Error` when the database is created. It is a scenario bug, not a simulated failure.

### Known limits

- `LIMIT` without `ORDER BY` still scans the whole table in a seq scan. Real Postgres would stop early.
- No column type checking on values. No OR, joins, aggregates, or defaults other than the serial primary key.

### Deferred

- Transactions, locks, connection pool: Phase 9.
- Raw SQL string effect for the injection scenario: Phase 8.
- `groupKey` on db effects: Phase 7.

---

## Phase 1: Engine core (done 2026-10-04)

### Built

- `engine/core/types.ts`: the section 5 types, plus `SimResponse`, `Effect`, `Handler`, `HandlerContext`, `Scenario`, `SimulationInput`.
- `engine/core/clock.ts`: virtual clock (`now`, `advance`). Starts at the request's `startAt`.
- `engine/core/rng.ts`: seeded mulberry32 (`next`, `int`). Handlers reach it through `ctx.rng`. The seed is stored in the result.
- `engine/core/recorder.ts`: event recorder with incrementing `seq` (starts at 0).
- `engine/core/effects.ts`: `delay(ms, label, line)` and `log(label, line)`.
- `engine/core/runner.ts`: drives a generator handler, runs effects, resumes with results, catches thrown errors, enforces the step limit.
- `engine/core/config.ts`: `maxSteps` (10,000) and `defaultSeed`.
- `engine/metrics`: `computeMetrics(events)`, only `totalTime` for now.
- `engine/index.ts`: `runSimulation({ scenario, requests, fixes?, seed? })` for a single request.

### Done when (verified by tests)

- Three yielded effects give three events in order with correct virtual times.
- Same input twice gives deep-equal results (handler uses `ctx.rng`); a different seed gives a different result.
- An infinite loop of yields stops at the step limit with an `ENGINE_STEP_LIMIT` error result.
- Also covered: thrown error, invalid effect, returned response, `startAt` offset, clock, RNG, recorder.

### Decisions

- A handler may return a `SimResponse`. Returning nothing gives `{ status: 200, headers: {}, body: null }`. The `ctx.res` builder from the plan's example comes in Phase 3.
- Every failure ends the run with one `stage: "error"` event, one `SimError`, and a 500 response. Codes: `HANDLER_ERROR` (handler threw), `ENGINE_STEP_LIMIT`, `ENGINE_INVALID_EFFECT` (unknown effect kind, or a negative or non-finite delay).
- `delay` and `log` events use stage `controller`. `log` has duration 0.
- `Scenario` is `{ id, name, handler }` for now. Routes, world, display code and fixes are added by the phases that need them.
- `runSimulation` throws if `requests` does not hold exactly one request. Multiple requests arrive with the Phase 9 scheduler.
- `fixes` defaults to `{}` and `seed` to `ENGINE_CONFIG.defaultSeed` (1).
- Added lint rules for `src/engine` and `src/scenarios` that ban `Date.now`, `Math.random`, `setTimeout` and `setInterval` (principles 3 and 4). This was not in the plan's task list.

### Known limits

- The step limit counts yielded effects. A handler that loops forever without yielding would still freeze. Handlers are authored by us, so this is a rule for scenario authors, not a runtime guard.

### Deferred

- Effects resuming the generator with a value or a thrown error (needed for DB results and catchable DB errors): Phase 2. The runner already passes each effect's result back into `gen.next`.

---

## Phase 0: Project setup (done 2026-10-04)

### Built

- Vite + React + TypeScript app, managed with pnpm. TS strict mode on.
- Vitest with one passing sample test (`src/engine/index.test.ts`).
- ESLint flat config (`eslint.config.js`). `no-restricted-imports` blocks `react`, `react-dom`, their subpaths, and anything under a `ui` folder for files in `src/engine` and `src/scenarios`.
- Folder structure from PLAN.md section 4, with placeholder `index.ts` files in `src/engine/*`, `src/scenarios`, and `src/ui/*`.
- Scripts: `dev`, `build`, `test`, `lint`, `typecheck` (plus `preview`, `test:watch`).

### Done when (verified)

- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass.
- A temporary file in `src/engine` (and one in `src/scenarios`) importing `react` and `../ui/layout` made lint fail with 4 `no-restricted-imports` errors. The temporary files were removed.

### Decisions

- Tool versions are pinned to majors that support the local Node (20.18.1): Vite 6, Vitest 3, ESLint 9, `@vitejs/plugin-react` 4, TypeScript 5.9. The newest majors of each need Node 20.19+ or 22+. Upgrade them together after upgrading Node.
- pnpm is pinned through `packageManager` (`pnpm@10.34.6`).
- Extra TS strictness beyond `strict`: `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`.
- One `tsconfig.json` for app code and `vite.config.ts`. Vitest config lives in `vite.config.ts`, environment `node`, tests matched by `src/**/*.test.ts`.
- The `ui` import block is a regex on the import path (`(^|/)ui(/|$)`), so the engine also cannot have its own folder named `ui`.

### Deferred

- `src/scenarios/product-api/*` files: created in Phase 3 with the first scenario.
- Zod: added in Phase 3 when validation is built.
- `docs/ENGINE.md`, `docs/ADDING_A_SCENARIO.md`, `README.md` content: Phase 11.
- No lasting automated test for the lint guardrail. It was checked by hand. Recheck if `eslint.config.js` changes.

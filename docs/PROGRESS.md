# Tracewell: Progress

Active phase: **none. Phase 7 (V1 milestone) is done. Review the product with the user before starting Phase 8.**

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

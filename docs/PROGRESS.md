# Tracewell: Progress

Active phase: **Phase 3: HTTP request pipeline and first scenario** (not started)

## Phase checklist

- [x] Phase 0: Project setup
- [x] Phase 1: Engine core
- [x] Phase 2: Simulated PostgreSQL
- [ ] Phase 3: HTTP request pipeline and first scenario
- [ ] Phase 4: UI shell, request builder, trace list
- [ ] Phase 5: Player (step mode and animation mode)
- [ ] Phase 6: Code panel and data flow view
- [ ] Phase 7: Fix toggles, comparison, N+1 scenario (V1 milestone, review with user)
- [ ] Phase 8: Payload driven bug scenarios
- [ ] Phase 9: Concurrency, transactions, locks, pool, event loop
- [ ] Phase 10: Learning layer
- [ ] Phase 11: Persistence, accessibility, docs, polish

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

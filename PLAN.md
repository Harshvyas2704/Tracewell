# Tracewell: Build Plan

Product name: Tracewell.

This file is the build plan. Work through it one phase at a time. Do not start a phase until the previous phase meets its "Done when" criteria.

---

## Instructions for Claude

- Build only the current phase. Do not add features from later phases, even if they look easy.
- At the start of a session, read this file, then check `docs/PROGRESS.md` to see which phase is active.
- At the end of each phase, update `docs/PROGRESS.md` with what was built, what was deferred, and any decisions made.
- The engine (`src/engine`) must never import React or anything from `src/ui`. This is enforced by ESLint. Do not work around it.
- Every engine feature needs Vitest tests before moving on.
- Prefer small files and plain functions over classes and abstractions.
- Do not add a state management library, UI component library, or backend server unless a phase says so.
- Never execute user-provided code. Users only provide data (URL, headers, body, toggles).
- If something in this plan is unclear or seems wrong, stop and ask instead of guessing.

---

## 1. Product summary

An interactive tool that shows what happens inside a backend server when it handles a request.

It is not a system design diagram tool. The focus is the inside of the API box:

- HTTP parsing, headers, status codes
- Middleware chain, router, validation, auth, controller, error handler
- ORM calls, generated SQL, query plans, indexes
- Transactions, row locks, connection pool
- The Node.js event loop and what blocks it
- Real backend bugs: N+1 queries, missing indexes, race conditions, SQL injection, mass assignment, non-idempotent retries, pool exhaustion

The user picks a scenario, edits a request (method, URL, headers, JSON body), runs it, and watches the request move through the server step by step or as an animation. Each step shows the line of code running, the request data at that moment, and any SQL executed. Many scenarios contain a bug the user diagnoses and fixes with a toggle, then compares before and after.

Database: PostgreSQL only (simulated). Runtime: Node.js with Express style code (simulated).

### The core loop

```
Pick scenario
  -> Edit request (or pick a payload preset)
  -> (Optional) Predict the outcome
  -> Run
  -> Step through or play the trace
  -> Inspect code line, request data, SQL, query plan
  -> Flip a fix toggle
  -> Run again
  -> Compare runs
```

If a feature does not improve this loop, it does not belong in the early phases.

---

## 2. Architecture principles

```
Scenario data (world, handlers, code, presets)
        |
        v
Engine (pure TypeScript, no React)
        |
        v
SimulationResult (events + response + metrics)
        |
        v
UI (renders the events at a cursor position)
```

1. The engine decides what happens. The UI only displays it.
2. Everything the user sees is driven by the event log. Animation, step mode, timeline, inspector, and metrics all read the same events.
3. The simulation is deterministic. Same scenario + same request + same toggles + same seed gives the same result. Randomness only through a seeded RNG.
4. Time is virtual. The engine has its own clock in milliseconds. Never use `Date.now()` or real timers inside the engine.
5. The database is real data in memory (tables, rows, indexes). Results come from actually running queries against that data, not from probabilities.
6. Costs come from work done (rows scanned, rows returned, lock waits), not from fixed latency numbers. All cost constants live in one config file and are labeled as model parameters, not benchmarks.
7. Handlers are generator functions that yield effects. This lets the engine pause and interleave requests (needed for concurrency in Phase 9) without rewriting earlier code.

### Handler design (decided now, used from Phase 1)

Handlers are authored by us inside scenario definitions. They are generator functions that yield effects, similar to redux-saga. The engine runs the effect, records events, advances the clock, and resumes the generator with the result.

```ts
function* getProduct(ctx: HandlerContext) {
  const id = Number(ctx.req.params.id);
  const rows = yield db.select("products", { where: { id } }, { line: 4 });
  if (rows.length === 0) {
    return ctx.res.status(404).json({ error: "Not found" }, { line: 6 });
  }
  return ctx.res.status(200).json(rows[0], { line: 8 });
}
```

Each effect carries a `line` number that points into the display code shown to the user (a separate string of Express style code in the scenario definition). The display code is never executed.

---

## 3. Tech stack

- Vite + React + TypeScript (strict mode)
- Vitest for tests
- ESLint with `no-restricted-imports` to block `src/engine` from importing `react` or `src/ui`
- Zod for request body schemas inside scenarios
- Plain CSS or CSS modules. No UI library.
- `localStorage` for persistence (Phase 11 only)
- pnpm

No backend server. No accounts. Everything runs in the browser.

---

## 4. Folder structure

```
src/
  engine/
    core/          # types, clock, rng, event recorder, runner
    db/            # tables, indexes, query execution, cost model, SQL text, transactions, locks, pool
    http/          # request model, router, middleware runner, response builder, errors
    runtime/       # event loop model (Phase 9)
    metrics/       # derived metrics from events
    index.ts       # public engine API: runSimulation(...)
  scenarios/
    product-api/
      world.ts     # tables and seed rows
      handlers.ts  # generator handlers
      code.ts      # display code string
      presets.ts   # payload presets
      fixes.ts     # fix toggles
      learn.md     # explanation (Phase 10)
      scenario.test.ts
    index.ts       # scenario registry
  ui/
    layout/
    request-builder/
    trace/
    player/
    inspector/
    code-panel/
    compare/
  App.tsx
docs/
  PROGRESS.md
  ENGINE.md
  ADDING_A_SCENARIO.md
```

---

## 5. Core types (starting point, refine in Phase 1)

```ts
type SimRequest = {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown; // parsed JSON, or raw string if parsing failed
  startAt: number; // virtual ms, for concurrent runs
};

type SimEvent = {
  seq: number; // global order
  requestId: string;
  stage:
    | "network"
    | "middleware"
    | "router"
    | "validation"
    | "auth"
    | "controller"
    | "db"
    | "pool"
    | "lock"
    | "eventloop"
    | "response"
    | "error";
  type: string; // e.g. "SQL_QUERY", "VALIDATION_FAILED", "LOCK_WAIT"
  label: string; // short human text for the trace
  startTime: number; // virtual ms
  duration: number; // virtual ms
  line?: number; // display code line
  status: "ok" | "fail" | "skip" | "wait";
  snapshot?: unknown; // request data at this moment (raw, parsed, validated, ...)
  sql?: {
    text: string;
    params: unknown[];
    plan: "Seq Scan" | "Index Scan";
    rowsScanned: number;
    rowsReturned: number;
  };
  groupKey?: string; // used to collapse repeated events (N+1)
};

type SimulationResult = {
  requests: SimRequest[];
  responses: Record<
    string,
    { status: number; headers: Record<string, string>; body: unknown }
  >;
  events: SimEvent[];
  metrics: Metrics;
  errors: SimError[];
  worldAfter: WorldSnapshot;
  seed: number;
};

type SimError = {
  status: number;
  code: string;
  message: string;
  requestId: string;
  eventSeq: number;
};
```

Engine entry point:

```ts
runSimulation({ scenario, requests, fixes, seed }): SimulationResult
```

---

## 6. Phases

Each phase lists its goal, tasks, and "Done when" criteria. Stop at the end of each phase and update `docs/PROGRESS.md`.

---

### Phase 0: Project setup

Goal: an empty project with guardrails in place.

Tasks:

- Create Vite + React + TS app with pnpm. Enable TS strict mode.
- Add Vitest and one passing sample test.
- Add ESLint. Configure `no-restricted-imports` so files in `src/engine` and `src/scenarios` cannot import `react`, `react-dom`, or anything under `src/ui`.
- Create the folder structure from section 4 with placeholder `index.ts` files.
- Create `docs/PROGRESS.md` with a phase checklist.
- Add scripts: `dev`, `build`, `test`, `lint`, `typecheck`.

Done when:

- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass.
- Adding `import React from "react"` inside `src/engine` makes lint fail.

---

### Phase 1: Engine core

Goal: an engine that runs a generator handler, records events, and returns a SimulationResult. No database yet.

Tasks:

- Define core types from section 5 in `engine/core/types.ts`.
- Virtual clock: `now()`, `advance(ms)`.
- Seeded RNG (mulberry32 or similar). Store the seed in the result.
- Event recorder with incrementing `seq`.
- Effect runner: drives a generator handler, handles yielded effects, resumes with results, catches thrown errors.
- Start with simple effects: `delay(ms, label, line)` and `log(label, line)`.
- Safety: max steps per simulation (for example 10,000). Exceeding it ends the run with a clear engine error, never a freeze.
- `runSimulation` for a single request.

Done when:

- Tests show a handler that yields three effects produces three events in order with correct virtual times.
- Running the same input twice gives deep-equal results.
- A handler with an infinite loop of yields stops at the step limit with an error result.

---

### Phase 2: Simulated PostgreSQL

Goal: an in-memory database that behaves like Postgres for the cases this product needs.

Tasks:

- Table model: name, columns (name, type, nullable), primary key, unique constraints, indexes, rows.
- Structured query objects (no SQL parser): `select`, `insert`, `update`, `delete` with `where` (equality, `in`, simple comparisons), `orderBy`, `limit`, `offset`.
- SQL text generator: turns a query object into display SQL with `$1, $2` params, for example `SELECT * FROM products WHERE id = $1`.
- Query execution against rows.
- Cost model in `engine/db/cost.ts`:
  - Indexed equality lookup: rows scanned about `log2(n)`.
  - Otherwise: seq scan, rows scanned = table size.
  - `orderBy` on a non-indexed column adds a sort cost.
  - Duration = base + scanned _ perRowScan + returned _ perRowSent.
  - All constants in one config object.
- Each query emits a `SQL_QUERY` event with text, params, plan, rows scanned, rows returned.
- Constraints: `NOT NULL` violation, unique violation (Postgres error codes 23502, 23505), surfaced as typed DB errors handlers can catch.
- Effects: `db.select`, `db.insert`, `db.update`, `db.delete`.

Not in this phase: transactions, locks, pool. Those come in Phase 9.

Done when:

- Tests cover: select by indexed vs non-indexed column (plan and rowsScanned differ), insert with duplicate unique value fails with 23505, generated SQL text matches expected strings, same query twice gives same cost.

---

### Phase 3: HTTP request pipeline and first scenario

Goal: a request goes through a realistic Express style pipeline and produces a response.

Tasks:

- Request model and JSON body parsing. Invalid JSON becomes a 400 at the parsing stage.
- Router: method + path patterns with params (`/products/:id`). No match gives 404. Wrong method gives 405.
- Middleware chain runner. Middlewares are generators too and can end the request early.
- Validation middleware using a Zod schema from the scenario. Failure gives 400 with field level messages. Emit a snapshot of raw body and validated DTO.
- Auth middleware with a fake JWT: the token is a base64 JSON string like `{ "userId": 1, "role": "user", "exp": 9999999999 }`. No real crypto. Missing gives 401, expired gives 401, wrong role gives 403.
- Error handler: maps thrown errors and DB errors to status codes (23505 to 409, unknown to 500).
- Response builder: status, headers, JSON body. Emit a response event.
- Scenario registry and the first scenario, `product-api`:
  - Tables: `products (id, name, price, stock, category)` with ~1,000 seed rows, `users`.
  - Routes: `GET /products/:id`, `GET /products?category=&limit=`, `POST /products` (auth, admin only, validated).
  - Display code string with line numbers matching the handler effects.
  - Payload presets: Valid, Missing field, Invalid value, Not found, No token, Wrong role.

Done when:

- Scenario tests:
  - `GET /products/42` gives 200, one SQL event, no errors.
  - `GET /products/999999` gives 404 after a DB event.
  - `POST /products` without token gives 401 and no DB event.
  - `POST /products` with `price: -5` gives 400 and no DB event.
  - Duplicate product name (unique) gives 409.

---

### Phase 4: UI shell, request builder, trace list

Goal: a usable screen to run the first scenario. No animation yet.

Layout (desktop):

```
+-----------------------------------------------------------+
| Header: scenario picker                                   |
+-------------------+---------------------+-----------------+
| Request builder   | Trace (event list)  | Inspector       |
|                   |                     |                 |
+-------------------+---------------------+-----------------+
| Response viewer                                           |
+-----------------------------------------------------------+
```

Tasks:

- Scenario picker from the registry.
- Request builder: method select, path input, query params table, headers table, JSON body editor (textarea is fine), preset buttons, Run button.
- Show JSON parse errors inline before running.
- Call `runSimulation` and store the result in React state.
- Trace list: one row per event with stage, label, status icon (not color only), virtual time, duration.
- Clicking an event shows it in the inspector: label, status, snapshot JSON, SQL block if present.
- Response viewer: status, headers, body, total virtual time.
- Simple responsive layout that stacks on narrow screens.

Done when:

- A user can pick `product-api`, click each preset, run, and see the right status and trace.
- No engine logic exists in UI files (review imports and components).

---

### Phase 5: Player (step mode and animation mode)

Goal: the user chooses how to move through the trace: step by step or as an animation.

Design: one cursor over the event list. Play mode advances the cursor on a timer. Step mode advances it on click or key press. Pausing play leaves the user in step mode at the current event. The whole UI renders "state at cursor".

Tasks:

- `usePlayer(events)` hook: `cursor`, `mode` ("step" | "play"), `speed` (0.5x, 1x, 2x, 4x), `next`, `prev`, `first`, `last`, `play`, `pause`.
- Animation gap between events comes from virtual time difference scaled by speed, with a minimum gap so fast events stay visible.
- Trace list: events after the cursor are dimmed. The current event is highlighted and scrolled into view.
- Inspector follows the cursor.
- A simple pipeline strip above the trace (Parse, Router, Middleware, Validation, Auth, Controller, DB, Response) that lights up the current stage. A dot moves between stages in play mode.
- Event grouping: consecutive events with the same `groupKey` show as one collapsed row ("51x SELECT order_items ...") that can be expanded. Step granularity setting: "every event" or "by stage".
- Keyboard: Left/Right for prev/next, Space for play/pause, Home/End.
- `prefers-reduced-motion`: default to step mode and disable the moving dot.

Done when:

- Switching between modes mid-run keeps the cursor position.
- Changing speed during play works without restarting.
- Reduced motion setting opens in step mode.

---

### Phase 6: Code panel and data flow view

Goal: the user sees which line of code is running and how the data changes.

Tasks:

- Code panel showing the scenario display code with line numbers.
- Highlight the line from the event at the cursor. Show "not reached" styling for code after a failure.
- Data flow view in the inspector: tabs or a vertical list for Raw body, Parsed JSON, Validated DTO, SQL params, DB row, Response body. Each appears only once reached at the cursor.
- Light syntax highlighting is fine. No heavy editor library.

Done when:

- Stepping through `POST /products` highlights the matching lines in order.
- A validation failure shows Raw and Parsed, then the failure, and no DTO.

---

### Phase 7: Fix toggles, comparison, and the N+1 scenario (first vertical slice)

Goal: the first complete learning loop. This phase is the V1 milestone.

Tasks:

- Fix toggle system: a scenario declares `fixes` (id, label, description). Handlers read `ctx.fixes.<id>` to choose behavior. Display code can change per toggle (store two code variants or line ranges).
- New scenario `orders-n-plus-one`:
  - Tables: `users`, `orders` (50 per user), `order_items` (3 to 5 per order), with indexes on primary keys only.
  - Route `GET /users/:id/orders`.
  - Default: 1 query for orders, then 1 query per order for items (51 queries).
  - Fix toggle "Eager load items": one query for orders, one `WHERE order_id IN (...)` query (2 queries).
  - Events in the loop share a `groupKey` so they collapse.
- Comparison view: pin a run as "A", run again as "B". Show side by side: status, total time, number of SQL queries, rows scanned, rows returned. Show which toggles differ.
- Metrics module computing those numbers from events only.

Done when:

- Default run shows 51 queries. With the fix, 2 queries, and lower total time.
- Comparison shows both runs with correct numbers.
- Tests cover both variants.

At this point, stop and review the product with the user before continuing.

---

### Phase 8: Payload driven bug scenarios

Goal: scenarios where the custom payload decides the outcome.

Add one scenario at a time, each with presets, fix toggles, display code, and tests.

1. `missing-index`
   - `GET /orders?customerEmail=` on 100,000 rows.
   - Default: seq scan. Fix "Add index on customer_email": index scan.
   - Inspector shows the plan change and rows scanned.

2. `mass-assignment`
   - `PATCH /users/me` with body spread into the update.
   - Malicious preset sends `{ "name": "Vel", "role": "admin" }` and the user becomes admin in `worldAfter`.
   - Fix "Whitelist fields": `role` is stripped at validation, shown in the data flow view.

3. `sql-injection`
   - `GET /search?q=` with a handler that builds a raw SQL string.
   - Add a raw query effect that only supports the tiny subset needed: `WHERE name = '<value>'` and detection of a tautology like `' OR 1=1 --`. Document this limitation in `docs/ENGINE.md`. Do not build a general SQL parser.
   - Malicious preset returns every row and the trace shows the concatenated SQL.
   - Fix "Parameterized query": the input is treated as a literal and returns 0 rows.

4. `idempotency`
   - `POST /orders` sent twice (simulates a client retry after timeout). Uses a two request run with the same body.
   - Default: two orders created.
   - Fix "Idempotency-Key header": second request returns the stored first response, no insert.

5. `pagination`
   - `GET /products?limit=10000` returns huge response and high cost.
   - Fix "Enforce max limit": capped at 100 with a `next` cursor in the response.

Done when:

- All five scenarios pass their tests and work in the UI with presets and toggles.

---

### Phase 9: Concurrency, transactions, locks, pool, event loop

Goal: multiple requests in the same run, interleaved by virtual time.

Tasks:

- Scheduler: run several requests with different `startAt`. Always resume the generator whose next effect has the earliest virtual time. Ties broken by request id for determinism.
- Transactions: `db.begin`, `db.commit`, `db.rollback` effects. Read Committed isolation only. Uncommitted writes are not visible to other transactions.
- Row locks: `SELECT ... FOR UPDATE` effect. A conflicting request emits `LOCK_WAIT` and resumes when the lock is released.
- Connection pool: size from scenario config. Requests wait with `POOL_WAIT` events when all connections are in use.
- Event loop model: a single "JS thread" resource. CPU effects (`cpu(ms)`) hold it. Other requests cannot run JS while it is held. Async effects (DB, timers) release it.
- UI: trace shows one lane per request on a shared time axis. The player cursor moves through the merged event list. Lock and pool waits shown as bars.

Scenarios:

1. `race-condition`: two `POST /withdraw` with balance 100 and amount 50. Default: lost update (balance 50 instead of 0). Fix "Transaction + FOR UPDATE": second request waits, final balance 0.
2. `pool-exhaustion`: 20 concurrent requests, pool size 5, slow query. Shows waits. Fix "Pool size 20" and fix "Faster query (index)" to compare causes.
3. `blocking-event-loop`: one request does `cpu(300)` (sync password hash) while 10 light requests arrive. Default: all light requests wait. Fix "Async hash": hash moves to a thread pool effect, light requests run.

Done when:

- Same concurrent input gives identical results every run.
- All three scenarios pass tests and the lane view makes the interleaving visible in step mode.

---

### Phase 10: Learning layer

Goal: turn scenarios into lessons.

Tasks:

- `learn.md` per scenario: problem, what to look for in the trace, why the fix works, trade-offs of the fix, interview questions. Render it in a side panel with a safe Markdown renderer (no raw HTML).
- Predict before run: optional question per scenario ("How many SQL queries will this run?", "What status code?"). Show the prediction next to the actual result.
- Challenges: a goal with a checker function over the SimulationResult, for example "Get this endpoint under 20 SQL queries" or "Final balance must be 0 with two concurrent withdrawals". Show pass or fail.
- Scenario difficulty labels: Beginner, Intermediate, Advanced.

Done when:

- Every scenario has learn content, at least one prediction, and at least one challenge.

---

### Phase 11: Persistence, accessibility, docs, polish

Tasks:

- `localStorage` wrapper with try/catch and a fallback when storage is unavailable.
- Save: last scenario, custom request bodies per scenario, pinned comparison runs, player preferences.
- Export and import a run as JSON (scenario id, requests, toggles, seed) so it can be replayed exactly.
- Accessibility pass: keyboard reachable controls, focus styles, labels, status not by color only, reduced motion.
- Friendly error states: invalid JSON, engine step limit, unknown scenario, storage unavailable. Never show a raw stack trace as the main message.
- Docs: `README.md`, `docs/ENGINE.md` (event model, effects, cost model, limitations), `docs/ADDING_A_SCENARIO.md`.

Done when:

- Reloading the page restores the last session.
- An exported run, imported later, produces an identical result.
- A new scenario can be added by following `ADDING_A_SCENARIO.md` without touching UI code.

---

## 7. Later (do not build until asked)

- Infrastructure zoom level: a small canvas (Client, Load balancer, API instances, Redis, Postgres) as the outermost view, where each API box can be opened into the current trace view.
- Redis cache scenarios with real cache state and stale read on update.
- Workload mode: hundreds of requests with a discrete event queue, P50/P95/P99, utilization vs latency curve. Run in a Web Worker.
- MongoDB as a contrast database (embedding vs joins), behind the same DB interface.
- Go `net/http` and Python FastAPI runtimes to compare concurrency models on the same scenarios.
- OpenTelemetry trace import to view traces from a real backend.
- A small real backend (Node or Go) for sharing runs by link.

## 8. Never in scope

- Executing user-written code
- Real network calls to external services
- User accounts, social features, comments
- AI generated architectures or chatbots
- Claims that modeled numbers are real benchmarks

---

## 9. Definition of V1 success

At the end of Phase 7, this must work smoothly:

1. Open the N+1 scenario.
2. Send `GET /users/1/orders`.
3. Step through the trace and see the 51 queries, with the code line highlighted.
4. Switch to play mode and watch it.
5. Turn on "Eager load items".
6. Run again and see 2 queries.
7. Compare both runs side by side.
8. Understand why the fix works.

If this loop feels good, the rest of the product grows around it.

---

## 10. Original blueprint coverage

The first blueprint was a system design visualizer. Tracewell changed direction to focus on the inside of the backend server. This table records where each original idea went.

Included in phases:

| Original idea                                          | Where it lives now                                      |
| ------------------------------------------------------ | ------------------------------------------------------- |
| Request builder (method, URL, params, headers, body)   | Phase 4                                                 |
| Payload affects simulation, validation, transformation | Phases 3, 6, 8                                          |
| Simulation engine separate from React                  | Principles, Phase 0 lint rule, Phase 1                  |
| Event model driving all UI                             | Phase 1, Phase 5                                        |
| Conditional routing and decisions                      | Handlers with branches (Phase 3), shown in trace        |
| Node behaviors (router, auth, validation, DB)          | Phase 3 middleware and handlers                         |
| Error system and failure visualization                 | Phases 3, 4, 6                                          |
| Deterministic simulation with seed                     | Principles, Phase 1                                     |
| Latency model from work done                           | Phase 2 cost model                                      |
| Request trace, timeline, animation                     | Phases 4, 5                                             |
| Step mode and animation mode                           | Phase 5                                                 |
| Node inspector                                         | Phases 4, 6 (inspector follows events instead of nodes) |
| Metrics (latency, DB queries, rows)                    | Phase 7                                                 |
| Comparison of before and after                         | Phase 7 (compares runs with fix toggles)                |
| Learning content, trade-offs, interview questions      | Phase 10                                                |
| Difficulty levels                                      | Phase 10                                                |
| Browser storage persistence                            | Phase 11                                                |
| Replay with seed, export as JSON                       | Phase 11                                                |
| Accessibility, reduced motion                          | Phases 5, 11                                            |
| Security boundary (no user code)                       | Instructions, section 8                                 |
| Testing strategy and fixed scenarios                   | Every phase                                             |
| Documentation                                          | Phase 11                                                |
| Cycle protection                                       | Phase 1 step limit                                      |

Moved to Later (section 7):

| Original idea                                  | Note                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| Architecture canvas with nodes and connections | Becomes the outer infrastructure zoom level       |
| Redis cache scenarios                          | Later, with real cache state                      |
| Workload simulation, P95/P99, throughput       | Later, in a Web Worker                            |
| Bottleneck detection                           | Later, with workload mode                         |
| Queues, workers, background jobs               | Later                                             |
| Replicas, partitioning, distributed failures   | Later                                             |
| Real benchmark mode                            | Later, via a real backend or OpenTelemetry import |

Dropped on purpose:

| Original idea                                                    | Reason                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Four modes (Learn, Explore, Simulate, Experiment)                | Merged into one loop with scenarios, fixes, and challenges       |
| Architecture playground (add, connect, move nodes)               | Users change behavior with fix toggles, not by building diagrams |
| Architecture validation (broken edges, unreachable nodes)        | Not needed without a user-built graph                            |
| Generic infra node types (load balancer, email, payment service) | Outside the backend-inside-the-server focus                      |
| Scenario builder for custom workloads                            | Revisit after workload mode exists                               |

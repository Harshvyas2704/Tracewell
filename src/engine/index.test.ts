import { describe, expect, it } from "vitest";
import {
  createRequest,
  db,
  delay,
  ENGINE_CONFIG,
  isDbError,
  log,
  runSimulation,
  scenarioCode,
  type Effect,
  type Handler,
  type Row,
  type Scenario,
  type SimulationResult,
  type TableDef,
} from "./index";

const request = (startAt = 0) => createRequest({ method: "GET", path: "/", startAt });

const scenario = (handler: Handler, world?: TableDef[]): Scenario => ({
  id: "test",
  name: "Test",
  world,
  routes: [{ method: "GET", path: "/", handler }],
});

const run = (handler: Handler, seed?: number, startAt?: number) =>
  runSimulation({ scenario: scenario(handler), requests: [request(startAt)], seed });

const types = (result: SimulationResult) => result.events.map((e) => e.type);
const inController = (result: SimulationResult) =>
  result.events.filter((e) => e.stage === "controller");

describe("runSimulation", () => {
  it("records three effects as three events in order with virtual times", () => {
    const result = run(function* () {
      yield delay(5, "parse", 1);
      yield log("checkpoint", 2);
      yield delay(10, "work", 3);
    });

    expect(types(result)).toEqual([
      "REQUEST_RECEIVED",
      "BODY_PARSE_SKIPPED",
      "ROUTE_MATCHED",
      "DELAY",
      "LOG",
      "DELAY",
      "RESPONSE_SENT",
    ]);
    expect(result.events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);

    const events = inController(result);
    const start = events[0]?.startTime ?? 0;
    expect(events).toEqual([
      { seq: 3, requestId: "r1", stage: "controller", type: "DELAY", label: "parse", startTime: start, duration: 5, status: "ok", line: 1 },
      { seq: 4, requestId: "r1", stage: "controller", type: "LOG", label: "checkpoint", startTime: start + 5, duration: 0, status: "ok", line: 2 },
      { seq: 5, requestId: "r1", stage: "controller", type: "DELAY", label: "work", startTime: start + 5, duration: 10, status: "ok", line: 3 },
    ]);
    expect(result.events.at(-1)?.startTime).toBe(start + 15);
    expect(result.errors).toEqual([]);
    expect(result.responses.r1).toEqual({ status: 200, headers: {}, body: null });
  });

  it("starts the clock at the request's startAt", () => {
    const handler: Handler = function* () {
      yield delay(5, "work");
    };
    const late = run(handler, undefined, 100);
    expect(late.events[0]?.startTime).toBe(100);
    expect(late.metrics.totalTime).toBe(run(handler).metrics.totalTime);
  });

  it("returns the response the handler returns", () => {
    const result = run(function* (ctx) {
      yield log("found");
      return ctx.res.status(201).json({ id: 1 });
    });
    expect(result.responses.r1).toEqual({
      status: 201,
      headers: { "content-type": "application/json" },
      body: { id: 1 },
    });
  });

  it("gives deep-equal results for the same input", () => {
    const handler: Handler = function* (ctx) {
      for (let i = 0; i < 5; i++) {
        yield delay(ctx.rng.int(1, 50), `step ${i}`, i);
      }
      return ctx.res.json({ roll: ctx.rng.next() });
    };
    const first = run(handler, 123);
    const second = run(handler, 123);
    expect(second).toEqual(first);
    expect(first.seed).toBe(123);
    expect(JSON.stringify(run(handler, 124))).not.toBe(JSON.stringify(first));
  });

  it("stops an infinite loop of yields at the step limit", () => {
    const result = run(function* () {
      while (true) {
        yield delay(1, "spin");
      }
    });

    expect(result.events).toHaveLength(ENGINE_CONFIG.maxSteps + 1);
    const last = result.events.at(-1);
    expect(last).toMatchObject({ stage: "error", type: "ENGINE_STEP_LIMIT", status: "fail" });
    expect(result.errors).toEqual([
      {
        status: 500,
        code: "ENGINE_STEP_LIMIT",
        message: expect.stringContaining(String(ENGINE_CONFIG.maxSteps)),
        requestId: "r1",
        eventSeq: last?.seq,
      },
    ]);
    expect(result.responses.r1?.status).toBe(500);
  });

  it("turns a thrown error into a 500 without leaking the message", () => {
    const result = run(function* () {
      yield delay(3, "before");
      throw new Error("boom");
    });

    expect(types(result).slice(-3)).toEqual(["DELAY", "ERROR_HANDLED", "RESPONSE_SENT"]);
    const handled = result.events.at(-2);
    expect(handled).toMatchObject({ stage: "error", label: "boom", status: "fail" });
    expect(result.errors).toEqual([
      { status: 500, code: "INTERNAL_ERROR", message: "boom", requestId: "r1", eventSeq: handled?.seq },
    ]);
    expect(result.responses.r1).toMatchObject({
      status: 500,
      body: { error: "Internal Server Error" },
    });
  });

  it("ends the run when a handler yields something that is not a valid effect", () => {
    const unknown = run(function* () {
      yield { kind: "teleport" } as unknown as Effect;
    });
    expect(unknown.errors[0]?.code).toBe("ENGINE_INVALID_EFFECT");

    const negative = run(function* () {
      yield delay(-5, "back in time");
    });
    expect(negative.errors[0]?.code).toBe("ENGINE_INVALID_EFFECT");
    expect(negative.events.at(-1)?.type).toBe("ENGINE_INVALID_EFFECT");
  });

  it("rejects runs that do not have exactly one request", () => {
    const handler: Handler = function* () {};
    expect(() => runSimulation({ scenario: scenario(handler), requests: [] })).toThrow();
    expect(() =>
      runSimulation({
        scenario: scenario(handler),
        requests: [request(), createRequest({ id: "r2", method: "GET", path: "/" })],
      }),
    ).toThrow();
  });
});

describe("database effects", () => {
  const users: TableDef = {
    name: "users",
    columns: [
      { name: "id", type: "integer", nullable: false },
      { name: "email", type: "text", nullable: false },
      { name: "role", type: "text", nullable: false },
    ],
    primaryKey: "id",
    unique: ["email"],
    rows: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      email: `user${i + 1}@example.com`,
      role: "user",
    })),
  };

  const runDb = (handler: Handler) =>
    runSimulation({ scenario: scenario(handler, [users]), requests: [request()] });
  const queries = (result: SimulationResult) =>
    result.events.filter((e) => e.type === "SQL_QUERY");

  it("resumes the handler with rows and records a SQL_QUERY event", () => {
    const result = runDb(function* (ctx) {
      const rows: Row[] = yield db.select("users", { where: { id: 7 } }, { line: 4 });
      const all: Row[] = yield db.select("users", { where: { role: "user" } }, { line: 5 });
      return ctx.res.json({ user: rows[0], total: all.length });
    });

    expect(result.responses.r1?.body).toEqual({
      user: { id: 7, email: "user7@example.com", role: "user" },
      total: 100,
    });
    const [first, second] = queries(result);
    expect(queries(result)).toHaveLength(2);
    expect(first).toEqual({
      seq: 3,
      requestId: "r1",
      stage: "db",
      type: "SQL_QUERY",
      label: "SELECT users",
      startTime: 0.12,
      duration: 1.05,
      status: "ok",
      line: 4,
      snapshot: { rows: [{ id: 7, email: "user7@example.com", role: "user" }] },
      sql: {
        text: "SELECT * FROM users WHERE id = $1",
        params: [7],
        plan: "Index Scan",
        index: "id",
        rowsScanned: 8,
        rowsReturned: 1,
        rowsSorted: 0,
        rowsWritten: 0,
        cost: { baseMs: 1, scanMs: 0.04, sentMs: 0.01, writeMs: 0, sortMs: 0 },
      },
    });
    expect((second?.snapshot as { rows: Row[] }).rows).toHaveLength(ENGINE_CONFIG.snapshotRowLimit);
    expect(second).toMatchObject({
      startTime: 1.17,
      duration: 2.5,
      sql: { plan: "Seq Scan", rowsScanned: 100, rowsReturned: 100 },
    });
  });

  it("counts queries and rows in the metrics, from events only", () => {
    const result = runDb(function* () {
      yield db.select("users", { where: { id: 7 } });
      yield db.select("users", { where: { role: "user" } });
      yield db.select("users", { where: { email: "nobody@example.com" } });
    });
    expect(result.metrics).toMatchObject({
      sqlQueries: 3,
      rowsScanned: 8 + 100 + 7,
      rowsReturned: 1 + 100 + 0,
    });
    expect(run(function* () {}).metrics).toMatchObject({ sqlQueries: 0, rowsScanned: 0, rowsReturned: 0 });
  });

  it("passes fixes to the handler", () => {
    const handler: Handler = function* (ctx) {
      return ctx.res.json({ fast: ctx.fixes.fast === true });
    };
    const off = runSimulation({ scenario: scenario(handler), requests: [request()] });
    const on = runSimulation({ scenario: scenario(handler), requests: [request()], fixes: { fast: true } });
    expect([off.responses.r1?.body, on.responses.r1?.body]).toEqual([{ fast: false }, { fast: true }]);
  });

  it("resolves world, routes, lines and code for the fixes that are on", () => {
    const table = (indexed: boolean): TableDef => ({ ...users, indexes: indexed ? ["role"] : [] });
    const byRole: Handler = function* (ctx) {
      const rows: Row[] = yield db.select("users", { where: { role: "user" } });
      return ctx.res.json({ count: rows.length });
    };
    const perFixes: Scenario = {
      id: "per-fixes",
      name: "Per fixes",
      world: (fixes) => [table(fixes.index === true)],
      routes: (fixes) => [{ method: "GET", path: "/", handler: byRole, line: fixes.index ? 12 : 10 }],
      lines: (fixes) => ({ bodyParser: fixes.index ? 5 : 3 }),
      code: (fixes) => (fixes.index ? "// with index" : "// without"),
    };
    const go = (fixes: Record<string, boolean>) =>
      runSimulation({ scenario: perFixes, requests: [request()], fixes });
    const off = go({});
    const on = go({ index: true });

    expect(queries(off)[0]?.sql?.plan).toBe("Seq Scan");
    expect(queries(on)[0]?.sql).toMatchObject({ plan: "Index Scan", index: "role" });
    expect(on.responses.r1).toEqual(off.responses.r1);
    const line = (result: SimulationResult, type: string) =>
      result.events.find((e) => e.type === type)?.line;
    expect([line(off, "BODY_PARSE_SKIPPED"), line(off, "ROUTE_MATCHED")]).toEqual([3, 10]);
    expect([line(on, "BODY_PARSE_SKIPPED"), line(on, "ROUTE_MATCHED")]).toEqual([5, 12]);
    expect([scenarioCode(perFixes, {}), scenarioCode(perFixes, { index: true })]).toEqual([
      "// without",
      "// with index",
    ]);
  });

  it("copies a groupKey from the effect to its event", () => {
    const result = runDb(function* () {
      for (const id of [1, 2, 3]) {
        yield db.select("users", { where: { id } }, { groupKey: "users-by-id" });
      }
      yield db.select("users", { where: { id: 4 } });
    });
    expect(queries(result).map((e) => e.groupKey)).toEqual([
      "users-by-id",
      "users-by-id",
      "users-by-id",
      undefined,
    ]);
  });

  describe("which event an error response points at", () => {
    const duplicate = () => db.insert("users", { email: "user1@example.com", role: "user" }, { line: 2 });

    it("marks a caught query error as handled and blames the response the handler chose", () => {
      const result = runDb(function* (ctx) {
        try {
          yield duplicate();
        } catch (err) {
          if (isDbError(err) && err.code === "23505") {
            return ctx.res.status(422).json({ error: "Email already used" });
          }
          throw err;
        }
      });

      expect(result.responses.r1?.status).toBe(422);
      expect(types(result).slice(-2)).toEqual(["SQL_QUERY", "RESPONSE_SENT"]);
      const [insert] = queries(result);
      expect(insert).toMatchObject({
        status: "fail",
        handled: true,
        label: "INSERT users (caught)",
        snapshot: { error: { code: "23505" } },
        sql: { text: "INSERT INTO users (email, role) VALUES ($1, $2) RETURNING *" },
      });
      const sent = result.events.at(-1);
      expect(result.errors).toEqual([
        {
          status: 422,
          code: "UNPROCESSABLE_ENTITY",
          message: "Email already used",
          requestId: "r1",
          eventSeq: sent?.seq,
        },
      ]);
      expect(result.worldAfter.tables.users).toHaveLength(100);
    });

    it("reports no error when the handler recovers and answers 200", () => {
      const result = runDb(function* (ctx) {
        try {
          yield duplicate();
        } catch {
          const rows: Row[] = yield db.select("users", { where: { email: "user1@example.com" } });
          return ctx.res.json(rows[0]);
        }
      });
      expect(result.responses.r1?.status).toBe(200);
      expect(result.errors).toEqual([]);
      expect(queries(result).map((e) => [e.status, e.handled])).toEqual([
        ["fail", true],
        ["ok", undefined],
      ]);
    });

    it("points an uncaught query error at the failed query, not at the error handler", () => {
      const result = runDb(function* () {
        yield duplicate();
      });
      const [insert] = queries(result);
      expect(types(result).slice(-3)).toEqual(["SQL_QUERY", "ERROR_HANDLED", "RESPONSE_SENT"]);
      expect(insert?.handled).toBeUndefined();
      expect(insert?.label).toBe("INSERT users");
      expect(result.errors).toEqual([
        {
          status: 409,
          code: "23505",
          message: expect.stringContaining("duplicate key"),
          requestId: "r1",
          eventSeq: insert?.seq,
        },
      ]);
    });

    it("treats an error the handler catches and throws again as not handled", () => {
      const result = runDb(function* () {
        try {
          yield duplicate();
        } catch (err) {
          yield log("cleaning up");
          throw err;
        }
      });
      const [insert] = queries(result);
      // The same error reached the error handler in the end, so the query is
      // the cause and is not marked as handled.
      expect(result.responses.r1?.status).toBe(409);
      expect(result.errors[0]).toMatchObject({ code: "23505", eventSeq: insert?.seq });
      expect(insert).toMatchObject({ status: "fail", label: "INSERT users" });
      expect(insert?.handled).toBeUndefined();
    });

    it("points at the error handler when the handler throws its own error", () => {
      const result = runDb(function* () {
        try {
          yield duplicate();
        } catch {
          throw new Error("could not save user");
        }
      });
      const handled = result.events.find((e) => e.type === "ERROR_HANDLED");
      expect(queries(result)[0]?.handled).toBe(true);
      expect(result.errors).toEqual([
        {
          status: 500,
          code: "INTERNAL_ERROR",
          message: "could not save user",
          requestId: "r1",
          eventSeq: handled?.seq,
        },
      ]);
    });

    it("derives the code from the status when the handler returns an error on purpose", () => {
      const result = runDb(function* (ctx) {
        const rows: Row[] = yield db.select("users", { where: { id: 999 } });
        if (rows.length === 0) return ctx.res.status(404).json({ error: "User not found" });
      });
      expect(result.errors).toEqual([
        {
          status: 404,
          code: "NOT_FOUND",
          message: "User not found",
          requestId: "r1",
          eventSeq: result.events.at(-1)?.seq,
        },
      ]);
    });
  });

  it("maps an uncaught unique violation to 409 and other database errors to 500", () => {
    const duplicate = runDb(function* () {
      yield db.insert("users", { email: "user1@example.com", role: "user" });
    });
    expect(types(duplicate).slice(-3)).toEqual(["SQL_QUERY", "ERROR_HANDLED", "RESPONSE_SENT"]);
    expect(duplicate.responses.r1).toMatchObject({
      status: 409,
      body: {
        error: "Resource already exists",
        detail: "Key (email)=(user1@example.com) already exists.",
      },
    });
    expect(duplicate.errors[0]).toMatchObject({ status: 409, code: "23505" });

    const missing = runDb(function* () {
      yield db.insert("users", { email: "new@example.com" });
    });
    expect(missing.responses.r1).toMatchObject({
      status: 500,
      body: { error: "Internal Server Error" },
    });
    expect(missing.errors[0]).toMatchObject({
      status: 500,
      code: "23502",
      message: expect.stringContaining("not-null"),
    });
  });

  it("returns the final rows in worldAfter and starts every run from the seed data", () => {
    const handler: Handler = function* (ctx) {
      const [created]: Row[] = yield db.insert("users", { email: "new@example.com", role: "admin" });
      yield db.update("users", { set: { role: "banned" }, where: { id: 1 } });
      yield db.delete("users", { where: { id: 2 } });
      return ctx.res.status(201).json(created);
    };
    const first = runDb(handler);
    const second = runDb(handler);

    expect(first.responses.r1?.body).toEqual({ id: 101, email: "new@example.com", role: "admin" });
    const after = first.worldAfter.tables.users ?? [];
    expect(after).toHaveLength(100);
    expect(after[0]).toMatchObject({ id: 1, role: "banned" });
    expect(after.some((u) => u.id === 2)).toBe(false);
    expect(after.at(-1)).toMatchObject({ id: 101 });
    expect(second).toEqual(first);
    expect(users.rows).toHaveLength(100);
  });
});

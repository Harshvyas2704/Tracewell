import { describe, expect, it } from "vitest";
import {
  db,
  delay,
  ENGINE_CONFIG,
  isDbError,
  log,
  runSimulation,
  type Effect,
  type Handler,
  type Row,
  type Scenario,
  type SimRequest,
  type TableDef,
} from "./index";

const request = (overrides: Partial<SimRequest> = {}): SimRequest => ({
  id: "r1",
  method: "GET",
  path: "/",
  query: {},
  headers: {},
  body: null,
  startAt: 0,
  ...overrides,
});

const scenario = (handler: Handler): Scenario => ({
  id: "test",
  name: "Test",
  handler,
});

const run = (handler: Handler, seed?: number, req = request()) =>
  runSimulation({ scenario: scenario(handler), requests: [req], seed });

describe("runSimulation", () => {
  it("records three effects as three events in order with virtual times", () => {
    const result = run(function* () {
      yield delay(5, "parse", 1);
      yield log("checkpoint", 2);
      yield delay(10, "work", 3);
    });

    expect(result.events).toEqual([
      { seq: 0, requestId: "r1", stage: "controller", type: "DELAY", label: "parse", startTime: 0, duration: 5, status: "ok", line: 1 },
      { seq: 1, requestId: "r1", stage: "controller", type: "LOG", label: "checkpoint", startTime: 5, duration: 0, status: "ok", line: 2 },
      { seq: 2, requestId: "r1", stage: "controller", type: "DELAY", label: "work", startTime: 5, duration: 10, status: "ok", line: 3 },
    ]);
    expect(result.metrics.totalTime).toBe(15);
    expect(result.errors).toEqual([]);
    expect(result.responses.r1).toEqual({ status: 200, headers: {}, body: null });
  });

  it("starts the clock at the request's startAt", () => {
    const result = run(
      function* () {
        yield delay(5, "work");
      },
      undefined,
      request({ startAt: 100 }),
    );
    expect(result.events[0]?.startTime).toBe(100);
    expect(result.metrics.totalTime).toBe(5);
  });

  it("returns the response the handler returns", () => {
    const result = run(function* () {
      yield log("found");
      return { status: 201, headers: { "content-type": "application/json" }, body: { id: 1 } };
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
      return { status: 200, headers: {}, body: { roll: ctx.rng.next() } };
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

  it("turns a thrown error into an error event and a 500", () => {
    const result = run(function* () {
      yield delay(3, "before");
      throw new Error("boom");
    });

    expect(result.events).toHaveLength(2);
    expect(result.events[1]).toMatchObject({
      stage: "error",
      type: "HANDLER_ERROR",
      label: "boom",
      startTime: 3,
      status: "fail",
    });
    expect(result.errors).toEqual([
      { status: 500, code: "HANDLER_ERROR", message: "boom", requestId: "r1", eventSeq: 1 },
    ]);
    expect(result.responses.r1?.status).toBe(500);
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
    expect(negative.events).toHaveLength(1);
  });

  it("rejects runs that do not have exactly one request", () => {
    const handler: Handler = function* () {};
    expect(() => runSimulation({ scenario: scenario(handler), requests: [] })).toThrow();
    expect(() =>
      runSimulation({
        scenario: scenario(handler),
        requests: [request(), request({ id: "r2" })],
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
    runSimulation({
      scenario: { id: "db", name: "DB", world: [users], handler },
      requests: [request()],
    });

  it("resumes the handler with rows and records a SQL_QUERY event", () => {
    const result = runDb(function* () {
      const rows: Row[] = yield db.select("users", { where: { id: 7 } }, { line: 4 });
      const all: Row[] = yield db.select("users", { where: { role: "user" } }, { line: 5 });
      return { status: 200, headers: {}, body: { user: rows[0], total: all.length } };
    });

    expect(result.responses.r1?.body).toEqual({
      user: { id: 7, email: "user7@example.com", role: "user" },
      total: 100,
    });
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toEqual({
      seq: 0,
      requestId: "r1",
      stage: "db",
      type: "SQL_QUERY",
      label: "SELECT users",
      startTime: 0,
      duration: 1.05,
      status: "ok",
      line: 4,
      sql: {
        text: "SELECT * FROM users WHERE id = $1",
        params: [7],
        plan: "Index Scan",
        index: "id",
        rowsScanned: 8,
        rowsReturned: 1,
        rowsSorted: 0,
        rowsWritten: 0,
      },
    });
    expect(result.events[1]).toMatchObject({
      startTime: 1.05,
      duration: 2.5,
      sql: { plan: "Seq Scan", rowsScanned: 100, rowsReturned: 100 },
    });
    expect(result.metrics.totalTime).toBe(3.55);
  });

  it("lets a handler catch a unique violation", () => {
    const result = runDb(function* () {
      try {
        yield db.insert("users", { email: "user1@example.com", role: "user" }, { line: 2 });
      } catch (err) {
        if (isDbError(err) && err.code === "23505") {
          return { status: 409, headers: {}, body: { error: "Email already used" } };
        }
        throw err;
      }
    });

    expect(result.responses.r1?.status).toBe(409);
    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: "SQL_QUERY",
      status: "fail",
      snapshot: { error: { code: "23505" } },
      sql: { text: "INSERT INTO users (email, role) VALUES ($1, $2) RETURNING *" },
    });
    expect(result.worldAfter.tables.users).toHaveLength(100);
  });

  it("ends the run with the Postgres code when a database error is not caught", () => {
    const result = runDb(function* () {
      yield db.insert("users", { email: "new@example.com" });
    });

    expect(result.responses.r1?.status).toBe(500);
    expect(result.errors).toEqual([
      {
        status: 500,
        code: "23502",
        message: expect.stringContaining("not-null"),
        requestId: "r1",
        eventSeq: 1,
      },
    ]);
    expect(result.events.map((e) => e.type)).toEqual(["SQL_QUERY", "UNHANDLED_DB_ERROR"]);
  });

  it("returns the final rows in worldAfter and starts every run from the seed data", () => {
    const handler: Handler = function* () {
      const [created]: Row[] = yield db.insert("users", { email: "new@example.com", role: "admin" });
      yield db.update("users", { set: { role: "banned" }, where: { id: 1 } });
      yield db.delete("users", { where: { id: 2 } });
      return { status: 201, headers: {}, body: created };
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

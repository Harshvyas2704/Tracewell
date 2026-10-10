import { describe, expect, it } from "vitest";
import {
  createRequest,
  runSimulation,
  scenarioCode,
  type Fixes,
  type SimulationResult,
} from "../../engine";
import { getScenario } from "../index";
import { lines } from "./code";
import { ordersNPlusOne } from "./index";
import { itemCount, ORDERS_PER_USER, USER_COUNT } from "./world";

const run = (path: string, fixes: Fixes = {}): SimulationResult =>
  runSimulation({
    scenario: ordersNPlusOne,
    requests: [createRequest({ method: "GET", path })],
    fixes,
  });

const queries = (result: SimulationResult) => result.events.filter((e) => e.sql);
type Order = { id: number; user_id: number; items: { order_id: number }[] };
const orders = (result: SimulationResult) =>
  (result.responses.r1?.body as { orders: Order[] }).orders;

describe("orders-n-plus-one", () => {
  it("is in the registry and declares its fix", () => {
    expect(getScenario("orders-n-plus-one")).toBe(ordersNPlusOne);
    expect(ordersNPlusOne.fixes?.map((fix) => fix.id)).toEqual(["eagerLoad", "indexOrderItems"]);
  });

  it("has 50 orders per user and 3 to 5 items per order", () => {
    const { tables } = run("/users/1/orders").worldAfter;
    expect(tables.users).toHaveLength(USER_COUNT);
    expect(tables.orders).toHaveLength(USER_COUNT * ORDERS_PER_USER);
    const perOrder = new Map<unknown, number>();
    for (const item of tables.order_items ?? []) {
      perOrder.set(item.order_id, (perOrder.get(item.order_id) ?? 0) + 1);
    }
    expect(perOrder.size).toBe(USER_COUNT * ORDERS_PER_USER);
    expect(new Set(perOrder.values())).toEqual(new Set([3, 4, 5]));
  });

  describe("default (N+1)", () => {
    const result = run("/users/1/orders");

    it("runs 51 queries: one for the orders, then one per order", () => {
      expect(result.responses.r1?.status).toBe(200);
      expect(result.metrics.sqlQueries).toBe(51);
      const [first, ...rest] = queries(result);
      expect(first?.sql?.text).toBe("SELECT * FROM orders WHERE user_id = $1 ORDER BY id");
      expect(first?.sql).toMatchObject({ plan: "Seq Scan", rowsReturned: ORDERS_PER_USER });
      expect(rest).toHaveLength(ORDERS_PER_USER);
      expect(new Set(rest.map((e) => e.sql?.text))).toEqual(
        new Set(["SELECT * FROM order_items WHERE order_id = $1"]),
      );
      expect(rest.map((e) => e.sql?.params[0])).toEqual(orders(result).map((o) => o.id));
    });

    it("gives the loop queries one groupKey so they collapse in the trace", () => {
      const [first, ...rest] = queries(result);
      expect(first?.groupKey).toBeUndefined();
      expect(new Set(rest.map((e) => e.groupKey))).toEqual(new Set(["order-items"]));
    });

    it("returns every order of the user with its items", () => {
      const list = orders(result);
      expect(list).toHaveLength(ORDERS_PER_USER);
      for (const order of list) {
        expect(order.user_id).toBe(1);
        expect(order.items).toHaveLength(itemCount(order.id));
        expect(order.items.every((item) => item.order_id === order.id)).toBe(true);
      }
    });
  });

  describe('with the "Eager load items" fix', () => {
    const before = run("/users/1/orders");
    const after = run("/users/1/orders", { eagerLoad: true });

    it("runs 2 queries", () => {
      expect(after.metrics.sqlQueries).toBe(2);
      const [, items] = queries(after);
      expect(items?.sql?.text).toMatch(/^SELECT \* FROM order_items WHERE order_id IN \(\$1, \$2, .*\$50\)$/);
      expect(items?.sql?.params).toHaveLength(ORDERS_PER_USER);
      expect(items?.groupKey).toBeUndefined();
    });

    it("returns exactly the same response", () => {
      expect(after.responses.r1).toEqual(before.responses.r1);
    });

    it("takes less time and scans far fewer rows", () => {
      expect(after.metrics.totalTime).toBeLessThan(before.metrics.totalTime / 10);
      expect(after.metrics.rowsScanned).toBeLessThan(before.metrics.rowsScanned / 10);
      expect(after.metrics.rowsReturned).toBe(before.metrics.rowsReturned);
    });
  });

  it("runs a single query for a user with no orders, with or without the fix", () => {
    for (const fixes of [{}, { eagerLoad: true }] as Fixes[]) {
      const result = run("/users/999/orders", fixes);
      expect(result.responses.r1).toMatchObject({ status: 200, body: { userId: 999, orders: [] } });
      expect(result.metrics.sqlQueries).toBe(1);
    }
  });

  it("answers 400 for an id that is not a number, without touching the database", () => {
    const result = run("/users/abc/orders");
    expect(result.responses.r1?.status).toBe(400);
    expect(result.metrics.sqlQueries).toBe(0);
  });

  describe("the two fixes together", () => {
    const path = "/users/1/orders";
    const runs = {
      nPlusOne: run(path),
      nPlusOneIndexed: run(path, { indexOrderItems: true }),
      eager: run(path, { eagerLoad: true }),
      eagerIndexed: run(path, { eagerLoad: true, indexOrderItems: true }),
    };
    const itemQueries = (result: SimulationResult) =>
      queries(result).filter((e) => e.sql?.text.includes("order_items"));

    it("returns exactly the same response in all four combinations", () => {
      for (const result of Object.values(runs)) {
        expect(result.responses.r1).toEqual(runs.nPlusOne.responses.r1);
      }
    });

    it("keeps the same seed rows whether or not the index exists", () => {
      expect(runs.nPlusOneIndexed.worldAfter).toEqual(runs.nPlusOne.worldAfter);
    });

    it("runs 51 queries for N+1 and 2 for eager load, whatever the index setting", () => {
      expect(Object.values(runs).map((r) => r.metrics.sqlQueries)).toEqual([51, 51, 2, 2]);
    });

    it("uses Index Scans for the item queries only when the index exists", () => {
      const plans = (result: SimulationResult) => new Set(itemQueries(result).map((e) => e.sql?.plan));
      expect(itemQueries(runs.nPlusOneIndexed)).toHaveLength(ORDERS_PER_USER);
      expect(plans(runs.nPlusOneIndexed)).toEqual(new Set(["Index Scan"]));
      expect(itemQueries(runs.nPlusOneIndexed)[0]?.sql?.index).toBe("order_id");
      expect(plans(runs.nPlusOne)).toEqual(new Set(["Seq Scan"]));
      expect(plans(runs.eagerIndexed)).toEqual(new Set(["Index Scan"]));
      expect(plans(runs.eager)).toEqual(new Set(["Seq Scan"]));
      // The orders query filters on user_id, which neither fix indexes.
      for (const result of Object.values(runs)) {
        expect(queries(result)[0]?.sql?.plan).toBe("Seq Scan");
      }
    });

    it("makes each fix faster on its own, and both together fastest", () => {
      const time = (result: SimulationResult) => result.metrics.totalTime;
      expect(time(runs.nPlusOneIndexed)).toBeLessThan(time(runs.nPlusOne));
      expect(time(runs.eager)).toBeLessThan(time(runs.nPlusOne));
      // Eager load is also faster with the index (it is not just equal).
      expect(time(runs.eagerIndexed)).toBeLessThan(time(runs.eager));
    });

    it("leaves N+1 at least 3x slower than eager load even with the index", () => {
      // This is the point of the lesson: with a good index, the cost that is
      // left is the round trips.
      const ratio = runs.nPlusOneIndexed.metrics.totalTime / runs.eagerIndexed.metrics.totalTime;
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("spends an indexed item query almost entirely on the round trip", () => {
      const cost = itemQueries(runs.nPlusOneIndexed)[0]?.sql?.cost;
      expect(cost?.baseMs).toBe(1);
      expect((cost?.scanMs ?? 1) + (cost?.sentMs ?? 1)).toBeLessThan(0.2);
      expect(itemQueries(runs.nPlusOne)[0]?.sql?.cost.scanMs).toBe(20);
    });

    it("records the totals written in docs/PROGRESS.md", () => {
      const totals = Object.fromEntries(
        Object.entries(runs).map(([name, r]) => [name, [r.metrics.totalTime, r.metrics.rowsScanned]]),
      );
      expect(totals).toEqual({
        nPlusOne: [1059.083, 201000],
        nPlusOneIndexed: [63.078, 1799],
        eager: [30.083, 5000],
        eagerIndexed: [14.078, 1799],
      });
    });
  });

  it("shows the migration only when the index fix is on, and still points at the right lines", () => {
    const all: Fixes[] = [
      {},
      { indexOrderItems: true },
      { eagerLoad: true },
      { eagerLoad: true, indexOrderItems: true },
    ];
    const sources = all.map((fixes) => scenarioCode(ordersNPlusOne, fixes) ?? "");
    expect(new Set(sources).size).toBe(4);

    for (const [i, fixes] of all.entries()) {
      const source = sources[i] ?? "";
      const codeLines = source.split("\n");
      expect(source.startsWith("// Migration\n// CREATE INDEX order_items_order_id_idx")).toBe(
        fixes.indexOrderItems === true,
      );
      expect(source.includes("WHERE order_id IN (")).toBe(fixes.eagerLoad === true);

      const result = run("/users/1/orders", fixes);
      const text = (type: string, nth = 0) =>
        codeLines[(result.events.filter((e) => e.type === type)[nth]?.line ?? 0) - 1];
      expect(text("BODY_PARSE_SKIPPED")).toContain("app.use(express.json())");
      expect(text("ROUTE_MATCHED")).toContain('app.get("/users/:id/orders"');
      expect(text("SQL_QUERY", 0)).toContain("FROM orders WHERE user_id");
      expect(text("SQL_QUERY", 1)).toContain("FROM order_items WHERE order_id");
      expect(text("RESPONSE_SENT")).toContain("res.json({ userId, orders });");
    }
    // The migration comment moves every line below it.
    expect(lines({ indexOrderItems: true }).route).toBe(lines({}).route + 3);
  });
});

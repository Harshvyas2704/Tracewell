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
    expect(ordersNPlusOne.fixes?.map((fix) => fix.id)).toEqual(["eagerLoad"]);
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

  it("shows different code for each variant and points events at its lines", () => {
    const plain = scenarioCode(ordersNPlusOne, {}) ?? "";
    const fixed = scenarioCode(ordersNPlusOne, { eagerLoad: true }) ?? "";
    expect(plain).toContain("for (const order of orders) {\n    const { rows: items } = await db.query(");
    expect(fixed).toContain("WHERE order_id IN (");
    expect(plain).not.toBe(fixed);
    // The pipeline's own lines do not move between variants.
    expect(lines({}).route).toBe(lines({ eagerLoad: true }).route);
    expect(lines({}).bodyParser).toBe(lines({ eagerLoad: true }).bodyParser);

    for (const [fixes, source] of [[{}, plain], [{ eagerLoad: true }, fixed]] as const) {
      const codeLines = source.split("\n");
      const result = run("/users/1/orders", fixes);
      const text = (type: string, nth = 0) =>
        codeLines[(result.events.filter((e) => e.type === type)[nth]?.line ?? 0) - 1];
      expect(text("ROUTE_MATCHED")).toContain('app.get("/users/:id/orders"');
      expect(text("SQL_QUERY", 0)).toContain("FROM orders WHERE user_id");
      expect(text("SQL_QUERY", 1)).toContain("FROM order_items WHERE order_id");
      expect(text("RESPONSE_SENT")).toContain("res.json({ userId, orders });");
    }
  });
});

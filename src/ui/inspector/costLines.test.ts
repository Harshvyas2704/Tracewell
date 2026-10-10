import { describe, expect, it } from "vitest";
import { COST_CONFIG, createRequest, runSimulation, type Fixes, type SqlInfo } from "../../engine";
import { getScenario } from "../../scenarios";
import { costLines } from "./costLines";

const sqlOf = (scenarioId: string, path: string, fixes: Fixes = {}, nth = 0): SqlInfo => {
  const scenario = getScenario(scenarioId)!;
  const result = runSimulation({
    scenario,
    requests: [createRequest({ method: "GET", path })],
    fixes,
  });
  const sql = result.events.filter((e) => e.sql)[nth]?.sql;
  if (!sql) throw new Error("no query");
  return sql;
};

describe("cost lines", () => {
  it("shows the round trip, the scan and the rows returned, and hides zero parts", () => {
    const itemQuery = sqlOf("orders-n-plus-one", "/users/1/orders", {}, 1);
    expect(costLines(itemQuery)).toEqual([
      { label: "Round trip", ms: 1 },
      { label: "Rows scanned", formula: "4,000 x 0.005", ms: 20 },
      { label: "Rows returned", formula: "4 x 0.010", ms: 0.04 },
    ]);
  });

  it("uses the engine's amounts, which add up to the duration", () => {
    const scenario = getScenario("orders-n-plus-one")!;
    const result = runSimulation({
      scenario,
      requests: [createRequest({ method: "GET", path: "/users/1/orders" })],
      fixes: { indexOrderItems: true },
    });
    for (const event of result.events.filter((e) => e.sql)) {
      const total = costLines(event.sql!).reduce((sum, line) => sum + line.ms, 0);
      expect(Math.abs(total - event.duration)).toBeLessThan(0.001);
    }
  });

  it("shows a sort line only when rows were sorted without an index", () => {
    const sorted: SqlInfo = {
      ...sqlOf("product-api", "/products?category=audio"),
      rowsSorted: 200,
      cost: { baseMs: 1, scanMs: 5, sentMs: 0.2, writeMs: 0, sortMs: 3.058 },
    };
    expect(costLines(sorted).at(-1)).toEqual({
      label: "Sort",
      formula: "200 x log2(200) x 0.002",
      ms: 3.058,
    });
    expect(costLines(sqlOf("product-api", "/products/42")).map((l) => l.label)).not.toContain("Sort");
  });

  it("takes the per-row numbers from COST_CONFIG", () => {
    const line = costLines(sqlOf("product-api", "/products?category=audio"))[1];
    expect(line?.formula).toBe(`1,000 x ${COST_CONFIG.perRowScanMs.toFixed(3)}`);
  });
});

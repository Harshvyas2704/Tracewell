import { describe, expect, it } from "vitest";
import { createRequest, runSimulation, type Fixes } from "../../engine";
import { getScenario } from "../../scenarios";
import { formatMs } from "../format";
import { describeChange, differingFixes, enabledFixes, summarize, type RunRecord } from "./compare";

const scenario = getScenario("orders-n-plus-one")!;
const available = scenario.fixes ?? [];

const record = (id: number, fixes: Fixes): RunRecord => {
  const request = createRequest({ method: "GET", path: "/users/1/orders" });
  return {
    id,
    scenarioId: scenario.id,
    request,
    fixes,
    result: runSimulation({ scenario, requests: [request], fixes }),
  };
};

describe("comparing runs", () => {
  const a = record(1, {});
  const b = record(2, { eagerLoad: true });

  it("summarizes a run from its response and metrics", () => {
    expect(summarize(a)).toEqual({
      request: "GET /users/1/orders",
      status: 200,
      totalTime: a.result.metrics.totalTime,
      sqlQueries: 51,
      rowsScanned: a.result.metrics.rowsScanned,
      rowsReturned: a.result.metrics.rowsReturned,
    });
    expect(summarize(b).sqlQueries).toBe(2);
    expect(summarize(b).totalTime).toBeLessThan(summarize(a).totalTime);
  });

  it("includes the query string in the request label", () => {
    const request = createRequest({ method: "GET", path: "/users/1/orders?page=2" });
    expect(summarize({ ...a, request }).request).toBe("GET /users/1/orders?page=2");
  });

  it("lists the fixes that differ between two runs", () => {
    expect(differingFixes(available, a.fixes, b.fixes)).toEqual([
      { fix: available[0], a: false, b: true },
    ]);
    expect(differingFixes(available, b.fixes, b.fixes)).toEqual([]);
    // A fix that was never touched counts as off.
    expect(differingFixes(available, {}, { eagerLoad: false })).toEqual([]);
  });

  it("names the fixes that are on", () => {
    expect(enabledFixes(available, a.fixes)).toEqual([]);
    expect(enabledFixes(available, b.fixes)).toEqual(["Eager load items"]);
  });

  it("describes how B changed from A", () => {
    const plain = (n: number) => String(n);
    expect(describeChange(51, 2, plain)).toBe("−49 (−96%)");
    expect(describeChange(2, 51, plain)).toBe("+49 (+2450%)");
    expect(describeChange(7, 7, plain)).toBe("same");
    expect(describeChange(0, 3, plain)).toBe("+3");
    expect(describeChange(10, 2.5, formatMs)).toBe("−7.5 ms (−75%)");
  });
});

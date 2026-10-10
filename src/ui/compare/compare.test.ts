import { describe, expect, it } from "vitest";
import { createRequest, runSimulation, type Fixes } from "../../engine";
import { getScenario } from "../../scenarios";
import { formatMs } from "../format";
import {
  addRun,
  comparedRuns,
  describeChange,
  differingFixes,
  emptyCompare,
  enabledFixes,
  pinA,
  summarize,
  unpinA,
  type CompareState,
  type RunRecord,
} from "./compare";

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

  it("lists the right differing fixes for any two of the four combinations", () => {
    const combos: Record<string, Fixes> = {
      none: {},
      index: { indexOrderItems: true },
      eager: { eagerLoad: true },
      both: { eagerLoad: true, indexOrderItems: true },
    };
    const differing = (a: string, b: string) =>
      differingFixes(available, combos[a] ?? {}, combos[b] ?? {}).map(
        (d) => `${d.fix.id}:${d.a ? "on" : "off"}>${d.b ? "on" : "off"}`,
      );
    expect(differing("none", "index")).toEqual(["indexOrderItems:off>on"]);
    expect(differing("none", "eager")).toEqual(["eagerLoad:off>on"]);
    expect(differing("none", "both")).toEqual(["eagerLoad:off>on", "indexOrderItems:off>on"]);
    expect(differing("index", "eager")).toEqual(["eagerLoad:off>on", "indexOrderItems:on>off"]);
    expect(differing("index", "both")).toEqual(["eagerLoad:off>on"]);
    expect(differing("eager", "both")).toEqual(["indexOrderItems:off>on"]);
    expect(differing("both", "none")).toEqual(["eagerLoad:on>off", "indexOrderItems:on>off"]);
    expect(enabledFixes(available, combos.both ?? {})).toEqual([
      "Eager load items",
      "Index order_items.order_id",
    ]);
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

describe("keeping runs to compare", () => {
  // Only the ids matter here.
  const run = (id: number) => ({ id }) as RunRecord;
  const ids = (state: CompareState) => [state.a?.id ?? null, state.b?.id ?? null, state.pinned];
  const after = (...steps: ((state: CompareState) => CompareState)[]) =>
    steps.reduce((state, step) => step(state), emptyCompare);
  const add = (id: number) => (state: CompareState) => addRun(state, run(id));

  it("shows nothing until there are two runs", () => {
    expect(comparedRuns(emptyCompare)).toBeNull();
    expect(comparedRuns(after(add(1)))).toBeNull();
    expect(comparedRuns(after(add(1), add(2)))).toMatchObject({ a: { id: 1 }, b: { id: 2 } });
  });

  it("keeps the previous run as A automatically", () => {
    expect(ids(after(add(1)))).toEqual([null, 1, false]);
    expect(ids(after(add(1), add(2)))).toEqual([1, 2, false]);
    expect(ids(after(add(1), add(2), add(3)))).toEqual([2, 3, false]);
  });

  it("locks A when pinned, so new runs replace only B", () => {
    const pinned = after(add(1), add(2), pinA);
    expect(ids(pinned)).toEqual([1, 2, true]);
    expect(ids(addRun(addRun(pinned, run(3)), run(4)))).toEqual([1, 4, true]);
  });

  it("returns to automatic mode when unpinned", () => {
    const state = after(add(1), add(2), pinA, add(3), unpinA);
    expect(ids(state)).toEqual([1, 3, false]);
    expect(ids(addRun(state, run(4)))).toEqual([3, 4, false]);
  });

  it("pins a single run as A, and compares once a second run arrives", () => {
    const pinned = after(add(1), pinA);
    expect(ids(pinned)).toEqual([1, 1, true]);
    expect(comparedRuns(pinned)).toBeNull();
    expect(ids(addRun(pinned, run(2)))).toEqual([1, 2, true]);
    // Unpinning before a second run goes back to a single run.
    expect(ids(unpinA(pinned))).toEqual([null, 1, false]);
  });

  it("does nothing when asked to pin with no runs", () => {
    expect(pinA(emptyCompare)).toEqual(emptyCompare);
    expect(unpinA(emptyCompare)).toEqual(emptyCompare);
  });
});

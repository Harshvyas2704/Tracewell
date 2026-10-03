import { describe, expect, it } from "vitest";
import type { SimEvent, Stage } from "../../engine";
import { buildRows } from "../trace/rows";
import { nextIndex, PLAYBACK, prevIndex, stepDelay } from "./logic";
import { stripItems } from "./pipeline";

const event = (seq: number, stage: Stage, extra: Partial<SimEvent> = {}): SimEvent => ({
  seq,
  requestId: "r1",
  stage,
  type: "TEST",
  label: `${stage} ${seq}`,
  startTime: seq,
  duration: 1,
  status: "ok",
  ...extra,
});

// network, body parse, router, db, db, db, response
const events = [
  event(0, "network"),
  event(1, "middleware", { type: "BODY_PARSED" }),
  event(2, "router"),
  event(3, "db", { groupKey: "items" }),
  event(4, "db", { groupKey: "items" }),
  event(5, "db", { groupKey: "items", status: "fail" }),
  event(6, "response"),
];

describe("stepping", () => {
  it("moves one event at a time and stops at both ends", () => {
    expect(nextIndex(events, 0, "event")).toBe(1);
    expect(nextIndex(events, 6, "event")).toBe(6);
    expect(prevIndex(events, 3, "event")).toBe(2);
    expect(prevIndex(events, 0, "event")).toBe(0);
    expect(nextIndex([], 0, "event")).toBe(0);
  });

  it("stops on the last event of each stage when stepping by stage", () => {
    const stops = [0];
    while (stops.at(-1) !== 6) stops.push(nextIndex(events, stops.at(-1) ?? 0, "stage"));
    expect(stops).toEqual([0, 1, 2, 5, 6]);

    expect(prevIndex(events, 6, "stage")).toBe(5);
    expect(prevIndex(events, 5, "stage")).toBe(2);
    // From the middle of a stage, back goes to the end of the stage before it.
    expect(prevIndex(events, 4, "stage")).toBe(2);
    expect(nextIndex(events, 3, "stage")).toBe(5);
  });
});

describe("stepDelay", () => {
  const at = (startTime: number) => event(0, "db", { startTime });

  it("scales the virtual gap, within a minimum and a maximum", () => {
    expect(stepDelay(at(0), at(2), 1)).toBe(2 * PLAYBACK.realMsPerVirtualMs);
    expect(stepDelay(at(0), at(0.01), 1)).toBe(PLAYBACK.minGapMs);
    expect(stepDelay(at(0), at(500), 1)).toBe(PLAYBACK.maxGapMs);
  });

  it("moves quickly between events of the same group", () => {
    const grouped = (startTime: number) => event(0, "db", { startTime, groupKey: "items" });
    expect(stepDelay(grouped(0), grouped(50), 1)).toBe(PLAYBACK.groupGapMs);
    expect(stepDelay(grouped(0), grouped(50), 2)).toBe(PLAYBACK.groupGapMs / 2);
    // Leaving the group is a normal gap again.
    expect(stepDelay(grouped(0), at(50), 1)).toBe(PLAYBACK.maxGapMs);
  });

  it("gets shorter as speed goes up", () => {
    expect(stepDelay(at(0), at(2), 4)).toBe(stepDelay(at(0), at(2), 1) / 4);
    expect(stepDelay(at(0), at(2), 0.5)).toBe(stepDelay(at(0), at(2), 1) * 2);
  });
});

describe("pipeline strip", () => {
  const state = (cursor: number) =>
    Object.fromEntries(stripItems(events, cursor).map((item) => [item.id, item]));

  it("puts the request and body parsing in the Parse box", () => {
    expect(state(0).parse).toMatchObject({ current: true, visited: true });
    expect(state(1).parse?.current).toBe(true);
    expect(state(1).middleware?.used).toBe(false);
  });

  it("tracks what is used, visited, failed and current at the cursor", () => {
    const early = state(2);
    expect(early.router).toMatchObject({ current: true, visited: true, failed: false });
    expect(early.db).toMatchObject({ used: true, visited: false, failed: false });
    expect(early.auth).toMatchObject({ used: false, visited: false });

    const late = state(6);
    expect(late.db).toMatchObject({ visited: true, failed: true, current: false });
    expect(late.response?.current).toBe(true);
  });

  it("shows the error handler box only when the run reaches it", () => {
    expect(stripItems(events, 0).map((item) => item.id)).not.toContain("error");
    const withError = [...events.slice(0, 6), event(6, "error"), event(7, "response")];
    expect(stripItems(withError, 0).map((item) => item.id)).toEqual([
      "parse", "router", "middleware", "auth", "validation", "controller", "db", "error", "response",
    ]);
  });
});

describe("trace rows", () => {
  it("collapses consecutive events that share a groupKey", () => {
    const rows = buildRows(events);
    expect(rows.map((row) => row.kind)).toEqual(["event", "event", "event", "group", "event"]);
    expect(rows[3]).toMatchObject({
      kind: "group",
      start: 3,
      end: 5,
      label: "3× db 3",
      status: "fail",
      startTime: 3,
      duration: 3,
    });
    expect(rows[4]).toMatchObject({ kind: "event", index: 6 });
  });

  it("does not group a single event or events that are not next to each other", () => {
    const apart = [
      event(0, "db", { groupKey: "a" }),
      event(1, "controller"),
      event(2, "db", { groupKey: "a" }),
      event(3, "db", { groupKey: "b" }),
    ];
    expect(buildRows(apart).map((row) => row.kind)).toEqual(["event", "event", "event", "event"]);
    expect(buildRows([])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { createClock } from "./clock";
import { createRecorder } from "./recorder";
import { createRng } from "./rng";

describe("clock", () => {
  it("starts at the given time and only moves when advanced", () => {
    const clock = createClock(5);
    expect(clock.now()).toBe(5);
    clock.advance(10);
    clock.advance(0);
    expect(clock.now()).toBe(15);
  });

  it("rejects negative and non-finite advances", () => {
    const clock = createClock();
    expect(() => clock.advance(-1)).toThrow();
    expect(() => clock.advance(Number.NaN)).toThrow();
    expect(clock.now()).toBe(0);
  });
});

describe("rng", () => {
  const take = (seed: number, n: number) => {
    const rng = createRng(seed);
    return Array.from({ length: n }, () => rng.next());
  };

  it("gives the same sequence for the same seed", () => {
    expect(take(42, 20)).toEqual(take(42, 20));
  });

  it("gives different sequences for different seeds", () => {
    expect(take(1, 5)).not.toEqual(take(2, 5));
  });

  it("stays in range", () => {
    for (const value of take(7, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    const rng = createRng(7);
    const ints = Array.from({ length: 1000 }, () => rng.int(3, 6));
    expect(Math.min(...ints)).toBe(3);
    expect(Math.max(...ints)).toBe(6);
    expect(ints.every(Number.isInteger)).toBe(true);
  });
});

describe("recorder", () => {
  it("assigns incrementing seq numbers in record order", () => {
    const recorder = createRecorder();
    const base = {
      requestId: "r1",
      stage: "controller",
      type: "LOG",
      startTime: 0,
      duration: 0,
      status: "ok",
    } as const;
    const first = recorder.record({ ...base, label: "a" });
    const second = recorder.record({ ...base, label: "b" });
    expect([first.seq, second.seq]).toEqual([0, 1]);
    expect(recorder.events.map((e) => e.label)).toEqual(["a", "b"]);
  });
});

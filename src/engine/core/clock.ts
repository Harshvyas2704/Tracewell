export type Clock = {
  now(): number;
  advance(ms: number): void;
};

// Virtual time in milliseconds. It only moves when the engine advances it.
export function createClock(startAt = 0): Clock {
  let time = startAt;
  return {
    now: () => time,
    advance(ms) {
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error(`Clock cannot advance by ${ms} ms`);
      }
      // Keep times on a 0.001 ms grid so sums of fractional costs stay clean.
      time = Math.round((time + ms) * 1000) / 1000;
    },
  };
}

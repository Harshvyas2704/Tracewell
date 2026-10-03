import type { SimEvent } from "../../engine";

export type PlayerMode = "step" | "play";
export type Granularity = "event" | "stage";

export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

// How virtual time maps to animation time at 1x. The gap between two events
// follows their virtual time difference, kept inside a range so quick steps
// stay visible and slow ones do not stall the animation.
export const PLAYBACK = {
  realMsPerVirtualMs: 600,
  minGapMs: 450,
  maxGapMs: 1800,
  // Between two events of the same group (for example the queries of an N+1),
  // so fifty repeats do not take fifty full pauses.
  groupGapMs: 140,
};

export function stepDelay(from: SimEvent, to: SimEvent, speed: number): number {
  if (from.groupKey !== undefined && from.groupKey === to.groupKey) {
    return PLAYBACK.groupGapMs / speed;
  }
  const scaled = (to.startTime - from.startTime) * PLAYBACK.realMsPerVirtualMs;
  const gap = Math.min(PLAYBACK.maxGapMs, Math.max(PLAYBACK.minGapMs, scaled));
  return gap / speed;
}

// When stepping by stage, the cursor stops on the last event of each run of
// same-stage events, so the stage's work is complete at every stop.
function isStop(events: SimEvent[], index: number, granularity: Granularity): boolean {
  if (granularity === "event") return true;
  return events[index]?.stage !== events[index + 1]?.stage;
}

export function nextIndex(events: SimEvent[], cursor: number, granularity: Granularity): number {
  const last = events.length - 1;
  for (let i = cursor + 1; i <= last; i++) {
    if (isStop(events, i, granularity)) return i;
  }
  return Math.max(0, Math.min(cursor, last));
}

export function prevIndex(events: SimEvent[], cursor: number, granularity: Granularity): number {
  for (let i = Math.min(cursor, events.length) - 1; i >= 0; i--) {
    if (isStop(events, i, granularity)) return i;
  }
  return 0;
}

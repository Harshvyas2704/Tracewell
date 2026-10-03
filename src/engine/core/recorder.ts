import type { SimEvent } from "./types";

export type Recorder = {
  record(event: Omit<SimEvent, "seq">): SimEvent;
  events: SimEvent[];
};

export function createRecorder(): Recorder {
  const events: SimEvent[] = [];
  return {
    events,
    record(event) {
      const recorded = { seq: events.length, ...event };
      events.push(recorded);
      return recorded;
    },
  };
}

import type { Metrics, SimEvent } from "../core/types";

// Metrics are derived from events only.
export function computeMetrics(events: SimEvent[]): Metrics {
  if (events.length === 0) return { totalTime: 0 };
  const start = Math.min(...events.map((e) => e.startTime));
  const end = Math.max(...events.map((e) => e.startTime + e.duration));
  return { totalTime: end - start };
}

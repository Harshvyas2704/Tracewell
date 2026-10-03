import { roundMs } from "../core/clock";
import type { Metrics, SimEvent } from "../core/types";

// Metrics are derived from events only.
export function computeMetrics(events: SimEvent[]): Metrics {
  const metrics: Metrics = { totalTime: 0, sqlQueries: 0, rowsScanned: 0, rowsReturned: 0 };
  if (events.length === 0) return metrics;

  let start = Infinity;
  let end = -Infinity;
  for (const event of events) {
    start = Math.min(start, event.startTime);
    end = Math.max(end, event.startTime + event.duration);
    if (event.sql) {
      metrics.sqlQueries += 1;
      metrics.rowsScanned += event.sql.rowsScanned;
      metrics.rowsReturned += event.sql.rowsReturned;
    }
  }
  metrics.totalTime = roundMs(end - start);
  return metrics;
}

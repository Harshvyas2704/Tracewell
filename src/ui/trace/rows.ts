import type { EventStatus, SimEvent } from "../../engine";

// A trace row is one event, or a run of consecutive events that share a
// groupKey (for example the 50 item queries of an N+1).
export type TraceRow =
  | { kind: "event"; index: number; event: SimEvent }
  | {
      kind: "group";
      start: number; // index of the first event
      end: number; // index of the last event
      events: SimEvent[];
      label: string; // e.g. "50× SELECT order_items"
      status: EventStatus;
      startTime: number;
      duration: number; // from the first event's start to the last event's end
    };

export function buildRows(events: SimEvent[]): TraceRow[] {
  const rows: TraceRow[] = [];
  let i = 0;
  while (i < events.length) {
    const first = events[i] as SimEvent;
    let end = i;
    if (first.groupKey !== undefined) {
      while (events[end + 1]?.groupKey === first.groupKey) end += 1;
    }
    if (end === i) {
      rows.push({ kind: "event", index: i, event: first });
    } else {
      const members = events.slice(i, end + 1);
      const last = members[members.length - 1] as SimEvent;
      rows.push({
        kind: "group",
        start: i,
        end,
        events: members,
        label: `${members.length}× ${first.label}`,
        status: members.some((e) => e.status === "fail") ? "fail" : first.status,
        startTime: first.startTime,
        duration: last.startTime + last.duration - first.startTime,
      });
    }
    i = end + 1;
  }
  return rows;
}

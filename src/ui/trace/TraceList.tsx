import { useEffect, useMemo, useRef, useState } from "react";
import type { EventStatus, SimEvent } from "../../engine";
import { formatMs } from "../format";
import { buildRows } from "./rows";
import { StatusIcon } from "./StatusIcon";

type Props = {
  events: SimEvent[] | undefined;
  cursor: number;
  onSeek(index: number): void;
};

type RowProps = {
  status: EventStatus;
  stage: string;
  label: React.ReactNode;
  startTime: number;
  duration: number;
  current: boolean;
  future: boolean; // after the cursor, so not reached yet
  onClick(): void;
};

function Row({ status, stage, label, startTime, duration, current, future, onClick }: RowProps) {
  return (
    <button
      type="button"
      className="trace-row"
      data-status={status}
      data-future={future}
      aria-current={current}
      onClick={onClick}
    >
      <StatusIcon status={status} />
      <span className="stage" data-stage={stage}>
        {stage}
      </span>
      <span className="trace-label">
        {label}
        {future && <span className="visually-hidden"> (not reached yet)</span>}
      </span>
      <span className="trace-time" title="Virtual time when this step started">
        @ {formatMs(startTime)}
      </span>
      <span className="trace-duration" title="Virtual time this step took">
        {formatMs(duration)}
      </span>
    </button>
  );
}

export function TraceList({ events, cursor, onSeek }: Props) {
  const rows = useMemo(() => buildRows(events ?? []), [events]);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const panel = useRef<HTMLElement>(null);

  // Keep the current row visible by scrolling the trace panel only, never the page.
  useEffect(() => {
    const box = panel.current;
    const row = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !row) return;
    const boxRect = box.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < boxRect.top) box.scrollTop -= boxRect.top - rowRect.top + 8;
    else if (rowRect.bottom > boxRect.bottom) box.scrollTop += rowRect.bottom - boxRect.bottom + 8;
  }, [cursor, events, expanded]);

  const toggle = (start: number) => {
    const next = new Set(expanded);
    if (!next.delete(start)) next.add(start);
    setExpanded(next);
  };

  const eventRow = (event: SimEvent, index: number) => (
    <Row
      status={event.status}
      stage={event.stage}
      label={event.label}
      startTime={event.startTime}
      duration={event.duration}
      current={index === cursor}
      future={index > cursor}
      onClick={() => onSeek(index)}
    />
  );

  return (
    <section className="panel trace" aria-labelledby="trace-heading" ref={panel}>
      <h2 id="trace-heading">
        Trace {events && <span className="muted count">{events.length} events</span>}
      </h2>
      {!events ? (
        <p className="muted empty">Run a request to see what the server does with it.</p>
      ) : (
        <ol className="trace-list" data-player-keys>
          {rows.map((row) => {
            if (row.kind === "event") {
              return <li key={row.index}>{eventRow(row.event, row.index)}</li>;
            }
            const open = expanded.has(row.start);
            const inside = cursor >= row.start && cursor <= row.end;
            return (
              <li key={row.start} className="trace-group">
                <div className="trace-group-head">
                  <button
                    type="button"
                    className="icon-button group-toggle"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${row.events.length} grouped events`}
                    onClick={() => toggle(row.start)}
                  >
                    <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                  </button>
                  <Row
                    status={row.status}
                    stage={row.events[0]?.stage ?? ""}
                    label={
                      <>
                        {row.label}
                        {inside && !open && (
                          <span className="group-progress">
                            {" "}
                            {cursor - row.start + 1} of {row.events.length}
                          </span>
                        )}
                      </>
                    }
                    startTime={row.startTime}
                    duration={row.duration}
                    current={inside && !open}
                    future={cursor < row.start}
                    onClick={() => onSeek(row.end)}
                  />
                </div>
                {open && (
                  <ol className="trace-list trace-children">
                    {row.events.map((event, i) => (
                      <li key={event.seq}>{eventRow(event, row.start + i)}</li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

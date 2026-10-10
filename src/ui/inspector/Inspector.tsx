import { useState } from "react";
import type { SimEvent, SqlInfo } from "../../engine";
import { formatJson, formatMs, formatMsFixed } from "../format";
import { StatusIcon, statusText } from "../trace";
import { costLines } from "./costLines";
import { DataFlow } from "./DataFlow";

type Props = {
  events: SimEvent[];
  cursor: number;
};

type View = "step" | "flow";

const VIEWS: { id: View; label: string }[] = [
  { id: "step", label: "This step" },
  { id: "flow", label: "Data flow" },
];

export function Inspector({ events, cursor }: Props) {
  const [view, setView] = useState<View>("step");
  const event = events[cursor];

  return (
    <section className="panel inspector" aria-labelledby="inspector-heading">
      <div className="panel-head">
        <h2 id="inspector-heading">Inspector</h2>
        <div className="switch" role="group" aria-label="Inspector view">
          {VIEWS.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!event ? (
        <p className="muted empty">Run a request, then select an event in the trace.</p>
      ) : view === "flow" ? (
        <DataFlow events={events} cursor={cursor} />
      ) : (
        <StepDetails event={event} />
      )}
    </section>
  );
}

function StepDetails({ event }: { event: SimEvent }) {
  return (
    <>
      <p className="inspector-label">{event.label}</p>
      <dl className="facts">
        <dt>Status</dt>
        <dd>
          <StatusIcon status={event.status} decorative /> {statusText(event.status)}
        </dd>
        <dt>Stage</dt>
        <dd>{event.stage}</dd>
        <dt>Event</dt>
        <dd>
          <code>{event.type}</code>
        </dd>
        <dt>Started</dt>
        <dd>{formatMs(event.startTime)}</dd>
        <dt>Duration</dt>
        <dd>{formatMs(event.duration)}</dd>
        {event.line !== undefined && (
          <>
            <dt>Code line</dt>
            <dd>{event.line}</dd>
          </>
        )}
      </dl>

      {event.sql && <SqlBlock sql={event.sql} duration={event.duration} />}

      {event.snapshot !== undefined && (
        <>
          <h3>Data at this step</h3>
          <pre className="code-block" tabIndex={0}>
            {formatJson(event.snapshot)}
          </pre>
        </>
      )}
    </>
  );
}

function SqlBlock({ sql, duration }: { sql: SqlInfo; duration: number }) {
  return (
    <>
      <h3>SQL</h3>
      <pre className="code-block sql" tabIndex={0}>
        {sql.text}
      </pre>
      <dl className="facts">
        <dt>Params</dt>
        <dd>
          <code>{JSON.stringify(sql.params)}</code>
        </dd>
        <dt>Plan</dt>
        <dd>
          {sql.plan}
          {sql.index && ` using index on ${sql.index}`}
        </dd>
        <dt>Rows scanned</dt>
        <dd>{sql.rowsScanned.toLocaleString("en-US")}</dd>
        <dt>Rows returned</dt>
        <dd>{sql.rowsReturned.toLocaleString("en-US")}</dd>
        {sql.rowsSorted > 0 && (
          <>
            <dt>Rows sorted</dt>
            <dd>{sql.rowsSorted.toLocaleString("en-US")}</dd>
          </>
        )}
        {sql.rowsWritten > 0 && (
          <>
            <dt>Rows written</dt>
            <dd>{sql.rowsWritten.toLocaleString("en-US")}</dd>
          </>
        )}
      </dl>

      <h3>Where the time goes</h3>
      <table className="cost-table">
        <tbody>
          {costLines(sql).map((line) => (
            <tr key={line.label}>
              <th scope="row">{line.label}</th>
              <td className="cost-formula">{line.formula && `${line.formula} =`}</td>
              <td className="cost-ms">{formatMsFixed(line.ms)}</td>
            </tr>
          ))}
          <tr className="cost-total">
            <th scope="row">Total</th>
            <td />
            <td className="cost-ms">{formatMsFixed(duration)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

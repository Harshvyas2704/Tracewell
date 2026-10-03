import { statusLabel, type Fix } from "../../engine";
import { formatMs } from "../format";
import {
  describeChange,
  differingFixes,
  enabledFixes,
  summarize,
  type RunRecord,
  type RunSummary,
} from "./compare";

type Props = {
  available: Fix[]; // the scenario's fixes
  current: RunRecord | null;
  pinned: RunRecord | null;
  onPin(): void; // pin the current run as A
  onUnpin(): void;
};

const count = (n: number) => n.toLocaleString("en-US");

type Metric = {
  label: string;
  key: "totalTime" | "sqlQueries" | "rowsScanned" | "rowsReturned";
  format(n: number): string;
};

const METRICS: Metric[] = [
  { label: "Total time", key: "totalTime", format: formatMs },
  { label: "SQL queries", key: "sqlQueries", format: count },
  { label: "Rows scanned", key: "rowsScanned", format: count },
  { label: "Rows returned", key: "rowsReturned", format: count },
];

export function CompareView({ available, current, pinned, onPin, onUnpin }: Props) {
  // B is the run on screen, once it is a different run from the pinned one.
  const runB = pinned && current && current.id !== pinned.id ? current : null;
  const a = pinned ? summarize(pinned) : null;
  const b = runB ? summarize(runB) : null;

  return (
    <section className="panel compare" aria-labelledby="compare-heading">
      <div className="panel-head">
        <h2 id="compare-heading">Compare runs</h2>
        <div className="compare-actions">
          {current && current.id !== pinned?.id && (
            <button type="button" className="chip" onClick={onPin}>
              {pinned ? "Pin this run as A instead" : "Pin this run as A"}
            </button>
          )}
          {pinned && (
            <button type="button" className="chip" onClick={onUnpin}>
              Unpin A
            </button>
          )}
        </div>
      </div>

      {!a || !pinned ? (
        <p className="muted empty">
          {current
            ? "Pin this run as A, change something (for example a fix), and run again to compare."
            : "Run a request, then pin it to compare it with your next run."}
        </p>
      ) : (
        <>
          <table className="compare-table">
            <thead>
              <tr>
                <td />
                <th scope="col">A (pinned)</th>
                <th scope="col">B (latest run)</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              <Line label="Request" a={a.request} b={b?.request} />
              <Line
                label="Status"
                a={statusLabel(a.status)}
                b={b && statusLabel(b.status)}
                change={b ? (a.status === b.status ? "same" : "different") : undefined}
              />
              {METRICS.map((metric) => (
                <MetricLine key={metric.key} metric={metric} a={a} b={b} />
              ))}
              <Line
                label="Fixes on"
                a={enabledFixes(available, pinned.fixes).join(", ") || "none"}
                b={runB ? enabledFixes(available, runB.fixes).join(", ") || "none" : undefined}
              />
            </tbody>
          </table>

          {runB ? (
            <FixSummary available={available} a={pinned} b={runB} />
          ) : (
            <p className="muted compare-note">
              Run A is pinned. Change something (for example a fix) and run again to get run B.
            </p>
          )}
        </>
      )}
    </section>
  );
}

type LineProps = {
  label: string;
  a: string;
  b: string | null | undefined;
  change?: string;
  better?: boolean;
};

function Line({ label, a, b, change, better }: LineProps) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{a}</td>
      <td>{b ?? <span className="muted">–</span>}</td>
      <td className="compare-change" data-better={better}>
        {change}
      </td>
    </tr>
  );
}

function MetricLine({ metric, a, b }: { metric: Metric; a: RunSummary; b: RunSummary | null }) {
  const before = a[metric.key];
  const after = b?.[metric.key];
  return (
    <Line
      label={metric.label}
      a={metric.format(before)}
      b={after === undefined ? undefined : metric.format(after)}
      change={after === undefined ? undefined : describeChange(before, after, metric.format)}
      better={after === undefined || after === before ? undefined : after < before}
    />
  );
}

function FixSummary({ available, a, b }: { available: Fix[]; a: RunRecord; b: RunRecord }) {
  const differences = differingFixes(available, a.fixes, b.fixes);
  if (differences.length === 0) {
    return <p className="muted compare-note">Both runs use the same fixes.</p>;
  }
  return (
    <p className="compare-note">
      Fixes that differ:{" "}
      {differences.map(({ fix, a: inA, b: inB }, i) => (
        <span key={fix.id}>
          {i > 0 && "; "}
          <strong>{fix.label}</strong> (A {inA ? "on" : "off"}, B {inB ? "on" : "off"})
        </span>
      ))}
    </p>
  );
}

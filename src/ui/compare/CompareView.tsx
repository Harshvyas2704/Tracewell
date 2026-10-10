import { statusLabel, type Fix } from "../../engine";
import { formatMs } from "../format";
import {
  comparedRuns,
  describeChange,
  differingFixes,
  enabledFixes,
  summarize,
  type CompareState,
  type RunRecord,
  type RunSummary,
} from "./compare";

type Props = {
  available: Fix[]; // the scenario's fixes
  state: CompareState;
  onPin(): void; // lock A
  onUnpin(): void; // back to keeping the previous run automatically
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

export function CompareView({ available, state, onPin, onUnpin }: Props) {
  const pair = comparedRuns(state);
  const hasRun = state.b !== null || state.a !== null;

  return (
    <section className="panel compare" aria-labelledby="compare-heading">
      <div className="panel-head">
        <h2 id="compare-heading">Compare runs</h2>
        {hasRun && (
          <button
            type="button"
            className="chip"
            aria-pressed={state.pinned}
            onClick={state.pinned ? onUnpin : onPin}
          >
            {state.pinned ? "Unpin A" : pair ? "Pin A" : "Pin this run as A"}
          </button>
        )}
      </div>

      {!pair ? (
        <p className="muted empty">
          {!hasRun
            ? "Run a request twice to compare the two runs."
            : state.pinned
              ? "This run is pinned as A. Change something (for example a fix) and run again to get run B."
              : "Change something (for example a fix) and run again. This run becomes A and the new one B."}
        </p>
      ) : (
        <Comparison available={available} a={pair.a} b={pair.b} pinned={state.pinned} />
      )}
    </section>
  );
}

type ComparisonProps = { available: Fix[]; a: RunRecord; b: RunRecord; pinned: boolean };

function Comparison({ available, a: runA, b: runB, pinned }: ComparisonProps) {
  const a = summarize(runA);
  const b = summarize(runB);
  const differences = differingFixes(available, runA.fixes, runB.fixes);

  return (
    <>
      <table className="compare-table">
        <thead>
          <tr>
            <td />
            <th scope="col">A ({pinned ? "pinned run" : "previous run"})</th>
            <th scope="col">B (latest run)</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          <Line label="Request" a={a.request} b={b.request} />
          <Line
            label="Status"
            a={statusLabel(a.status)}
            b={statusLabel(b.status)}
            change={a.status === b.status ? "same" : "different"}
          />
          {METRICS.map((metric) => (
            <MetricLine key={metric.key} metric={metric} a={a} b={b} />
          ))}
          <Line
            label="Fixes on"
            a={enabledFixes(available, runA.fixes).join(", ") || "none"}
            b={enabledFixes(available, runB.fixes).join(", ") || "none"}
          />
        </tbody>
      </table>

      {differences.length === 0 ? (
        <p className="muted compare-note">Both runs use the same fixes.</p>
      ) : (
        <p className="compare-note">
          Fixes that differ:{" "}
          {differences.map(({ fix, a: inA, b: inB }, i) => (
            <span key={fix.id}>
              {i > 0 && "; "}
              <strong>{fix.label}</strong> (A {inA ? "on" : "off"}, B {inB ? "on" : "off"})
            </span>
          ))}
        </p>
      )}
      <p className="muted compare-note">
        {pinned
          ? "A is pinned. New runs replace B only."
          : "A is the previous run. Each new run moves B to A. Pin A to keep it."}
      </p>
    </>
  );
}

type LineProps = { label: string; a: string; b: string; change?: string; better?: boolean };

function Line({ label, a, b, change, better }: LineProps) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{a}</td>
      <td>{b}</td>
      <td className="compare-change" data-better={better}>
        {change}
      </td>
    </tr>
  );
}

function MetricLine({ metric, a, b }: { metric: Metric; a: RunSummary; b: RunSummary }) {
  const before = a[metric.key];
  const after = b[metric.key];
  return (
    <Line
      label={metric.label}
      a={metric.format(before)}
      b={metric.format(after)}
      change={describeChange(before, after, metric.format)}
      better={after === before ? undefined : after < before}
    />
  );
}

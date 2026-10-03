import { statusLabel, type SimError, type SimResponse } from "../../engine";
import { formatJson, formatMs } from "../format";
import { StatusIcon } from "../trace";

// Takes only the parts of the result it shows. The full result also holds
// every table row, which is costly for React to compare in development.
type Props = {
  response: SimResponse | undefined;
  error: SimError | undefined;
  totalTime: number;
  reached: boolean; // the cursor is at the end of the trace
  onShowEvent(seq: number): void;
  onSkipToEnd(): void;
};

export function ResponseViewer(props: Props) {
  const { response, error, totalTime, reached, onShowEvent, onSkipToEnd } = props;

  return (
    <section className="panel response" aria-labelledby="response-heading">
      <h2 id="response-heading">Response</h2>
      {!response ? (
        <p className="muted empty">No response yet.</p>
      ) : !reached ? (
        <p className="muted empty">
          Not sent yet at this point in the trace.{" "}
          <button type="button" className="link-button" onClick={onSkipToEnd}>
            Skip to the end
          </button>
        </p>
      ) : (
        <>
          <p className="response-summary">
            <span className="status-pill" data-ok={response.status < 400}>
              <StatusIcon status={response.status < 400 ? "ok" : "fail"} />{" "}
              {statusLabel(response.status)}
            </span>
            <span>
              Total virtual time <strong>{formatMs(totalTime)}</strong>
            </span>
          </p>
          {error && (
            <p className="response-error">
              <code>{error.code}</code> {error.message}{" "}
              <button type="button" className="link-button" onClick={() => onShowEvent(error.eventSeq)}>
                Show where it went wrong
              </button>
            </p>
          )}
          <div className="response-grid">
            <div>
              <h3>Headers</h3>
              {Object.keys(response.headers).length === 0 ? (
                <p className="muted">None</p>
              ) : (
                <dl className="facts">
                  {Object.entries(response.headers).map(([name, value]) => (
                    <div key={name} className="fact">
                      <dt>{name}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <div>
              <h3>Body</h3>
              <pre className="code-block response-body" tabIndex={0}>
                {formatJson(response.body)}
              </pre>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

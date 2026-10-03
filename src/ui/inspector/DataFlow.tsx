import type { SimEvent } from "../../engine";
import { formatJson } from "../format";
import { buildDataFlow } from "./flowItems";

type Props = {
  events: SimEvent[];
  cursor: number;
};

export function DataFlow({ events, cursor }: Props) {
  const items = buildDataFlow(events, cursor);
  const currentSeq = events[cursor]?.seq;

  if (items.length === 0) {
    return <p className="muted empty">No request data yet at this point in the trace.</p>;
  }

  return (
    <ol className="flow">
      {items.map((item) => (
        <li
          key={item.id}
          className="flow-item"
          data-failed={item.failed === true}
          data-new={item.seq === currentSeq}
        >
          <h3>
            {item.failed && <span aria-hidden="true">✕ </span>}
            {item.title}
            {item.seq === currentSeq && <span className="flow-new">this step</span>}
          </h3>
          {item.note && <p className="flow-note">{item.note}</p>}
          {item.value !== undefined && (
            <pre className="code-block" tabIndex={0}>
              {typeof item.value === "string" ? item.value : formatJson(item.value)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  );
}

import { useEffect, useRef } from "react";
import type { SimEvent } from "../../engine";
import { stripItems, type StripItem } from "./pipeline";

type Props = {
  events: SimEvent[];
  cursor: number;
  showDot: boolean; // the moving dot, only in play mode with motion allowed
};

const mark = (item: StripItem) =>
  item.failed ? "✕" : item.visited ? "✓" : item.used ? "•" : "–";

const stateText = (item: StripItem) => {
  if (!item.used) return "not part of this request";
  if (item.failed) return item.current ? "failed, current stage" : "failed";
  if (item.current) return "current stage";
  return item.visited ? "done" : "not reached yet";
};

export function PipelineStrip({ events, cursor, showDot }: Props) {
  const items = stripItems(events, cursor);
  const current = items.findIndex((item) => item.current);
  const scroller = useRef<HTMLDivElement>(null);

  // When the strip is wider than its panel, keep the current box in view.
  useEffect(() => {
    const box = scroller.current;
    if (!box || current < 0) return;
    const center = ((current + 0.5) / items.length) * box.scrollWidth;
    box.scrollLeft = center - box.clientWidth / 2;
  }, [current, items.length]);

  return (
    <div className="strip-scroll" ref={scroller}>
      {/* Wide enough for every label. The strip scrolls sideways when the panel is narrower. */}
      <div className="strip-wrap" style={{ minWidth: `${items.length * 3.8}rem` }}>
        {showDot && current >= 0 && (
          <span
            className="strip-dot"
            aria-hidden="true"
            style={{ left: `${((current + 0.5) / items.length) * 100}%` }}
          />
        )}
        <ol
          className="strip"
          aria-label="Pipeline stages"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item) => (
            <li
              key={item.id}
              className="strip-item"
              data-used={item.used}
              data-visited={item.visited}
              data-failed={item.failed}
              aria-current={item.current ? "step" : undefined}
            >
              <span className="strip-mark" aria-hidden="true">
                {mark(item)}
              </span>
              <span className="strip-label">{item.label}</span>
              <span className="visually-hidden">: {stateText(item)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef } from "react";
import type { SimEvent } from "../../engine";
import { tokenize } from "./highlight";
import { lineStates, type LineState } from "./lines";

type Props = {
  code: string | undefined;
  events: SimEvent[];
  cursor: number;
};

const mark = (state: LineState) =>
  state.current ? "▶" : state.failed ? "✕" : state.executed ? "•" : "";

const stateText = (state: LineState) => {
  if (state.current) return state.failed ? " (running now, failed)" : " (running now)";
  if (state.failed) return " (failed here)";
  if (state.notReached) return " (not reached)";
  return state.executed ? " (already ran)" : "";
};

export function CodePanel({ code, events, cursor }: Props) {
  const lines = useMemo(() => (code ?? "").replace(/\n$/, "").split("\n"), [code]);
  const tokens = useMemo(() => lines.map(tokenize), [lines]);
  const states = lineStates(lines, events, cursor);
  const currentLine = events[cursor]?.line;
  const panel = useRef<HTMLElement>(null);

  // Keep the running line in view by scrolling the code panel only.
  useEffect(() => {
    const box = panel.current;
    const row = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !row) return;
    const boxRect = box.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < boxRect.top + 40 || rowRect.bottom > boxRect.bottom - 16) {
      box.scrollTop += rowRect.top - boxRect.top - box.clientHeight / 2 + rowRect.height / 2;
    }
  }, [currentLine, code]);

  return (
    <section className="panel code-panel" aria-labelledby="code-heading" ref={panel}>
      <h2 id="code-heading">Code</h2>
      {!code ? (
        <p className="muted empty">This scenario has no code to show.</p>
      ) : (
        <div className="code-lines">
          {lines.map((_, i) => {
            const state = states[i] as LineState;
            return (
              <div
                key={i}
                className="code-line"
                data-executed={state.executed}
                data-failed={state.failed}
                data-not-reached={state.notReached}
                aria-current={state.current || undefined}
              >
                <span className="code-mark" aria-hidden="true">
                  {mark(state)}
                </span>
                <span className="code-number">{i + 1}</span>
                <code className="code-text">
                  {(tokens[i] ?? []).map((token, t) =>
                    token.kind === "plain" ? (
                      token.text
                    ) : (
                      <span key={t} className={`tok-${token.kind}`}>
                        {token.text}
                      </span>
                    ),
                  )}
                  <span className="visually-hidden">{stateText(state)}</span>
                </code>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

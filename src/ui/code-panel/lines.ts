import type { SimEvent } from "../../engine";
import { tokenize } from "./highlight";

export type LineState = {
  current: boolean; // the event at the cursor runs this line
  executed: boolean; // some event at or before the cursor ran this line
  failed: boolean; // an event at or before the cursor failed on this line
  notReached: boolean; // inside the route's code, but skipped because of a failure
};

// The last line of the statement that starts on startLine, found by matching
// brackets. Lines are 1-based. Brackets inside strings and comments are ignored.
export function blockEnd(lines: string[], startLine: number): number {
  let depth = 0;
  let opened = false;
  for (let n = startLine; n <= lines.length; n++) {
    for (const token of tokenize(lines[n - 1] ?? "")) {
      if (token.kind === "string" || token.kind === "comment") continue;
      for (const char of token.text) {
        if ("({[".includes(char)) {
          depth += 1;
          opened = true;
        } else if (")}]".includes(char)) {
          depth -= 1;
        }
      }
    }
    if (opened && depth <= 0) return n;
  }
  return startLine;
}

// What each code line looks like with the trace at the cursor. Index 0 is line 1.
export function lineStates(lines: string[], events: SimEvent[], cursor: number): LineState[] {
  const past = events.slice(0, cursor + 1);
  const executed = new Set<number>();
  const failed = new Set<number>();
  for (const event of past) {
    if (event.line === undefined) continue;
    executed.add(event.line);
    if (event.status === "fail") failed.add(event.line);
  }

  // After a failure, the rest of the matched route's code never runs.
  const notReached = new Set<number>();
  // A failure the handler caught and recovered from does not stop the route.
  const failureAt = past.findIndex((event) => event.status === "fail" && !event.handled);
  const routeLine = past.find((event) => event.type === "ROUTE_MATCHED")?.line;
  if (failureAt >= 0 && routeLine !== undefined) {
    const end = blockEnd(lines, routeLine);
    let lastRun = routeLine;
    for (const event of past.slice(0, failureAt + 1)) {
      const line = event.line;
      if (line !== undefined && line >= routeLine && line <= end && line > lastRun) lastRun = line;
    }
    for (let n = lastRun + 1; n <= end; n++) {
      if (!executed.has(n) && (lines[n - 1] ?? "").trim() !== "") notReached.add(n);
    }
  }

  const currentLine = events[cursor]?.line;
  return lines.map((_, i) => ({
    current: i + 1 === currentLine,
    executed: executed.has(i + 1),
    failed: failed.has(i + 1),
    notReached: notReached.has(i + 1),
  }));
}

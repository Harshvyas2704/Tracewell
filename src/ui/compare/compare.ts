import type { Fix, Fixes, SimRequest, SimulationResult } from "../../engine";

// One finished run and what produced it.
export type RunRecord = {
  id: number;
  scenarioId: string;
  request: SimRequest;
  fixes: Fixes;
  result: SimulationResult;
};

// The two runs being compared. B is always the latest run. A is the run
// before it, unless the user pinned A: then A stays and new runs replace B.
export type CompareState = {
  a: RunRecord | null;
  b: RunRecord | null;
  pinned: boolean;
};

export const emptyCompare: CompareState = { a: null, b: null, pinned: false };

export function addRun(state: CompareState, run: RunRecord): CompareState {
  if (state.pinned) return { ...state, b: run };
  return { a: state.b, b: run, pinned: false };
}

// Locks A. With a single run so far, that run becomes the pinned A.
export function pinA(state: CompareState): CompareState {
  const a = state.a ?? state.b;
  return a ? { ...state, a, pinned: true } : state;
}

// Back to automatic mode: the next run moves B to A.
export function unpinA(state: CompareState): CompareState {
  const single = state.a !== null && state.a.id === state.b?.id;
  return { a: single ? null : state.a, b: state.b, pinned: false };
}

// The pair to show, once there are two different runs.
export function comparedRuns(state: CompareState): { a: RunRecord; b: RunRecord } | null {
  const { a, b } = state;
  return a && b && a.id !== b.id ? { a, b } : null;
}

export type RunSummary = {
  request: string; // e.g. "GET /users/1/orders"
  status: number;
  totalTime: number;
  sqlQueries: number;
  rowsScanned: number;
  rowsReturned: number;
};

export function summarize(run: RunRecord): RunSummary {
  const { request, result } = run;
  const query = new URLSearchParams(request.query).toString();
  return {
    request: `${request.method} ${request.path}${query ? `?${query}` : ""}`,
    status: result.responses[request.id]?.status ?? 0,
    ...result.metrics,
  };
}

export type FixDifference = { fix: Fix; a: boolean; b: boolean };

// The fixes that are on in one run and off in the other.
export function differingFixes(available: Fix[], a: Fixes, b: Fixes): FixDifference[] {
  return available
    .map((fix) => ({ fix, a: a[fix.id] === true, b: b[fix.id] === true }))
    .filter((entry) => entry.a !== entry.b);
}

export function enabledFixes(available: Fix[], fixes: Fixes): string[] {
  return available.filter((fix) => fixes[fix.id] === true).map((fix) => fix.label);
}

// How B differs from A, e.g. "−49 (−96%)". Lower is better for every metric
// shown, so the caller can mark a negative change as an improvement.
export function describeChange(a: number, b: number, format: (n: number) => string): string {
  if (a === b) return "same";
  const sign = b > a ? "+" : "−";
  const amount = `${sign}${format(Math.abs(b - a))}`;
  if (a === 0) return amount;
  return `${amount} (${sign}${Math.round((Math.abs(b - a) / a) * 100)}%)`;
}

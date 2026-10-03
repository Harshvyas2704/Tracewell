import type { Fix, Fixes, SimRequest, SimulationResult } from "../../engine";

// One finished run and what produced it.
export type RunRecord = {
  id: number;
  scenarioId: string;
  request: SimRequest;
  fixes: Fixes;
  result: SimulationResult;
};

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

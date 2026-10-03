// Cost model. These constants are model parameters chosen to make the shape
// of the work visible. They are not benchmarks of a real PostgreSQL server.
export const COST_CONFIG = {
  baseMs: 1, // round trip, parse and plan
  perRowScanMs: 0.005,
  perRowSentMs: 0.01,
  perSortCompareMs: 0.002, // multiplied by n * log2(n)
  perRowWriteMs: 0.1,
};

export type Work = {
  rowsScanned: number;
  rowsReturned: number;
  rowsSorted: number;
  rowsWritten: number;
};

// Steps to find one key in an index over n rows.
export function indexDepth(n: number): number {
  return n === 0 ? 0 : Math.max(1, Math.ceil(Math.log2(n)));
}

export function roundMs(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}

export function queryDuration(work: Work): number {
  const sort =
    work.rowsSorted > 1
      ? work.rowsSorted * Math.log2(work.rowsSorted) * COST_CONFIG.perSortCompareMs
      : 0;
  return roundMs(
    COST_CONFIG.baseMs +
      work.rowsScanned * COST_CONFIG.perRowScanMs +
      work.rowsReturned * COST_CONFIG.perRowSentMs +
      work.rowsWritten * COST_CONFIG.perRowWriteMs +
      sort,
  );
}

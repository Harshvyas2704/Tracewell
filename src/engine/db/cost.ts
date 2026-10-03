import { roundMs } from "../core/clock";
import { COST_CONFIG } from "../core/config";

export { COST_CONFIG };

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

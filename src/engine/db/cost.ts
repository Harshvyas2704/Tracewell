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

// Where a query's time goes. The parts always add up to the duration.
export type QueryCost = {
  baseMs: number; // round trip, parse, plan
  scanMs: number; // rowsScanned * perRowScanMs
  sentMs: number; // rowsReturned * perRowSentMs
  writeMs: number; // rowsWritten * perRowWriteMs
  sortMs: number; // sort cost, 0 if no sort
};

export function queryCost(work: Work): QueryCost {
  return {
    baseMs: COST_CONFIG.baseMs,
    scanMs: roundMs(work.rowsScanned * COST_CONFIG.perRowScanMs),
    sentMs: roundMs(work.rowsReturned * COST_CONFIG.perRowSentMs),
    writeMs: roundMs(work.rowsWritten * COST_CONFIG.perRowWriteMs),
    sortMs:
      work.rowsSorted > 1
        ? roundMs(work.rowsSorted * Math.log2(work.rowsSorted) * COST_CONFIG.perSortCompareMs)
        : 0,
  };
}

export function costTotal(cost: QueryCost): number {
  return roundMs(cost.baseMs + cost.scanMs + cost.sentMs + cost.writeMs + cost.sortMs);
}

export function queryDuration(work: Work): number {
  return costTotal(queryCost(work));
}

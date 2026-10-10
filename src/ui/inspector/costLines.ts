import { COST_CONFIG, type SqlInfo } from "../../engine";

export type CostLine = {
  label: string;
  formula?: string; // the numbers that give this part, e.g. "4,000 x 0.005"
  ms: number; // from the engine's cost breakdown
};

const count = (n: number) => n.toLocaleString("en-US");
const rate = (ms: number) => ms.toFixed(3);

// The parts of a query's cost that are not zero, with the numbers behind each.
// The amounts come from the engine (sql.cost). Only the per-row constants are
// read here, from the engine's COST_CONFIG, to show the formula.
export function costLines(sql: SqlInfo): CostLine[] {
  const { cost } = sql;
  const lines: CostLine[] = [
    { label: "Round trip", ms: cost.baseMs },
    {
      label: "Rows scanned",
      formula: `${count(sql.rowsScanned)} x ${rate(COST_CONFIG.perRowScanMs)}`,
      ms: cost.scanMs,
    },
    {
      label: "Rows returned",
      formula: `${count(sql.rowsReturned)} x ${rate(COST_CONFIG.perRowSentMs)}`,
      ms: cost.sentMs,
    },
    {
      label: "Rows written",
      formula: `${count(sql.rowsWritten)} x ${rate(COST_CONFIG.perRowWriteMs)}`,
      ms: cost.writeMs,
    },
    {
      label: "Sort",
      formula: `${count(sql.rowsSorted)} x log2(${count(sql.rowsSorted)}) x ${rate(COST_CONFIG.perSortCompareMs)}`,
      ms: cost.sortMs,
    },
  ];
  return lines.filter((line) => line.ms !== 0);
}

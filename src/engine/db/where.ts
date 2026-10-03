import type { Condition, Row, Value, Where } from "./types";

export type Op = "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte";

export type Clause =
  | { column: string; op: "in"; values: Value[] }
  | { column: string; op: Exclude<Op, "in">; value: Value };

export function toClauses(where: Where | undefined): Clause[] {
  return Object.entries(where ?? {}).map(([column, condition]) =>
    toClause(column, condition),
  );
}

function toClause(column: string, condition: Condition): Clause {
  if (condition === null || typeof condition !== "object") {
    return { column, op: "eq", value: condition };
  }
  if ("in" in condition) {
    return { column, op: "in", values: condition.in };
  }
  const [op, value] = Object.entries(condition)[0] as [Exclude<Op, "in">, Value];
  return { column, op, value };
}

export function matches(row: Row, clauses: Clause[]): boolean {
  return clauses.every((clause) => matchesClause(row, clause));
}

function matchesClause(row: Row, clause: Clause): boolean {
  const actual = row[clause.column] ?? null;
  if (clause.op === "in") return actual !== null && clause.values.includes(actual);

  const expected = clause.value;
  // "col = null" in a query object means IS NULL, "ne: null" means IS NOT NULL.
  if (expected === null) {
    if (clause.op === "eq") return actual === null;
    if (clause.op === "ne") return actual !== null;
    return false;
  }
  // Like SQL, any other comparison against NULL is not true.
  if (actual === null) return false;

  switch (clause.op) {
    case "eq":
      return actual === expected;
    case "ne":
      return actual !== expected;
    case "gt":
      return actual > expected;
    case "gte":
      return actual >= expected;
    case "lt":
      return actual < expected;
    case "lte":
      return actual <= expected;
  }
}

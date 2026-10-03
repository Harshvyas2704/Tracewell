import type { Query, Value, Where } from "./types";
import { toClauses, type Clause } from "./where";

export type SqlText = { text: string; params: Value[] };

const OPERATORS = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

// Turns a query object into display SQL with $1, $2 placeholders. The text is
// only shown to the user. It is never parsed or executed.
export function toSql(query: Query): SqlText {
  const params: Value[] = [];
  const param = (value: Value) => `$${params.push(value)}`;
  let text: string;

  switch (query.type) {
    case "select": {
      const orderBy = [query.orderBy ?? []].flat();
      text = `SELECT ${query.columns?.join(", ") ?? "*"} FROM ${query.table}`;
      text += whereSql(query.where, param);
      if (orderBy.length > 0) {
        const parts = orderBy.map(
          (o) => `${o.column}${o.direction === "desc" ? " DESC" : ""}`,
        );
        text += ` ORDER BY ${parts.join(", ")}`;
      }
      if (query.limit !== undefined) text += ` LIMIT ${param(query.limit)}`;
      if (query.offset !== undefined) text += ` OFFSET ${param(query.offset)}`;
      break;
    }
    case "insert": {
      const columns = Object.keys(query.values);
      const values = columns.map((c) => param(query.values[c] ?? null));
      text = `INSERT INTO ${query.table} (${columns.join(", ")}) VALUES (${values.join(", ")}) RETURNING *`;
      break;
    }
    case "update": {
      const sets = Object.entries(query.set).map(([c, v]) => `${c} = ${param(v)}`);
      text = `UPDATE ${query.table} SET ${sets.join(", ")}`;
      text += `${whereSql(query.where, param)} RETURNING *`;
      break;
    }
    case "delete":
      text = `DELETE FROM ${query.table}${whereSql(query.where, param)} RETURNING *`;
      break;
  }

  return { text, params };
}

function whereSql(where: Where | undefined, param: (value: Value) => string): string {
  const clauses = toClauses(where);
  if (clauses.length === 0) return "";
  return ` WHERE ${clauses.map((c) => clauseSql(c, param)).join(" AND ")}`;
}

function clauseSql(clause: Clause, param: (value: Value) => string): string {
  if (clause.op === "in") {
    // "IN ()" is not valid SQL, and an empty list can never match.
    if (clause.values.length === 0) return "FALSE";
    return `${clause.column} IN (${clause.values.map(param).join(", ")})`;
  }
  if (clause.value === null && clause.op === "eq") return `${clause.column} IS NULL`;
  if (clause.value === null && clause.op === "ne") return `${clause.column} IS NOT NULL`;
  return `${clause.column} ${OPERATORS[clause.op]} ${param(clause.value)}`;
}

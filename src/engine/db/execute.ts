import { indexDepth, queryDuration } from "./cost";
import { DbError } from "./errors";
import type {
  Database,
  DeleteQuery,
  InsertQuery,
  Query,
  QueryStats,
  Row,
  SelectQuery,
  Table,
  UpdateQuery,
  Value,
  Where,
} from "./types";
import { matches, toClauses, type Clause } from "./where";

export type QueryResult = {
  rows: Row[];
  stats: QueryStats;
  duration: number; // virtual ms
  error?: DbError;
};

// Runs a query against the in-memory tables. Database errors are returned,
// not thrown, so the caller still gets the work done before the failure.
export function executeQuery(database: Database, query: Query): QueryResult {
  const stats: QueryStats = {
    plan: query.type === "insert" ? "Insert" : "Seq Scan",
    rowsScanned: 0,
    rowsReturned: 0,
    rowsSorted: 0,
    rowsWritten: 0,
  };
  try {
    const table = database.tables[query.table];
    if (!table) {
      throw new DbError("42P01", `relation "${query.table}" does not exist`, {
        table: query.table,
      });
    }
    const rows = run(table, query, stats);
    stats.rowsReturned = rows.length;
    return { rows, stats, duration: queryDuration(stats) };
  } catch (err) {
    if (!(err instanceof DbError)) throw err;
    return { rows: [], stats, duration: queryDuration(stats), error: err };
  }
}

function run(table: Table, query: Query, stats: QueryStats): Row[] {
  switch (query.type) {
    case "select":
      return select(table, query, stats);
    case "insert":
      return insert(table, query, stats);
    case "update":
      return update(table, query, stats);
    case "delete":
      return remove(table, query, stats);
  }
}

function select(table: Table, query: SelectQuery, stats: QueryStats): Row[] {
  const orderBy = [query.orderBy ?? []].flat();
  for (const column of [...(query.columns ?? []), ...orderBy.map((o) => o.column)]) {
    requireColumn(table, column);
  }
  checkRowCount("LIMIT", query.limit);
  checkRowCount("OFFSET", query.offset);

  let rows = scan(table, query.where, stats);

  const first = orderBy[0];
  if (first) {
    // An index on the leading sort column lets Postgres read rows in order.
    if (!isIndexed(table, first.column)) stats.rowsSorted = rows.length;
    rows = [...rows].sort((a, b) => {
      for (const { column, direction } of orderBy) {
        const diff = compareValues(a[column] ?? null, b[column] ?? null);
        if (diff !== 0) return direction === "desc" ? -diff : diff;
      }
      return 0;
    });
  }

  const offset = query.offset ?? 0;
  rows = rows.slice(offset, query.limit === undefined ? undefined : offset + query.limit);

  const columns = query.columns;
  if (!columns) return rows.map((row) => ({ ...row }));
  return rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column, row[column] ?? null])),
  );
}

function insert(table: Table, query: InsertQuery, stats: QueryStats): Row[] {
  for (const column of Object.keys(query.values)) requireColumn(table, column);

  const row: Row = {};
  for (const column of table.columns) {
    row[column.name] = query.values[column.name] ?? null;
  }
  const pk = table.primaryKey;
  const isSerial = table.columns.find((c) => c.name === pk)?.type === "integer";
  const usedSequence = row[pk] === null && isSerial;
  if (usedSequence) row[pk] = table.nextId;

  for (const column of table.columns) {
    if (row[column.name] === null && (!column.nullable || column.name === pk)) {
      throw notNull(table, column.name);
    }
  }
  for (const column of uniqueColumns(table)) {
    const value = row[column] ?? null;
    if (value === null) continue;
    stats.rowsScanned += indexDepth(table.rows.length);
    if (table.rows.some((other) => other[column] === value)) {
      throw duplicate(table, column, value);
    }
  }

  if (usedSequence) table.nextId += 1;
  table.rows.push(row);
  stats.rowsWritten = 1;
  return [{ ...row }];
}

function update(table: Table, query: UpdateQuery, stats: QueryStats): Row[] {
  const setColumns = Object.keys(query.set);
  for (const column of setColumns) requireColumn(table, column);

  const targets = scan(table, query.where, stats);
  if (targets.length === 0) return [];

  for (const column of setColumns) {
    const nullable = table.columns.find((c) => c.name === column)?.nullable;
    if (query.set[column] === null && (!nullable || column === table.primaryKey)) {
      throw notNull(table, column);
    }
  }
  const targetSet = new Set(targets);
  for (const column of uniqueColumns(table)) {
    const value = query.set[column] ?? null;
    if (value === null) continue;
    stats.rowsScanned += indexDepth(table.rows.length);
    const clash =
      targets.length > 1 ||
      table.rows.some((other) => !targetSet.has(other) && other[column] === value);
    if (clash) throw duplicate(table, column, value);
  }

  for (const row of targets) Object.assign(row, query.set);
  stats.rowsWritten = targets.length;
  return targets.map((row) => ({ ...row }));
}

function remove(table: Table, query: DeleteQuery, stats: QueryStats): Row[] {
  const targets = new Set(scan(table, query.where, stats));
  table.rows = table.rows.filter((row) => !targets.has(row));
  stats.rowsWritten = targets.size;
  return [...targets].map((row) => ({ ...row }));
}

// Finds the rows matching a WHERE and records the plan and rows scanned.
// Returns the stored row objects, in table order.
function scan(table: Table, where: Where | undefined, stats: QueryStats): Row[] {
  const clauses = toClauses(where);
  for (const clause of clauses) requireColumn(table, clause.column);

  const total = table.rows.length;
  const indexClause = pickIndexClause(table, clauses);
  if (!indexClause) {
    stats.plan = "Seq Scan";
    stats.rowsScanned = total;
    return table.rows.filter((row) => matches(row, clauses));
  }

  // The index narrows the table to candidate rows. Each candidate is then
  // read and checked against the remaining conditions.
  const candidates = table.rows.filter((row) => matches(row, [indexClause]));
  const lookups = indexClause.op === "in" ? indexClause.values.length : 1;
  stats.plan = "Index Scan";
  stats.index = indexClause.column;
  stats.rowsScanned = lookups * indexDepth(total) + candidates.length;
  return candidates.filter((row) => matches(row, clauses));
}

// Only equality and IN on an indexed column use the index. Range comparisons
// fall back to a sequential scan in this model.
function pickIndexClause(table: Table, clauses: Clause[]): Clause | undefined {
  const unique = uniqueColumns(table);
  const rank = (clause: Clause): number => {
    if (!isIndexed(table, clause.column)) return Infinity;
    if (clause.op === "in") return 2;
    if (clause.op !== "eq" || clause.value === null) return Infinity;
    return unique.includes(clause.column) ? 0 : 1;
  };
  let best: Clause | undefined;
  for (const clause of clauses) {
    if (rank(clause) < (best ? rank(best) : Infinity)) best = clause;
  }
  return best;
}

function uniqueColumns(table: Table): string[] {
  return [table.primaryKey, ...table.unique];
}

function isIndexed(table: Table, column: string): boolean {
  return uniqueColumns(table).includes(column) || table.indexes.includes(column);
}

// NULLs sort as larger than any value, like Postgres (last when ascending).
function compareValues(a: Value, b: Value): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function requireColumn(table: Table, column: string): void {
  if (!table.columns.some((c) => c.name === column)) {
    throw new DbError(
      "42703",
      `column "${column}" of relation "${table.name}" does not exist`,
      { table: table.name, column },
    );
  }
}

function checkRowCount(keyword: "LIMIT" | "OFFSET", value: number | undefined): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new DbError("2201W", `${keyword} must be a non-negative integer`);
  }
}

function notNull(table: Table, column: string): DbError {
  return new DbError(
    "23502",
    `null value in column "${column}" of relation "${table.name}" violates not-null constraint`,
    { table: table.name, column },
  );
}

function duplicate(table: Table, column: string, value: Value): DbError {
  const constraint = `${table.name}_${column === table.primaryKey ? "pkey" : `${column}_key`}`;
  return new DbError(
    "23505",
    `duplicate key value violates unique constraint "${constraint}"`,
    {
      detail: `Key (${column})=(${String(value)}) already exists.`,
      table: table.name,
      column,
      constraint,
    },
  );
}

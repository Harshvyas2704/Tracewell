import type { Database, Row, Table, TableDef } from "./types";

// Builds a fresh in-memory database for one simulation. Rows are copied so a
// run never changes the scenario's seed data.
export function createDatabase(defs: TableDef[]): Database {
  const tables: Record<string, Table> = {};
  for (const def of defs) {
    if (tables[def.name]) throw new Error(`Duplicate table "${def.name}"`);
    tables[def.name] = createTable(def);
  }
  return { tables };
}

function createTable(def: TableDef): Table {
  const columnNames = new Set(def.columns.map((c) => c.name));
  const unique = def.unique ?? [];
  const indexes = def.indexes ?? [];
  for (const column of [def.primaryKey, ...unique, ...indexes]) {
    if (!columnNames.has(column)) {
      throw new Error(`Table "${def.name}" has no column "${column}"`);
    }
  }

  const rows = def.rows.map((row) => ({ ...row }));
  checkSeedRows(def, rows, [def.primaryKey, ...unique]);

  const pkType = def.columns.find((c) => c.name === def.primaryKey)?.type;
  let nextId = 1;
  if (pkType === "integer") {
    for (const row of rows) {
      const id = row[def.primaryKey];
      if (typeof id === "number" && id >= nextId) nextId = id + 1;
    }
  }

  return {
    name: def.name,
    columns: def.columns,
    primaryKey: def.primaryKey,
    unique,
    indexes,
    rows,
    nextId,
  };
}

// Seed data is written by us, so a bad seed is a scenario bug: fail loudly.
function checkSeedRows(def: TableDef, rows: Row[], uniqueColumns: string[]): void {
  const required = def.columns
    .filter((c) => !c.nullable || c.name === def.primaryKey)
    .map((c) => c.name);
  const seen = uniqueColumns.map(() => new Set<unknown>());

  for (const row of rows) {
    for (const column of required) {
      if ((row[column] ?? null) === null) {
        throw new Error(`Seed row in "${def.name}" is missing "${column}"`);
      }
    }
    uniqueColumns.forEach((column, i) => {
      const value = row[column] ?? null;
      if (value === null) return;
      if (seen[i]?.has(value)) {
        throw new Error(`Seed rows in "${def.name}" repeat ${column}=${String(value)}`);
      }
      seen[i]?.add(value);
    });
  }
}

export function snapshotDatabase(database: Database): { tables: Record<string, Row[]> } {
  const tables: Record<string, Row[]> = {};
  for (const table of Object.values(database.tables)) {
    tables[table.name] = table.rows.map((row) => ({ ...row }));
  }
  return { tables };
}

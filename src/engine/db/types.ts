export type Value = string | number | boolean | null;
export type Row = Record<string, Value>;

export type ColumnType = "integer" | "numeric" | "text" | "boolean" | "timestamp";

export type Column = {
  name: string;
  type: ColumnType;
  nullable: boolean;
};

// What a scenario declares. Single-column keys and indexes only.
export type TableDef = {
  name: string;
  columns: Column[];
  primaryKey: string;
  unique?: string[]; // columns with a UNIQUE constraint
  indexes?: string[]; // columns with a plain index
  rows: Row[];
};

// A table inside a running simulation.
export type Table = {
  name: string;
  columns: Column[];
  primaryKey: string;
  unique: string[];
  indexes: string[];
  rows: Row[];
  nextId: number; // serial sequence for an integer primary key
};

export type Database = {
  tables: Record<string, Table>;
};

// A bare value means equality. null means IS NULL.
export type Condition =
  | Value
  | { eq: Value }
  | { ne: Value }
  | { in: Value[] }
  | { gt: Value }
  | { gte: Value }
  | { lt: Value }
  | { lte: Value };

// All conditions are combined with AND.
export type Where = Record<string, Condition>;

export type OrderBy = { column: string; direction?: "asc" | "desc" };

export type SelectQuery = {
  type: "select";
  table: string;
  columns?: string[];
  where?: Where;
  orderBy?: OrderBy | OrderBy[];
  limit?: number;
  offset?: number;
};

export type InsertQuery = { type: "insert"; table: string; values: Row };
export type UpdateQuery = { type: "update"; table: string; set: Row; where?: Where };
export type DeleteQuery = { type: "delete"; table: string; where?: Where };

export type Query = SelectQuery | InsertQuery | UpdateQuery | DeleteQuery;

export type QueryPlan = "Seq Scan" | "Index Scan" | "Insert";

export type QueryStats = {
  plan: QueryPlan;
  index?: string; // column whose index was used
  rowsScanned: number;
  rowsReturned: number;
  rowsSorted: number; // rows sorted without the help of an index
  rowsWritten: number;
};

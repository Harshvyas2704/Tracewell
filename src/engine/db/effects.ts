import type { DeleteQuery, Query, Row, SelectQuery, UpdateQuery } from "./types";

export type DbEffectMeta = {
  line?: number; // display code line
  label?: string; // trace label, defaults to e.g. "SELECT products"
  groupKey?: string; // consecutive events with the same key collapse in the trace
};

export type DbEffect = { kind: "db"; query: Query } & DbEffectMeta;

const effect = (query: Query, meta: DbEffectMeta = {}): DbEffect => ({
  kind: "db",
  query,
  ...meta,
});

// Database effect creators. Each one resumes the handler with the resulting
// rows (writes behave like RETURNING *), or throws a DbError into it.
export const db = {
  select: (table: string, query: Omit<SelectQuery, "type" | "table"> = {}, meta?: DbEffectMeta) =>
    effect({ type: "select", table, ...query }, meta),
  insert: (table: string, values: Row, meta?: DbEffectMeta) =>
    effect({ type: "insert", table, values }, meta),
  update: (table: string, query: Omit<UpdateQuery, "type" | "table">, meta?: DbEffectMeta) =>
    effect({ type: "update", table, ...query }, meta),
  delete: (table: string, query: Omit<DeleteQuery, "type" | "table"> = {}, meta?: DbEffectMeta) =>
    effect({ type: "delete", table, ...query }, meta),
};

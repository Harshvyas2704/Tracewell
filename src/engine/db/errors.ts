// Postgres error codes the simulated database can raise.
export type DbErrorCode =
  | "23502" // not_null_violation
  | "23505" // unique_violation
  | "42P01" // undefined_table
  | "42703" // undefined_column
  | "2201W"; // invalid_row_count_in_limit_clause

export type DbErrorInfo = {
  detail?: string;
  table?: string;
  column?: string;
  constraint?: string;
};

// Thrown into the handler at the yield that ran the query, so handlers can
// catch it like a real driver error.
export class DbError extends Error {
  readonly code: DbErrorCode;
  readonly detail?: string;
  readonly table?: string;
  readonly column?: string;
  readonly constraint?: string;

  constructor(code: DbErrorCode, message: string, info: DbErrorInfo = {}) {
    super(message);
    this.name = "DbError";
    this.code = code;
    Object.assign(this, info);
  }
}

export function isDbError(err: unknown): err is DbError {
  return err instanceof DbError;
}

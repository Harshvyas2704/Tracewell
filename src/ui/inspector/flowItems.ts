import type { SimEvent } from "../../engine";

// One stop of the request's data on its way through the server.
export type FlowItem = {
  id: string;
  title: string;
  value: unknown;
  note?: string;
  failed?: boolean;
  seq: number; // the event that produced it
};

type Snapshot = Record<string, unknown>;

// The data the request has produced up to the cursor, in the order it appeared:
// raw body, parsed JSON, validated DTO, SQL params, DB rows, response body.
// A step that has not happened yet has no item. A failed step shows the failure.
export function buildDataFlow(events: SimEvent[], cursor: number): FlowItem[] {
  let items: FlowItem[] = [];
  const put = (item: FlowItem) => {
    // A later query replaces the params and rows of an earlier one.
    items = [...items.filter((existing) => existing.id !== item.id), item];
  };

  for (const event of events.slice(0, cursor + 1)) {
    const snapshot = (event.snapshot ?? {}) as Snapshot;
    const { seq } = event;
    const failure = (title: string, value: unknown) =>
      put({ id: `failure-${seq}`, title, value, failed: true, seq });

    switch (event.type) {
      case "REQUEST_RECEIVED":
        if (typeof snapshot.rawBody === "string") {
          put({ id: "raw", title: "Raw body", value: snapshot.rawBody, seq });
        }
        break;
      case "BODY_PARSED":
        put({ id: "parsed", title: "Parsed JSON", value: snapshot.parsed, seq });
        break;
      case "VALIDATION_OK":
        put({ id: "dto", title: "Validated DTO", value: snapshot.dto, seq });
        break;
      case "VALIDATION_FAILED":
        failure("Validation failed", snapshot.fields);
        break;
      case "SQL_QUERY": {
        const sql = event.sql;
        if (!sql) break;
        put({ id: "sql-params", title: "SQL params", value: sql.params, note: sql.text, seq });
        items = items.filter((item) => item.id !== "db-rows");
        if (event.status === "fail") {
          failure("Query failed", snapshot.error);
          break;
        }
        const shown = Array.isArray(snapshot.rows) ? snapshot.rows : [];
        const one = sql.rowsReturned === 1;
        put({
          id: "db-rows",
          title: one ? "DB row" : `DB rows (${sql.rowsReturned})`,
          value: one ? shown[0] : shown,
          note:
            sql.rowsReturned > shown.length
              ? `Showing the first ${shown.length} of ${sql.rowsReturned}`
              : undefined,
          seq,
        });
        break;
      }
      case "RESPONSE_SENT":
        put({
          id: "response",
          title: "Response body",
          value: snapshot.body,
          note: `Status ${String(snapshot.status)}`,
          failed: event.status === "fail",
          seq,
        });
        break;
      default:
        if (event.status === "fail") {
          failure(event.label, event.snapshot);
        }
    }
  }
  return items;
}

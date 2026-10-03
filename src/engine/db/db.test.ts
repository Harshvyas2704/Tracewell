import { describe, expect, it } from "vitest";
import { COST_CONFIG, indexDepth, queryDuration } from "./cost";
import { createDatabase, snapshotDatabase } from "./database";
import { executeQuery } from "./execute";
import { toSql } from "./sql";
import type { Query, TableDef } from "./types";

const CATEGORIES = ["books", "games", "music", "tools", "toys"];

// 1,000 products. id is the primary key, name is unique, category has no index.
const products = (extra: Partial<TableDef> = {}): TableDef => ({
  name: "products",
  columns: [
    { name: "id", type: "integer", nullable: false },
    { name: "name", type: "text", nullable: false },
    { name: "price", type: "numeric", nullable: false },
    { name: "category", type: "text", nullable: false },
    { name: "note", type: "text", nullable: true },
  ],
  primaryKey: "id",
  unique: ["name"],
  rows: Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    name: `Product ${i + 1}`,
    price: ((i * 37) % 500) + 1,
    category: CATEGORIES[i % CATEGORIES.length] ?? "books",
    note: i % 2 === 0 ? null : "even id",
  })),
  ...extra,
});

const setup = (extra?: Partial<TableDef>) => createDatabase([products(extra)]);
const select = (query: Omit<Extract<Query, { type: "select" }>, "type" | "table">): Query => ({
  type: "select",
  table: "products",
  ...query,
});

describe("toSql", () => {
  it("writes select statements with numbered params", () => {
    expect(toSql(select({ where: { id: 42 } }))).toEqual({
      text: "SELECT * FROM products WHERE id = $1",
      params: [42],
    });
    expect(
      toSql(
        select({
          columns: ["id", "name"],
          where: { category: "books", price: { gte: 10 } },
          orderBy: [{ column: "price", direction: "desc" }, { column: "id" }],
          limit: 20,
          offset: 40,
        }),
      ),
    ).toEqual({
      text: "SELECT id, name FROM products WHERE category = $1 AND price >= $2 ORDER BY price DESC, id LIMIT $3 OFFSET $4",
      params: ["books", 10, 20, 40],
    });
    expect(toSql(select({}))).toEqual({ text: "SELECT * FROM products", params: [] });
  });

  it("writes IN, NULL and comparison conditions", () => {
    expect(toSql(select({ where: { id: { in: [1, 2, 3] } } }))).toEqual({
      text: "SELECT * FROM products WHERE id IN ($1, $2, $3)",
      params: [1, 2, 3],
    });
    expect(toSql(select({ where: { id: { in: [] } } })).text).toBe(
      "SELECT * FROM products WHERE FALSE",
    );
    expect(
      toSql(select({ where: { note: null, name: { ne: "x" }, price: { lt: 5 } } })),
    ).toEqual({
      text: "SELECT * FROM products WHERE note IS NULL AND name <> $1 AND price < $2",
      params: ["x", 5],
    });
    expect(toSql(select({ where: { note: { ne: null } } })).text).toBe(
      "SELECT * FROM products WHERE note IS NOT NULL",
    );
  });

  it("writes insert, update and delete statements", () => {
    expect(
      toSql({ type: "insert", table: "products", values: { name: "Lamp", price: 30 } }),
    ).toEqual({
      text: "INSERT INTO products (name, price) VALUES ($1, $2) RETURNING *",
      params: ["Lamp", 30],
    });
    expect(
      toSql({ type: "update", table: "products", set: { price: 5, note: null }, where: { id: 7 } }),
    ).toEqual({
      text: "UPDATE products SET price = $1, note = $2 WHERE id = $3 RETURNING *",
      params: [5, null, 7],
    });
    expect(toSql({ type: "delete", table: "products", where: { id: 7 } })).toEqual({
      text: "DELETE FROM products WHERE id = $1 RETURNING *",
      params: [7],
    });
  });
});

describe("select", () => {
  it("uses an index scan for an indexed column and a seq scan otherwise", () => {
    const database = setup();
    const byId = executeQuery(database, select({ where: { id: 42 } }));
    const byCategory = executeQuery(database, select({ where: { category: "books" } }));

    expect(byId.rows).toEqual([
      { id: 42, name: "Product 42", price: 18, category: "games", note: "even id" },
    ]);
    expect(byId.stats).toMatchObject({
      plan: "Index Scan",
      index: "id",
      rowsScanned: indexDepth(1000) + 1,
      rowsReturned: 1,
    });
    expect(indexDepth(1000)).toBe(10);

    expect(byCategory.rows).toHaveLength(200);
    expect(byCategory.stats).toMatchObject({
      plan: "Seq Scan",
      rowsScanned: 1000,
      rowsReturned: 200,
    });
    expect(byCategory.stats.index).toBeUndefined();
    expect(byCategory.duration).toBeGreaterThan(byId.duration);
  });

  it("switches the same query to an index scan once the column is indexed", () => {
    const query = select({ where: { category: "books" } });
    const without = executeQuery(setup(), query);
    const withIndex = executeQuery(setup({ indexes: ["category"] }), query);

    expect(withIndex.rows).toEqual(without.rows);
    expect(withIndex.stats).toMatchObject({
      plan: "Index Scan",
      index: "category",
      rowsScanned: indexDepth(1000) + 200,
    });
    expect(withIndex.duration).toBeLessThan(without.duration);
  });

  it("uses the unique index and one lookup per IN value", () => {
    const database = setup();
    const byName = executeQuery(database, select({ where: { name: "Product 7", category: "toys" } }));
    // The index finds Product 7, then the category condition rejects it.
    expect(byName.stats).toMatchObject({ plan: "Index Scan", index: "name", rowsScanned: 11, rowsReturned: 0 });

    const byIds = executeQuery(database, select({ where: { id: { in: [1, 2, 3, 99999] } } }));
    expect(byIds.rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(byIds.stats).toMatchObject({ plan: "Index Scan", rowsScanned: 4 * 10 + 3 });
  });

  it("falls back to a seq scan for range and NULL conditions", () => {
    const database = setup();
    const range = executeQuery(database, select({ where: { id: { lte: 3 } } }));
    expect(range.rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(range.stats.plan).toBe("Seq Scan");

    const nulls = executeQuery(database, select({ where: { note: null } }));
    expect(nulls.rows).toHaveLength(500);
    expect(executeQuery(database, select({ where: { note: { ne: null } } })).rows).toHaveLength(500);
    // A comparison against NULL is never true.
    expect(executeQuery(database, select({ where: { note: { ne: "even id" } } })).rows).toHaveLength(0);
    expect(executeQuery(database, select({ where: { id: { in: [] } } })).rows).toHaveLength(0);
  });

  it("gives the same cost for the same query twice", () => {
    const database = setup();
    const query = select({ where: { category: "toys" }, orderBy: { column: "price" }, limit: 5 });
    const first = executeQuery(database, query);
    const second = executeQuery(database, query);
    expect(second).toEqual(first);
    expect(first.duration).toBe(queryDuration(first.stats));
  });

  it("derives duration from the work done", () => {
    const { stats, duration } = executeQuery(setup(), select({ where: { category: "books" } }));
    expect(duration).toBeCloseTo(
      COST_CONFIG.baseMs + 1000 * COST_CONFIG.perRowScanMs + 200 * COST_CONFIG.perRowSentMs,
    );
    expect(stats.rowsSorted).toBe(0);
  });

  it("orders, limits and offsets rows", () => {
    const database = setup();
    const page = executeQuery(
      database,
      select({
        where: { category: "books" },
        orderBy: [{ column: "price", direction: "desc" }, { column: "id" }],
        limit: 3,
        offset: 1,
      }),
    );
    const all = executeQuery(database, select({ where: { category: "books" } })).rows;
    const expected = [...all]
      .sort((a, b) => Number(b.price) - Number(a.price) || Number(a.id) - Number(b.id))
      .slice(1, 4);
    expect(page.rows).toEqual(expected);
    expect(page.stats.rowsReturned).toBe(3);
  });

  it("adds a sort cost only when the order column is not indexed", () => {
    const database = setup();
    const byPrice = executeQuery(database, select({ orderBy: { column: "price" } }));
    const byId = executeQuery(database, select({ orderBy: { column: "id", direction: "desc" } }));

    expect(byPrice.stats.rowsSorted).toBe(1000);
    expect(byId.stats.rowsSorted).toBe(0);
    expect(byId.rows[0]?.id).toBe(1000);
    expect(byPrice.duration).toBeGreaterThan(byId.duration);
  });

  it("sorts NULLs last when ascending", () => {
    const rows = executeQuery(setup(), select({ orderBy: { column: "note" }, limit: 501 })).rows;
    expect(rows[499]?.note).toBe("even id");
    expect(rows[500]?.note).toBeNull();
  });

  it("returns only the requested columns", () => {
    const { rows } = executeQuery(setup(), select({ columns: ["id", "name"], where: { id: 1 } }));
    expect(rows).toEqual([{ id: 1, name: "Product 1" }]);
  });

  it("returns copies, so callers cannot change stored rows", () => {
    const database = setup();
    const [row] = executeQuery(database, select({ where: { id: 1 } })).rows;
    if (row) row.name = "changed";
    expect(executeQuery(database, select({ where: { id: 1 } })).rows[0]?.name).toBe("Product 1");
  });

  it("reports unknown tables, unknown columns and bad limits as errors", () => {
    const database = setup();
    expect(executeQuery(database, { type: "select", table: "nope" }).error?.code).toBe("42P01");
    expect(executeQuery(database, select({ where: { colour: "red" } })).error?.code).toBe("42703");
    expect(executeQuery(database, select({ limit: -1 })).error?.code).toBe("2201W");
  });
});

describe("insert", () => {
  const lamp = { name: "Lamp", price: 30, category: "tools" };

  it("adds a row, assigns the next id and returns it", () => {
    const database = setup();
    const result = executeQuery(database, { type: "insert", table: "products", values: lamp });

    expect(result.rows).toEqual([{ id: 1001, ...lamp, note: null }]);
    expect(result.stats).toMatchObject({ plan: "Insert", rowsWritten: 1, rowsReturned: 1 });
    expect(executeQuery(database, select({ where: { id: 1001 } })).rows).toHaveLength(1);

    const next = executeQuery(database, {
      type: "insert",
      table: "products",
      values: { ...lamp, name: "Lamp 2" },
    });
    expect(next.rows[0]?.id).toBe(1002);
  });

  it("fails with 23505 on a duplicate unique value and writes nothing", () => {
    const database = setup();
    const result = executeQuery(database, {
      type: "insert",
      table: "products",
      values: { ...lamp, name: "Product 5" },
    });

    expect(result.error).toMatchObject({
      code: "23505",
      message: 'duplicate key value violates unique constraint "products_name_key"',
      detail: "Key (name)=(Product 5) already exists.",
      constraint: "products_name_key",
    });
    expect(result.rows).toEqual([]);
    expect(database.tables.products?.rows).toHaveLength(1000);

    // The failed insert did not use up an id.
    const ok = executeQuery(database, { type: "insert", table: "products", values: lamp });
    expect(ok.rows[0]?.id).toBe(1001);
  });

  it("fails with 23505 on a duplicate primary key", () => {
    const result = executeQuery(setup(), {
      type: "insert",
      table: "products",
      values: { ...lamp, id: 10 },
    });
    expect(result.error).toMatchObject({ code: "23505", constraint: "products_pkey" });
  });

  it("fails with 23502 when a NOT NULL column is missing", () => {
    const result = executeQuery(setup(), {
      type: "insert",
      table: "products",
      values: { name: "Lamp", category: "tools" },
    });
    expect(result.error).toMatchObject({
      code: "23502",
      column: "price",
      message: 'null value in column "price" of relation "products" violates not-null constraint',
    });
  });

  it("fails with 42703 on an unknown column", () => {
    const result = executeQuery(setup(), {
      type: "insert",
      table: "products",
      values: { ...lamp, colour: "red" },
    });
    expect(result.error?.code).toBe("42703");
  });
});

describe("update and delete", () => {
  it("updates matching rows and returns them", () => {
    const database = setup();
    const result = executeQuery(database, {
      type: "update",
      table: "products",
      set: { price: 999 },
      where: { id: 3 },
    });
    expect(result.rows).toEqual([expect.objectContaining({ id: 3, price: 999 })]);
    expect(result.stats).toMatchObject({ plan: "Index Scan", rowsWritten: 1 });
    expect(executeQuery(database, select({ where: { price: 999 } })).rows).toHaveLength(1);
  });

  it("rejects updates that break constraints and changes nothing", () => {
    const database = setup();
    const before = snapshotDatabase(database);

    const dup = executeQuery(database, {
      type: "update",
      table: "products",
      set: { name: "Product 1" },
      where: { id: 2 },
    });
    const many = executeQuery(database, {
      type: "update",
      table: "products",
      set: { name: "Same" },
      where: { category: "books" },
    });
    const nul = executeQuery(database, {
      type: "update",
      table: "products",
      set: { price: null },
      where: { id: 2 },
    });

    expect([dup.error?.code, many.error?.code, nul.error?.code]).toEqual(["23505", "23505", "23502"]);
    expect(snapshotDatabase(database)).toEqual(before);
  });

  it("allows setting a unique column to the value the row already has", () => {
    const result = executeQuery(setup(), {
      type: "update",
      table: "products",
      set: { name: "Product 2", price: 1 },
      where: { id: 2 },
    });
    expect(result.error).toBeUndefined();
  });

  it("deletes matching rows and returns them", () => {
    const database = setup();
    const result = executeQuery(database, {
      type: "delete",
      table: "products",
      where: { category: "toys" },
    });
    expect(result.rows).toHaveLength(200);
    expect(result.stats).toMatchObject({ plan: "Seq Scan", rowsScanned: 1000, rowsWritten: 200 });
    expect(database.tables.products?.rows).toHaveLength(800);
  });
});

describe("createDatabase", () => {
  it("copies seed rows so runs never change the scenario data", () => {
    const def = products();
    const database = createDatabase([def]);
    executeQuery(database, { type: "delete", table: "products" });
    executeQuery(createDatabase([def]), {
      type: "update",
      table: "products",
      set: { price: 0 },
    });
    expect(def.rows).toHaveLength(1000);
    expect(def.rows[0]?.price).toBe(1);
  });

  it("rejects seed data that breaks its own constraints", () => {
    const [first] = products().rows;
    expect(() => createDatabase([products({ rows: [{ ...first }, { ...first }] })])).toThrow(/repeat/);
    expect(() => createDatabase([products({ rows: [{ id: 1, name: "x" }] })])).toThrow(/missing/);
    expect(() => createDatabase([products({ indexes: ["colour"] })])).toThrow(/no column/);
  });
});

import { lineOf, type Fixes } from "../../engine";

// Display code. It is shown to the user and never executed.
const head = `import express from "express";
import { db } from "./db.js";

const app = express();
app.use(express.json());

app.get("/users/:id/orders", async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  const { rows: orders } = await db.query(
    "SELECT * FROM orders WHERE user_id = $1 ORDER BY id",
    [userId],
  );
  if (orders.length === 0) {
    return res.json({ userId, orders: [] });
  }
`;

const nPlusOne = `${head}
  // One more query for every order.
  for (const order of orders) {
    const { rows: items } = await db.query(
      "SELECT * FROM order_items WHERE order_id = $1",
      [order.id],
    );
    order.items = items;
  }

  res.json({ userId, orders });
});
`;

const eagerLoad = `${head}
  // One query for the items of every order.
  const orderIds = orders.map((order) => order.id);
  const placeholders = orderIds.map((_, i) => \`$\${i + 1}\`).join(", ");
  const { rows: items } = await db.query(
    \`SELECT * FROM order_items WHERE order_id IN (\${placeholders})\`,
    orderIds,
  );
  const itemsByOrder = Map.groupBy(items, (item) => item.order_id);
  for (const order of orders) {
    order.items = itemsByOrder.get(order.id) ?? [];
  }

  res.json({ userId, orders });
});
`;

// Shown above the app code when the index fix is on.
const migration = `// Migration
// CREATE INDEX order_items_order_id_idx ON order_items (order_id);

`;

const linesOf = (source: string) => {
  const at = (snippet: string) => lineOf(source, snippet);
  return {
    bodyParser: at("app.use(express.json())"),
    route: at('app.get("/users/:id/orders"'),
    invalidId: at("Invalid user id"),
    selectOrders: at("FROM orders WHERE user_id"),
    sendEmpty: at("orders: [] }"),
    selectItems: at("FROM order_items WHERE order_id"),
    send: at("res.json({ userId, orders });"),
  };
};

// One variant per combination of the two fixes: its code and where things are in it.
const variant = (eager: boolean, indexed: boolean) => {
  const source = (indexed ? migration : "") + (eager ? eagerLoad : nPlusOne);
  return { code: source, lines: linesOf(source) };
};

const variants = [
  [variant(false, false), variant(false, true)],
  [variant(true, false), variant(true, true)],
] as const;

const pick = (fixes: Fixes) => variants[fixes.eagerLoad ? 1 : 0][fixes.indexOrderItems ? 1 : 0];

export const code = (fixes: Fixes) => pick(fixes).code;
export const lines = (fixes: Fixes) => pick(fixes).lines;

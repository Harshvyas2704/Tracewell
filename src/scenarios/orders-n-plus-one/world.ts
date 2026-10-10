import type { Fixes, Row, TableDef } from "../../engine";

export const USER_COUNT = 20;
export const ORDERS_PER_USER = 50;

const FIRST_NAMES = ["Asha", "Ben", "Chen", "Dara", "Eli", "Farah", "Gus", "Hana", "Ivo", "Jun"];
const LAST_NAMES = ["Patel", "Okafor"];
const STATUSES = ["delivered", "delivered", "shipped", "processing", "cancelled"];
const PRODUCTS = [
  "Kettle", "Notebook", "Lantern", "Headphones", "Desk Lamp", "Backpack", "Mug",
  "Speaker", "Planner", "Thermos", "Candle",
];

// Every order has 3, 4 or 5 items, decided by its id so the data never changes.
export const itemCount = (orderId: number) => 3 + (orderId % 3);

function buildUsers(): Row[] {
  return Array.from({ length: USER_COUNT }, (_, i) => {
    const first = FIRST_NAMES[i % FIRST_NAMES.length] ?? "Sam";
    const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length)] ?? "Lee";
    return { id: i + 1, name: `${first} ${last}`, email: `${first}.${last}@example.com`.toLowerCase() };
  });
}

// Orders are spread across users (order 1 to user 1, order 2 to user 2, ...),
// the way rows of different customers interleave in a real table.
function buildOrders(): Row[] {
  return Array.from({ length: USER_COUNT * ORDERS_PER_USER }, (_, i) => ({
    id: i + 1,
    user_id: (i % USER_COUNT) + 1,
    status: STATUSES[i % STATUSES.length] ?? "delivered",
    created_at: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
}

function buildOrderItems(orders: Row[]): Row[] {
  const items: Row[] = [];
  for (const order of orders) {
    const orderId = order.id as number;
    for (let n = 0; n < itemCount(orderId); n++) {
      items.push({
        id: items.length + 1,
        order_id: orderId,
        product: PRODUCTS[(orderId + n * 3) % PRODUCTS.length] ?? "Mug",
        quantity: 1 + ((orderId + n) % 3),
        unit_price: 9 + ((orderId * 7 + n * 11) % 90),
      });
    }
  }
  return items;
}

const orders = buildOrders();

// Indexes exist on primary keys only. Nothing indexes orders.user_id or
// order_items.order_id, so every lookup by those columns reads the whole table.
const tables: TableDef[] = [
  {
    name: "users",
    columns: [
      { name: "id", type: "integer", nullable: false },
      { name: "name", type: "text", nullable: false },
      { name: "email", type: "text", nullable: false },
    ],
    primaryKey: "id",
    rows: buildUsers(),
  },
  {
    name: "orders",
    columns: [
      { name: "id", type: "integer", nullable: false },
      { name: "user_id", type: "integer", nullable: false },
      { name: "status", type: "text", nullable: false },
      { name: "created_at", type: "timestamp", nullable: false },
    ],
    primaryKey: "id",
    rows: orders,
  },
  {
    name: "order_items",
    columns: [
      { name: "id", type: "integer", nullable: false },
      { name: "order_id", type: "integer", nullable: false },
      { name: "product", type: "text", nullable: false },
      { name: "quantity", type: "integer", nullable: false },
      { name: "unit_price", type: "numeric", nullable: false },
    ],
    primaryKey: "id",
    rows: buildOrderItems(orders),
  },
];

// The same tables and rows, plus the index the "indexOrderItems" fix creates.
const tablesWithIndex: TableDef[] = tables.map((table) =>
  table.name === "order_items" ? { ...table, indexes: ["order_id"] } : table,
);

export const world = (fixes: Fixes): TableDef[] =>
  fixes.indexOrderItems ? tablesWithIndex : tables;

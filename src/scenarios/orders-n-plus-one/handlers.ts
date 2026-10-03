import { db, type Handler, type Row, type Value } from "../../engine";
import { lines } from "./code";

export const listOrders: Handler = function* (ctx) {
  const at = lines(ctx.fixes);
  const userId = Number(ctx.req.params.id);
  if (!Number.isInteger(userId)) {
    return ctx.res.status(400).json({ error: "Invalid user id" }, { line: at.invalidId });
  }

  const orders: Row[] = yield db.select(
    "orders",
    { where: { user_id: userId }, orderBy: { column: "id" } },
    { line: at.selectOrders },
  );
  if (orders.length === 0) {
    return ctx.res.json({ userId, orders: [] }, { line: at.sendEmpty });
  }

  const itemsByOrder = new Map<Value, Row[]>();
  if (ctx.fixes.eagerLoad) {
    // One query for the items of every order.
    const items: Row[] = yield db.select(
      "order_items",
      { where: { order_id: { in: orders.map((order) => order.id ?? null) } } },
      { line: at.selectItems },
    );
    for (const item of items) {
      const list = itemsByOrder.get(item.order_id ?? null) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id ?? null, list);
    }
  } else {
    // One more query for every order.
    for (const order of orders) {
      const items: Row[] = yield db.select(
        "order_items",
        { where: { order_id: order.id ?? null } },
        { line: at.selectItems, groupKey: "order-items" },
      );
      itemsByOrder.set(order.id ?? null, items);
    }
  }

  return ctx.res.json(
    {
      userId,
      orders: orders.map((order) => ({ ...order, items: itemsByOrder.get(order.id ?? null) ?? [] })),
    },
    { line: at.send },
  );
};

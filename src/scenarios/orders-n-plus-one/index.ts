import type { Scenario } from "../../engine";
import { code, lines } from "./code";
import { fixes } from "./fixes";
import { listOrders } from "./handlers";
import { presets } from "./presets";
import { world } from "./world";

export const ordersNPlusOne: Scenario = {
  id: "orders-n-plus-one",
  name: "Orders: N+1 queries",
  description:
    "An endpoint that returns a user's orders with their items. It has two separate problems: N+1 round trips to the database, and a missing index on a foreign key. Each has its own fix.",
  why: [
    "N+1 means one query to load a list, then one more query for each item in it. Here that is 1 query for the orders and 50 for their items: 51 round trips to the database.",
    "Every query costs a round trip, even when the query itself is fast. With the index on, each item query takes about 1 ms and almost all of that is the round trip. Fifty of them still add up.",
    "The two fixes solve different problems. The index makes each item query cheap, because Postgres no longer reads all of `order_items` to find a few rows. Eager loading cuts the number of queries from 51 to 2 by asking for the items of every order at once with `WHERE order_id IN (...)`.",
    "Try each fix on its own, then both. The index alone leaves 51 round trips. Eager loading alone leaves one slow scan.",
    "ORMs cause N+1 easily. With lazy loading, touching `order.items` runs a hidden query, so a plain loop over the orders becomes one query per order.",
  ],
  world,
  code,
  // The display code changes with the fixes, so its line numbers do too.
  lines: (active) => ({ bodyParser: lines(active).bodyParser }),
  routes: (active) => [
    { method: "GET", path: "/users/:id/orders", handler: listOrders, line: lines(active).route },
  ],
  presets,
  fixes,
};

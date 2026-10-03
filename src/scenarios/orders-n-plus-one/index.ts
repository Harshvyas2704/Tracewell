import type { Scenario } from "../../engine";
import { code, lines } from "./code";
import { fixes } from "./fixes";
import { listOrders } from "./handlers";
import { presets } from "./presets";
import { world } from "./world";

// The lines used by the pipeline itself are the same in both code variants.
const shared = lines({});

export const ordersNPlusOne: Scenario = {
  id: "orders-n-plus-one",
  name: "Orders: N+1 queries",
  description:
    "An endpoint that returns a user's orders with their items. It works, but look at how many queries it takes.",
  world,
  code,
  lines: { bodyParser: shared.bodyParser },
  presets,
  fixes,
  routes: [{ method: "GET", path: "/users/:id/orders", handler: listOrders, line: shared.route }],
};

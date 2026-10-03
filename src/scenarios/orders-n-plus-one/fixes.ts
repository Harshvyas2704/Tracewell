import type { Fix } from "../../engine";

export const fixes: Fix[] = [
  {
    id: "eagerLoad",
    label: "Eager load items",
    description:
      "Load the items of all orders with one WHERE order_id IN (...) query instead of one query per order.",
  },
];

import type { Preset } from "../../engine";

export const presets: Preset[] = [
  {
    id: "user-orders",
    label: "User with 50 orders",
    description: "Loads every order of user 1 together with its items.",
    request: { method: "GET", path: "/users/1/orders" },
  },
  {
    id: "no-orders",
    label: "User with no orders",
    description: "User 999 has no orders, so there are no items to load.",
    request: { method: "GET", path: "/users/999/orders" },
  },
];

import type { Scenario } from "../engine";
import { ordersNPlusOne } from "./orders-n-plus-one";
import { productApi } from "./product-api";

// Scenario registry. Add new scenarios here.
export const scenarios: Scenario[] = [productApi, ordersNPlusOne];

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}

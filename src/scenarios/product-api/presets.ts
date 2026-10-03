import { fakeJwt, type Preset } from "../../engine";

const FAR_FUTURE = 9_999_999_999;
const adminToken = fakeJwt({ userId: 1, role: "admin", exp: FAR_FUTURE });
const userToken = fakeJwt({ userId: 2, role: "user", exp: FAR_FUTURE });

const json = { "Content-Type": "application/json" };
const asAdmin = { ...json, Authorization: `Bearer ${adminToken}` };
const body = (value: unknown) => JSON.stringify(value, null, 2);

const newProduct = { name: "Walnut Bookshelf", price: 129.5, stock: 12, category: "office" };

const create = (
  id: string,
  label: string,
  description: string,
  payload: unknown,
  headers: Record<string, string> = asAdmin,
): Preset => ({
  id,
  label,
  description,
  request: { method: "POST", path: "/products", headers, body: body(payload) },
});

export const presets: Preset[] = [
  {
    id: "get-product",
    label: "Get product",
    description: "Reads one product by its primary key.",
    request: { method: "GET", path: "/products/42" },
  },
  {
    id: "list-by-category",
    label: "List by category",
    description: "Filters on a column that has no index.",
    request: { method: "GET", path: "/products", query: { category: "audio", limit: "5" } },
  },
  create("valid", "Valid", "Creates a product as an admin.", newProduct),
  create("missing-field", "Missing field", "The body has no price.", {
    name: "Walnut Bookshelf",
    stock: 12,
    category: "office",
  }),
  create("invalid-value", "Invalid value", "The price is negative.", { ...newProduct, price: -5 }),
  {
    id: "not-found",
    label: "Not found",
    description: "Asks for a product id that does not exist.",
    request: { method: "GET", path: "/products/999999" },
  },
  create("no-token", "No token", "Sends no Authorization header.", newProduct, json),
  create("wrong-role", "Wrong role", "The token belongs to a normal user, not an admin.", newProduct, {
    ...json,
    Authorization: `Bearer ${userToken}`,
  }),
  create("duplicate-name", "Duplicate name", "The name is already used by product 42.", {
    ...newProduct,
    name: "Lunar Toaster",
  }),
];

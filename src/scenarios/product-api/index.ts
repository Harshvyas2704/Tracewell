import { requireAuth, validateBody, type Scenario } from "../../engine";
import { code, lines } from "./code";
import { createProduct, createProductSchema, getProduct, listProducts } from "./handlers";
import { presets } from "./presets";
import { world } from "./world";

export const productApi: Scenario = {
  id: "product-api",
  name: "Product API",
  description:
    "A small products API. Follow a request through body parsing, routing, auth, validation, the database and the response.",
  world,
  code,
  lines: { bodyParser: lines.bodyParser, errorHandler: lines.errorHandler },
  presets,
  routes: [
    { method: "GET", path: "/products/:id", handler: getProduct, line: lines.getRoute },
    { method: "GET", path: "/products", handler: listProducts, line: lines.listRoute },
    {
      method: "POST",
      path: "/products",
      middlewares: [
        requireAuth({ role: "admin", line: lines.auth }),
        validateBody(createProductSchema, { line: lines.validate }),
      ],
      handler: createProduct,
      line: lines.createRoute,
    },
  ],
};

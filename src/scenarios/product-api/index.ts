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
  why: [
    "A request passes through fixed stages. The body is parsed, the router picks a handler, middleware checks who is calling and what they sent, the handler talks to the database, and a response goes back. Any stage can end the request early.",
    "Here auth runs before validation. A caller without a valid token is turned away with `401` before the server spends time on the body, and learns nothing about which fields the endpoint expects.",
    "Validation runs before the handler, so the handler only ever sees data of the right shape. A bad body costs no database query.",
    "The error handler turns errors it recognises into a clear status: a unique violation (`23505`) becomes `409`. Anything it does not recognise becomes a plain `500` with no detail, because error messages can leak table names, queries and other internals.",
  ],
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

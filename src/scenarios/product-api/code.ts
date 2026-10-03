import { lineOf } from "../../engine";

// Display code. It is shown to the user and never executed. The handlers in
// handlers.ts do the same work and point at these lines.
export const code = `import express from "express";
import { z } from "zod";
import { db } from "./db.js";
import { requireAuth, validate } from "./middleware.js";

const app = express();
app.use(express.json());

app.get("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid product id" });
  }
  const { rows } = await db.query("SELECT * FROM products WHERE id = $1", [id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: "Product not found" });
  }
  res.json(rows[0]);
});

app.get("/products", async (req, res) => {
  const { category } = req.query;
  const limit = Number(req.query.limit) || 20;
  const { rows } = category
    ? await db.query(
        "SELECT * FROM products WHERE category = $1 ORDER BY id LIMIT $2",
        [category, limit],
      )
    : await db.query("SELECT * FROM products ORDER BY id LIMIT $1", [limit]);
  res.json({ count: rows.length, items: rows });
});

const createProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  stock: z.number().int().min(0),
  category: z.string().min(1),
});

app.post(
  "/products",
  requireAuth({ role: "admin" }),
  validate(createProductSchema),
  async (req, res) => {
    const { name, price, stock, category } = req.body;
    const { rows } = await db.query(
      "INSERT INTO products (name, price, stock, category) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, price, stock, category],
    );
    res.status(201).json(rows[0]);
  },
);

app.use((err, req, res, next) => {
  if (err.code === "23505") {
    return res.status(409).json({ error: "Resource already exists", detail: err.detail });
  }
  res.status(500).json({ error: "Internal Server Error" });
});
`;

const at = (snippet: string) => lineOf(code, snippet);

export const lines = {
  bodyParser: at("app.use(express.json())"),
  getRoute: at('app.get("/products/:id"'),
  invalidId: at("Invalid product id"),
  selectById: at("WHERE id = $1"),
  notFound: at("Product not found"),
  sendProduct: at("res.json(rows[0])"),
  listRoute: at('app.get("/products",'),
  selectByCategory: at("WHERE category = $1"),
  selectAll: at("FROM products ORDER BY id LIMIT $1"),
  sendList: at("res.json({ count"),
  createRoute: at("app.post("),
  auth: at("requireAuth({"),
  validate: at("validate(createProductSchema)"),
  insert: at("INSERT INTO products"),
  sendCreated: at("res.status(201)"),
  errorHandler: at("app.use((err"),
};

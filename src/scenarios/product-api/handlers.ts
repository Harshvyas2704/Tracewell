import { z } from "zod";
import { db, type Handler, type Row } from "../../engine";
import { lines } from "./code";

export const createProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  stock: z.number().int().min(0),
  category: z.string().min(1),
});

type CreateProduct = z.infer<typeof createProductSchema>;

export const getProduct: Handler = function* (ctx) {
  const id = Number(ctx.req.params.id);
  if (!Number.isInteger(id)) {
    return ctx.res.status(400).json({ error: "Invalid product id" }, { line: lines.invalidId });
  }
  const rows: Row[] = yield db.select("products", { where: { id } }, { line: lines.selectById });
  if (rows.length === 0) {
    return ctx.res.status(404).json({ error: "Product not found" }, { line: lines.notFound });
  }
  return ctx.res.json(rows[0], { line: lines.sendProduct });
};

export const listProducts: Handler = function* (ctx) {
  const { category } = ctx.req.query;
  const limit = Number(ctx.req.query.limit) || 20;
  const rows: Row[] = category
    ? yield db.select(
        "products",
        { where: { category }, orderBy: { column: "id" }, limit },
        { line: lines.selectByCategory },
      )
    : yield db.select(
        "products",
        { orderBy: { column: "id" }, limit },
        { line: lines.selectAll },
      );
  return ctx.res.json({ count: rows.length, items: rows }, { line: lines.sendList });
};

export const createProduct: Handler = function* (ctx) {
  const { name, price, stock, category } = ctx.req.body as CreateProduct;
  const rows: Row[] = yield db.insert(
    "products",
    { name, price, stock, category },
    { line: lines.insert },
  );
  return ctx.res.status(201).json(rows[0], { line: lines.sendCreated });
};

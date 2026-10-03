import type { ZodType } from "zod";
import { COST_CONFIG } from "../core/config";
import { trace } from "../core/effects";
import type { Middleware } from "../core/types";

// Validates the parsed body against a Zod schema. On success req.body becomes
// the validated DTO (unknown fields are dropped by the schema). On failure the
// request ends with a 400 and one message per field.
export function validateBody(schema: ZodType, options: { line?: number } = {}): Middleware {
  const line = options.line;

  return function* (ctx) {
    const raw = ctx.req.body;
    const result = schema.safeParse(raw);

    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        fields[issue.path.map(String).join(".") || "body"] ??= issue.message;
      }
      yield trace({
        stage: "validation",
        type: "VALIDATION_FAILED",
        label: `Validation failed: ${Object.keys(fields).join(", ")}`,
        status: "fail",
        ms: COST_CONFIG.validationMs,
        snapshot: { raw, fields },
        line,
      });
      return ctx.res.status(400).json({ error: "Validation failed", fields }, { line });
    }

    ctx.req.body = result.data;
    yield trace({
      stage: "validation",
      type: "VALIDATION_OK",
      label: "Body is valid",
      ms: COST_CONFIG.validationMs,
      snapshot: { raw, dto: result.data },
      line,
    });
  };
}

import { COST_CONFIG, ENGINE_CONFIG } from "../core/config";
import { trace } from "../core/effects";
import type { AuthUser, HandlerContext, HandlerGenerator, Middleware } from "../core/types";

export type TokenPayload = AuthUser & { exp: number }; // exp in Unix seconds

// A fake JWT: the payload as base64 JSON. There is no signature and no real
// crypto. It only models how a server reads claims from a token.
export function fakeJwt(payload: TokenPayload): string {
  return btoa(JSON.stringify(payload));
}

function decodeToken(token: string): TokenPayload | undefined {
  try {
    const payload = JSON.parse(atob(token)) as Partial<TokenPayload> | null;
    if (
      typeof payload?.userId === "number" &&
      typeof payload.role === "string" &&
      typeof payload.exp === "number"
    ) {
      return { userId: payload.userId, role: payload.role, exp: payload.exp };
    }
  } catch {
    // not base64, or not JSON
  }
  return undefined;
}

export type AuthOptions = {
  role?: string; // required role, any signed-in user when omitted
  line?: number;
};

// Checks the Authorization header. Missing, unreadable or expired tokens get
// 401. A valid token with the wrong role gets 403.
export function requireAuth(options: AuthOptions = {}): Middleware {
  const line = options.line;

  function* deny(
    ctx: HandlerContext,
    status: number,
    type: string,
    message: string,
  ): HandlerGenerator {
    yield trace({ stage: "auth", type, label: message, status: "fail", ms: COST_CONFIG.authMs, line });
    return ctx.res.status(status).json({ error: message }, { line });
  }

  return function* (ctx) {
    const header = ctx.req.headers.authorization;
    if (!header) {
      return yield* deny(ctx, 401, "AUTH_MISSING_TOKEN", "Missing Authorization header");
    }
    const payload = header.startsWith("Bearer ")
      ? decodeToken(header.slice("Bearer ".length).trim())
      : undefined;
    if (!payload) {
      return yield* deny(ctx, 401, "AUTH_INVALID_TOKEN", "Invalid token");
    }
    if (payload.exp <= ENGINE_CONFIG.nowEpochSeconds) {
      return yield* deny(ctx, 401, "AUTH_TOKEN_EXPIRED", "Token expired");
    }
    if (options.role && payload.role !== options.role) {
      return yield* deny(
        ctx,
        403,
        "AUTH_FORBIDDEN",
        `Requires role "${options.role}", token has role "${payload.role}"`,
      );
    }

    const user: AuthUser = { userId: payload.userId, role: payload.role };
    ctx.req.user = user;
    yield trace({
      stage: "auth",
      type: "AUTH_OK",
      label: `Token valid: user ${user.userId}, role "${user.role}"`,
      ms: COST_CONFIG.authMs,
      snapshot: { user },
      line,
    });
  };
}

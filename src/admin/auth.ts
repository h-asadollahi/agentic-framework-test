import type { Context, MiddlewareHandler } from "hono";

function parseCsvSet(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function getRequestIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = c.req.header("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  return "unknown";
}

function getBearerToken(c: Context): string | null {
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }

  const fallback = c.req.header("x-admin-token");
  return fallback?.trim() || null;
}

export function isAdminRequestAuthorized(c: Context): {
  allowed: boolean;
  reason?: string;
} {
  const allowedIps = parseCsvSet(process.env.ADMIN_ALLOWED_IPS);
  const token = process.env.ADMIN_API_TOKEN?.trim();

  const requestIp = getRequestIp(c);
  if (allowedIps.has("*") || allowedIps.has(requestIp)) {
    return { allowed: true };
  }

  if (token) {
    const provided = getBearerToken(c);
    if (provided === token) {
      return { allowed: true };
    }
    return { allowed: false, reason: "Invalid admin token" };
  }

  if (allowedIps.size === 0) {
    return {
      allowed: false,
      reason: "Admin auth is not configured (set ADMIN_ALLOWED_IPS or ADMIN_API_TOKEN)",
    };
  }

  return { allowed: false, reason: `IP ${requestIp} is not in ADMIN_ALLOWED_IPS` };
}

export function createAdminAuthMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const auth = isAdminRequestAuthorized(c);
    if (!auth.allowed) {
      return c.json(
        {
          error: "Forbidden",
          detail: auth.reason ?? "Not authorized for admin endpoints",
        },
        403
      );
    }

    await next();
  };
}


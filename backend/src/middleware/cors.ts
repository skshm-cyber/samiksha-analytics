import { Env } from "../types";

/**
 * Build CORS headers based on allowed origins.
 *
 * Strict allowlist: only origins listed in the CORS_ORIGINS secret are
 * allowed (plus localhost for development). No wildcard fallbacks.
 */
export function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed = (env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isAllowed =
    !!origin &&
    (allowed.includes(origin) ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1"));

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (isAllowed) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

/** Create a JSON response with CORS headers. */
export function jsonResponse(
  env: Env,
  data: unknown,
  status: number = 200,
  origin: string | null = null
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env, origin),
    },
  });
}

/** Create an error response. */
export function errorResponse(
  env: Env,
  message: string,
  status: number = 400,
  origin: string | null = null
): Response {
  return jsonResponse(env, { error: message }, status, origin);
}
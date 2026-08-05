import { Env } from "../types";

/**
 * Build CORS headers based on allowed origins.
 */
export function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed = (env.CORS_ORIGINS || "").split(",").map((s) => s.trim());
  const isAllowed =
    !origin ||
    allowed.includes(origin) ||
    origin.endsWith(".workers.dev") ||
    origin.endsWith(".pages.dev") ||
    origin.includes("localhost");

  return {
    "Access-Control-Allow-Origin": isAllowed ? (origin || "*") : allowed[0] || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
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

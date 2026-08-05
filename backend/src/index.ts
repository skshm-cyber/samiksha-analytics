import { Env } from "./types";
import { corsHeaders, jsonResponse, errorResponse } from "./middleware/cors";
import { checkRateLimit } from "./middleware/rateLimit";
import { handleTrack } from "./routes/track";
import { handleEvent } from "./routes/event";
import {
  handleOverview,
  handleSecondary,
  handleHourly,
  handlePages,
  handleReferrers,
  handleBrowsers,
  handleDevices,
  handleOS,
  handleLive,
  handleTrends,
  handleEvents,
  handleEventsSummary,
  handleDaily,
  handleCountries,
  handleCities,
} from "./routes/analytics";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get("Origin");

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env, origin),
      });
    }

    // ── Rate limiting ───────────────────────────────────────────────────────
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { allowed, remaining } = checkRateLimit(ip);
    if (!allowed) {
      return errorResponse(env, "Rate limit exceeded. Try again later.", 429, origin);
    }

    // ── Router ──────────────────────────────────────────────────────────────
    try {
      // Ingestion endpoints (POST only)
      if (path === "/api/track" && method === "POST") {
        return await handleTrack(request, env);
      }
      if (path === "/api/event" && method === "POST") {
        return await handleEvent(request, env);
      }

      // Analytics endpoints (GET only)
      if (path === "/api/stats/overview" && method === "GET") {
        return await handleOverview(request, env);
      }
      if (path === "/api/stats/secondary" && method === "GET") {
        return await handleSecondary(request, env);
      }
      if (path === "/api/stats/hourly" && method === "GET") {
        return await handleHourly(request, env);
      }
      if (path === "/api/stats/pages" && method === "GET") {
        return await handlePages(request, env);
      }
      if (path === "/api/stats/referrers" && method === "GET") {
        return await handleReferrers(request, env);
      }
      if (path === "/api/stats/browsers" && method === "GET") {
        return await handleBrowsers(request, env);
      }
      if (path === "/api/stats/devices" && method === "GET") {
        return await handleDevices(request, env);
      }
      if (path === "/api/stats/os" && method === "GET") {
        return await handleOS(request, env);
      }
      if (path === "/api/stats/live" && method === "GET") {
        return await handleLive(request, env);
      }
      if (path === "/api/stats/trends" && method === "GET") {
        return await handleTrends(request, env);
      }
      if (path === "/api/stats/events" && method === "GET") {
        // Check if it's /api/stats/events/summary
        if (url.searchParams.has("summary") || path === "/api/stats/events/summary") {
          return await handleEventsSummary(request, env);
        }
        return await handleEvents(request, env);
      }
      if (path === "/api/stats/events/summary" && method === "GET") {
        return await handleEventsSummary(request, env);
      }
      if (path === "/api/stats/daily" && method === "GET") {
        return await handleDaily(request, env);
      }
      if (path === "/api/stats/countries" && method === "GET") {
        return await handleCountries(request, env);
      }
      if (path === "/api/stats/cities" && method === "GET") {
        return await handleCities(request, env);
      }

      // Health check
      if (path === "/health") {
        return jsonResponse(env, { status: "healthy", service: "samiksha-analytics-api" }, 200, origin);
      }

      // Debug — check if env vars are set (remove after testing)
      if (path === "/debug") {
        return jsonResponse(env, {
          hasSupabaseUrl: !!env.SUPABASE_URL,
          hasSupabaseKey: !!env.SUPABASE_ANON_KEY,
          hasCors: !!env.CORS_ORIGINS,
          supabaseUrl: env.SUPABASE_URL ? env.SUPABASE_URL.slice(0, 30) + "..." : "MISSING",
        }, 200, origin);
      }

      // Root
      if (path === "/") {
        return jsonResponse(env, {
          service: "Samiksha Analytics API",
          version: "1.0.0",
          docs: "https://github.com/skshm-cyber/samiksha-analytics#api-reference",
          health: "/health",
        }, 200, origin);
      }

      return errorResponse(env, "Not Found", 404, origin);
    } catch (err) {
      console.error("Unhandled error:", err);
      return jsonResponse(env, { error: "Internal Server Error", details: String(err) }, 500, origin);
    }
  },
};

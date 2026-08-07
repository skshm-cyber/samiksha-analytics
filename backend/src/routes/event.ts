import { Env, EventPayload } from "../types";
import { supabaseInsert, supabaseQuery } from "../services/supabase";
import { jsonResponse, errorResponse } from "../middleware/cors";

/**
 * POST /api/event — Receive interaction event from tracker.js
 *
 * Events: button_click, form_submit, link_click, file_download, page_leave
 */
export async function handleEvent(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  let body: EventPayload;

  try {
    body = await request.json();
  } catch {
    return errorResponse(env, "Invalid JSON", 400, origin);
  }

  if (!body.visitor_id || !body.session_id || !body.event_type) {
    return errorResponse(env, "Missing required fields", 400, origin);
  }

  const now = new Date().toISOString();

  // If this is a page_leave event with time/scroll data, update the last page_view
  if (body.event_type === "page_leave" && (body.time_on_page || body.scroll_percentage)) {
    const pvRows = await supabaseQuery<{ id: string }>(env, "page_views", {
      visitor_id: `eq.${body.visitor_id}`,
      session_id: `eq.${body.session_id}`,
      order: "timestamp.desc",
      limit: "1",
      select: "id",
    });

    if (pvRows.length > 0) {
      const url = `${env.SUPABASE_URL}/rest/v1/page_views?id=eq.${pvRows[0].id}`;
      await fetch(url, {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          time_on_page: body.time_on_page || 0,
          scroll_percentage: body.scroll_percentage || 0,
        }),
      });
    }

    // Also update session duration — ACCUMULATE across pages, don't overwrite
    const sessRows = await supabaseQuery<{ id: string; duration_seconds: number }>(env, "sessions", {
      session_id: `eq.${body.session_id}`,
      select: "id,duration_seconds",
    });
    if (sessRows.length > 0 && body.time_on_page && body.time_on_page > 0) {
      const current = Number(sessRows[0].duration_seconds) || 0;
      const url = `${env.SUPABASE_URL}/rest/v1/sessions?session_id=eq.${body.session_id}`;
      await fetch(url, {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ duration_seconds: Math.round((current + body.time_on_page) * 10) / 10 }),
      });
    }
  }

  // Insert the event
  let result = await supabaseInsert(env, "events", {
    visitor_id: body.visitor_id,
    session_id: body.session_id,
    timestamp: body.timestamp || now,
    event_type: body.event_type,
    event_target: body.event_target || "",
    page_url: body.page_url || "",
    properties: body.properties || {},
  });

  // Self-heal: if the visitor row doesn't exist yet (event beat /api/track),
  // create it and retry the insert once.
  if (!result.ok && result.error && result.error.includes("events_visitor_id_fkey")) {
    const visResult = await supabaseInsert(env, "visitors", {
      visitor_id: body.visitor_id,
      first_seen: body.timestamp || now,
      last_seen: now,
    });
    if (visResult.ok) {
      result = await supabaseInsert(env, "events", {
        visitor_id: body.visitor_id,
        session_id: body.session_id,
        timestamp: body.timestamp || now,
        event_type: body.event_type,
        event_target: body.event_target || "",
        page_url: body.page_url || "",
        properties: body.properties || {},
      });
    }
  }

  if (!result.ok) {
    return errorResponse(env, "Failed to store event", 500, origin);
  }

  return jsonResponse(env, { status: "ok" }, 200, origin);
}

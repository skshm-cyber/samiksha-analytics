import { Env, TrackPayload } from "../types";
import { supabaseInsert, supabaseQuery } from "../services/supabase";
import { jsonResponse, errorResponse } from "../middleware/cors";

/**
 * POST /api/track — Receive page view from tracker.js
 *
 * Flow:
 * 1. Validate the payload
 * 2. Upsert visitor (create if new, update last_seen)
 * 3. Upsert session (create if new, update page_count)
 * 4. Insert page_view row
 * 5. Insert device row
 */
export async function handleTrack(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  let body: TrackPayload;

  try {
    body = await request.json();
  } catch {
    return errorResponse(env, "Invalid JSON", 400, origin);
  }

  // Validate required fields
  if (!body.visitor_id || !body.session_id || !body.page_url) {
    return errorResponse(env, "Missing required fields: visitor_id, session_id, page_url", 400, origin);
  }

  const now = new Date().toISOString();

  // 1. Upsert visitor
  await supabaseQuery(env, "visitors", {
    visitor_id: `eq.${body.visitor_id}`,
    select: "visitor_id",
  });

  // Try to get existing visitor
  const existingVisitor = await supabaseQuery(env, "visitors", {
    visitor_id: `eq.${body.visitor_id}`,
    select: "visitor_id",
  });

  if (existingVisitor.length === 0) {
    // Create new visitor
    await supabaseInsert(env, "visitors", {
      visitor_id: body.visitor_id,
      first_seen: body.timestamp || now,
      last_seen: now,
    });
  } else {
    // Update last_seen via PATCH
    const url = `${env.SUPABASE_URL}/rest/v1/visitors?visitor_id=eq.${body.visitor_id}`;
    await fetch(url, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ last_seen: now }),
    });
  }

  // 2. Upsert session
  const existingSession = await supabaseQuery(env, "sessions", {
    session_id: `eq.${body.session_id}`,
    select: "session_id,page_count",
  });

  if (existingSession.length === 0) {
    await supabaseInsert(env, "sessions", {
      session_id: body.session_id,
      visitor_id: body.visitor_id,
      started_at: body.timestamp || now,
      entry_page: body.page_url,
      exit_page: body.page_url,
      page_count: 1,
      is_bounce: true,
      referrer: body.referrer || "",
      utm_source: body.utm_source || "",
      utm_campaign: body.utm_campaign || "",
    });
  } else {
    const pageCount = (existingSession[0] as Record<string, unknown>).page_count as number;
    const url = `${env.SUPABASE_URL}/rest/v1/sessions?session_id=eq.${body.session_id}`;
    await fetch(url, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        exit_page: body.page_url,
        page_count: pageCount + 1,
        is_bounce: pageCount + 1 <= 1,
      }),
    });
  }

  // 3. Insert page view
  const pvResult = await supabaseInsert(env, "page_views", {
    visitor_id: body.visitor_id,
    session_id: body.session_id,
    timestamp: body.timestamp || now,
    page_url: body.page_url,
    page_title: body.page_title || "",
    referrer: body.referrer || "",
    is_first_visit: body.is_first_visit === 1,
    scroll_percentage: body.scroll_percentage || 0,
    time_on_page: body.time_on_page || 0,
    utm_source: body.utm_source || "",
    utm_medium: body.utm_medium || "",
    utm_campaign: body.utm_campaign || "",
    utm_content: body.utm_content || "",
  });

  // 4. Insert device — we need the page_view ID
  // Query for the just-inserted page view to get its ID
  const pvRows = await supabaseQuery<{ id: string }>(env, "page_views", {
    visitor_id: `eq.${body.visitor_id}`,
    session_id: `eq.${body.session_id}`,
    order: "timestamp.desc",
    limit: "1",
    select: "id",
  });

  if (pvRows.length > 0) {
    await supabaseInsert(env, "devices", {
      page_view_id: pvRows[0].id,
      browser: body.browser || "",
      browser_version: body.browser_version || "",
      os: body.os || "",
      device_type: body.device_type || "",
      screen_width: body.screen_width || 0,
      screen_height: body.screen_height || 0,
      language: body.language || "",
      timezone: body.timezone || "",
    });

    // 4b. Fill geo from Cloudflare's CF-IPCountry header when present
    const country = request.headers.get("CF-IPCountry");
    if (country && country !== "XX" && country !== "T1") {
      await supabaseInsert(env, "locations", {
        page_view_id: pvRows[0].id,
        country,
        city: "",
        latitude: null,
        longitude: null,
      });
    }
  }

  return jsonResponse(env, { status: "ok" }, 200, origin);
}

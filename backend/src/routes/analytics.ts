import { Env } from "../types";
import { supabaseQuery } from "../services/supabase";
import { jsonResponse, errorResponse } from "../middleware/cors";
import { getWindow, istDateStr, istHour } from "../utils/time";

// ── helpers ──────────────────────────────────────────────────────────────────

function bookingVisitors(events: Record<string, unknown>[]): Set<string> {
  const booked = new Set<string>();
  for (const e of events) {
    const vid = e.visitor_id as string;
    const type = e.event_type as string;
    const props = (e.properties as Record<string, unknown>) || {};
    const target = (e.event_target as string) || "";
    if (type === "cta_click") {
      const t = props.target as string;
      if (t === "whatsapp" || t === "form" || t === "card-cta") booked.add(vid);
    } else if (type === "link_click" && target.includes("wa.me")) {
      booked.add(vid);
    } else if (type === "form_submit") {
      booked.add(vid);
    }
  }
  return booked;
}

// ── GET /api/stats/overview ──────────────────────────────────────────────────

export async function handleOverview(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url, 1);
  const range = { timestamp: [`gte.${start}`, `lte.${end}`] };

  const [visitors, pageViews, sessions] = await Promise.all([
    supabaseQuery(env, "page_views", { ...range, select: "visitor_id" }),
    supabaseQuery(env, "page_views", { ...range, select: "id" }),
    supabaseQuery(env, "sessions", { started_at: [`gte.${start}`, `lte.${end}`], select: "session_id" }),
  ]);

  // Unique visitors
  const uniqueVisitors = new Set(visitors.map((r) => r.visitor_id)).size;

  // Live = active in last 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const liveRows = await supabaseQuery(env, "page_views", {
    timestamp: `gte.${fiveMinAgo}`,
    select: "visitor_id",
  });
  const liveCount = new Set(liveRows.map((r) => r.visitor_id)).size;

  return jsonResponse(env, {
    visitors_today: uniqueVisitors,
    live_visitors: liveCount,
    page_views_today: pageViews.length,
    sessions_today: sessions.length,
  }, 200, origin);
}

// ── GET /api/stats/secondary ─────────────────────────────────────────────────

export async function handleSecondary(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url, 1);

  const [visitors, sessions, events] = await Promise.all([
    supabaseQuery(env, "page_views", {
      timestamp: [`gte.${start}`, `lte.${end}`],
      select: "visitor_id,is_first_visit",
    }),
    supabaseQuery(env, "sessions", {
      started_at: [`gte.${start}`, `lte.${end}`],
      select: "session_id,is_bounce,duration_seconds",
    }),
    supabaseQuery(env, "events", {
      timestamp: [`gte.${start}`, `lte.${end}`],
      select: "visitor_id,event_type,event_target,properties",
    }),
  ]);

  const uniqueVisitors = new Set(visitors.map((r) => r.visitor_id)).size;
  const newVisitors = new Set(
    visitors.filter((r) => r.is_first_visit === true).map((r) => r.visitor_id)
  ).size;
  const returningVisitors = uniqueVisitors - newVisitors;

  const totalSessions = sessions.length;
  const bounced = sessions.filter((r) => r.is_bounce === true).length;
  const bounceRate = totalSessions > 0 ? (bounced / totalSessions) * 100 : 0;

  const totalDuration = sessions.reduce((sum, r) => sum + ((r.duration_seconds as number) || 0), 0);
  const avgDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;

  const booked = bookingVisitors(events).size;
  const conversionRate = uniqueVisitors > 0 ? (booked / uniqueVisitors) * 100 : 0;

  return jsonResponse(env, {
    unique_visitors_today: uniqueVisitors,
    avg_session_duration: Math.round(avgDuration * 10) / 10,
    bounce_rate: Math.round(bounceRate * 10) / 10,
    conversion_rate: Math.round(conversionRate * 10) / 10,
    returning_visitors_today: returningVisitors,
    new_visitors_today: newVisitors,
  }, 200, origin);
}

// ── GET /api/stats/hourly ────────────────────────────────────────────────────

export async function handleHourly(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);

  const rows = await supabaseQuery(env, "page_views", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    select: "timestamp",
  });

  const hourMap = new Map<number, number>();
  for (let h = 0; h < 24; h++) hourMap.set(h, 0);

  for (const row of rows) {
    const hour = istHour(row.timestamp as string);
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
  }

  return jsonResponse(env, {
    hourly: Array.from(hourMap.entries()).map(([hour, visits]) => ({ hour, visits })),
  }, 200, origin);
}

// ── GET /api/stats/pages ─────────────────────────────────────────────────────

export async function handlePages(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const rows = await supabaseQuery(env, "page_views", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    select: "page_url,visitor_id,time_on_page,scroll_percentage",
  });

  // Group by page_url
  const pageMap = new Map<string, { visits: number; visitors: Set<string>; totalTime: number; totalScroll: number }>();
  for (const row of rows) {
    const url = row.page_url as string;
    if (!pageMap.has(url)) {
      pageMap.set(url, { visits: 0, visitors: new Set(), totalTime: 0, totalScroll: 0 });
    }
    const entry = pageMap.get(url)!;
    entry.visits++;
    entry.visitors.add(row.visitor_id as string);
    entry.totalTime += (row.time_on_page as number) || 0;
    entry.totalScroll += (row.scroll_percentage as number) || 0;
  }

  const pages = Array.from(pageMap.entries())
    .map(([page_url, data]) => ({
      page_url,
      visits: data.visits,
      unique_visitors: data.visitors.size,
      avg_time_on_page: Math.round((data.totalTime / data.visits) * 10) / 10,
      avg_scroll: Math.round(data.totalScroll / data.visits),
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit);

  return jsonResponse(env, { pages }, 200, origin);
}

// ── GET /api/stats/referrers ─────────────────────────────────────────────────

export async function handleReferrers(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);

  const rows = await supabaseQuery(env, "page_views", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    select: "referrer",
    referrer: "not.is.null",
  });

  const refMap = new Map<string, number>();
  for (const row of rows) {
    const ref = (row.referrer as string) || "";
    if (ref && ref !== "") {
      refMap.set(ref, (refMap.get(ref) || 0) + 1);
    }
  }

  const referrers = Array.from(refMap.entries())
    .map(([referrer, visits]) => ({ referrer, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit);

  return jsonResponse(env, { referrers }, 200, origin);
}

// ── GET /api/stats/browsers ──────────────────────────────────────────────────

export async function handleBrowsers(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);

  // Get page view IDs from the time range, then get devices
  const pvs = await supabaseQuery<{ id: string }>(env, "page_views", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    select: "id",
  });
  if (pvs.length === 0) return jsonResponse(env, { browsers: [] }, 200, origin);

  const pvIds = pvs.map((r) => r.id).slice(0, 1000); // limit for PostgREST 'in' filter
  const devices = await supabaseQuery(env, "devices", {
    page_view_id: `in.(${pvIds.join(",")})`,
    select: "browser",
    browser: "not.is.null",
  });

  const browserMap = new Map<string, number>();
  for (const d of devices) {
    const b = (d.browser as string) || "Unknown";
    if (b) browserMap.set(b, (browserMap.get(b) || 0) + 1);
  }

  const total = Array.from(browserMap.values()).reduce((s, v) => s + v, 0) || 1;
  const browsers = Array.from(browserMap.entries())
    .map(([browser, count]) => ({ browser, count, percentage: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);

  return jsonResponse(env, { browsers }, 200, origin);
}

// ── GET /api/stats/devices ───────────────────────────────────────────────────

export async function handleDevices(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);

  const pvs = await supabaseQuery<{ id: string }>(env, "page_views", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    select: "id",
  });
  if (pvs.length === 0) return jsonResponse(env, { devices: [] }, 200, origin);

  const pvIds = pvs.map((r) => r.id).slice(0, 1000);
  const devices = await supabaseQuery(env, "devices", {
    page_view_id: `in.(${pvIds.join(",")})`,
    select: "device_type",
    device_type: "not.is.null",
  });

  const deviceMap = new Map<string, number>();
  for (const d of devices) {
    const dt = (d.device_type as string) || "Unknown";
    if (dt) deviceMap.set(dt, (deviceMap.get(dt) || 0) + 1);
  }

  const total = Array.from(deviceMap.values()).reduce((s, v) => s + v, 0) || 1;
  const result = Array.from(deviceMap.entries())
    .map(([device_type, count]) => ({ device_type, count, percentage: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);

  return jsonResponse(env, { devices: result }, 200, origin);
}

// ── GET /api/stats/os ────────────────────────────────────────────────────────

export async function handleOS(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);

  const pvs = await supabaseQuery<{ id: string }>(env, "page_views", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    select: "id",
  });
  if (pvs.length === 0) return jsonResponse(env, { os: [] }, 200, origin);

  const pvIds = pvs.map((r) => r.id).slice(0, 1000);
  const devices = await supabaseQuery(env, "devices", {
    page_view_id: `in.(${pvIds.join(",")})`,
    select: "os",
    os: "not.is.null",
  });

  const osMap = new Map<string, number>();
  for (const d of devices) {
    const os = (d.os as string) || "Unknown";
    if (os) osMap.set(os, (osMap.get(os) || 0) + 1);
  }

  const total = Array.from(osMap.values()).reduce((s, v) => s + v, 0) || 1;
  const result = Array.from(osMap.entries())
    .map(([os, count]) => ({ os, count, percentage: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);

  return jsonResponse(env, { os: result }, 200, origin);
}

// ── GET /api/stats/live ──────────────────────────────────────────────────────

export async function handleLive(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();

  const pvs = await supabaseQuery(env, "page_views", {
    timestamp: `gte.${fiveMinAgo}`,
    select: "visitor_id,page_url,timestamp",
    order: "timestamp.desc",
  });

  // Deduplicate by visitor_id
  const seen = new Set<string>();
  const visitors: Record<string, unknown>[] = [];
  for (const pv of pvs) {
    const vid = pv.visitor_id as string;
    if (!seen.has(vid)) {
      seen.add(vid);
      visitors.push({
        visitor_id: vid,
        last_page: pv.page_url,
        last_seen: pv.timestamp,
      });
    }
  }

  return jsonResponse(env, { visitors }, 200, origin);
}

// ── GET /api/stats/trends ────────────────────────────────────────────────────

export async function handleTrends(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url, 30);

  const [rows, sessionRows] = await Promise.all([
    supabaseQuery(env, "page_views", {
      timestamp: [`gte.${start}`, `lte.${end}`],
      select: "timestamp,visitor_id",
    }),
    supabaseQuery(env, "sessions", {
      started_at: [`gte.${start}`, `lte.${end}`],
      select: "started_at",
    }),
  ]);

  // Group by date (IST)
  const dayMap = new Map<string, { visitors: Set<string>; views: number; sessions: number }>();
  for (const row of rows) {
    const dateStr = istDateStr(row.timestamp as string);
    if (!dayMap.has(dateStr)) {
      dayMap.set(dateStr, { visitors: new Set(), views: 0, sessions: 0 });
    }
    const entry = dayMap.get(dateStr)!;
    entry.visitors.add(row.visitor_id as string);
    entry.views++;
  }
  for (const s of sessionRows) {
    const dateStr = istDateStr(s.started_at as string);
    if (!dayMap.has(dateStr)) dayMap.set(dateStr, { visitors: new Set(), views: 0, sessions: 0 });
    dayMap.get(dateStr)!.sessions++;
  }

  const trends = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      visitors: data.visitors.size,
      page_views: data.views,
      sessions: data.sessions,
    }));

  return jsonResponse(env, { trends }, 200, origin);
}

// ── GET /api/stats/events ────────────────────────────────────────────────────

export async function handleEvents(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);

  const events = await supabaseQuery(env, "events", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    order: "timestamp.desc",
    limit: String(limit),
  });

  return jsonResponse(env, { events }, 200, origin);
}

// ── GET /api/stats/events/summary ────────────────────────────────────────────

export async function handleEventsSummary(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);

  const events = await supabaseQuery(env, "events", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    select: "event_type",
  });

  const typeMap = new Map<string, number>();
  for (const e of events) {
    const t = (e.event_type as string) || "unknown";
    typeMap.set(t, (typeMap.get(t) || 0) + 1);
  }

  const result = Array.from(typeMap.entries())
    .map(([event_type, count]) => ({ event_type, count }))
    .sort((a, b) => b.count - a.count);

  return jsonResponse(env, { events: result }, 200, origin);
}

// ── GET /api/stats/daily ─────────────────────────────────────────────────────

export async function handleDaily(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url, 30);

  const [pageViews, sessions] = await Promise.all([
    supabaseQuery(env, "page_views", {
      timestamp: [`gte.${start}`, `lte.${end}`],
      select: "timestamp,visitor_id",
    }),
    supabaseQuery(env, "sessions", {
      started_at: [`gte.${start}`, `lte.${end}`],
      select: "started_at,is_bounce,duration_seconds",
    }),
  ]);

  // Group page views by date (IST)
  const pvByDate = new Map<string, { visitors: Set<string>; views: number }>();
  for (const pv of pageViews) {
    const d = istDateStr(pv.timestamp as string);
    if (!pvByDate.has(d)) pvByDate.set(d, { visitors: new Set(), views: 0 });
    const entry = pvByDate.get(d)!;
    entry.visitors.add(pv.visitor_id as string);
    entry.views++;
  }

  // Group sessions by date (IST)
  const sessByDate = new Map<string, { total: number; bounced: number; duration: number }>();
  for (const s of sessions) {
    const d = istDateStr(s.started_at as string);
    if (!sessByDate.has(d)) sessByDate.set(d, { total: 0, bounced: 0, duration: 0 });
    const entry = sessByDate.get(d)!;
    entry.total++;
    if (s.is_bounce) entry.bounced++;
    entry.duration += (s.duration_seconds as number) || 0;
  }

  // Merge
  const allDates = new Set([...pvByDate.keys(), ...sessByDate.keys()]);
  const daily = Array.from(allDates)
    .sort()
    .map((date) => {
      const pv = pvByDate.get(date);
      const sess = sessByDate.get(date);
      return {
        date,
        visitors: pv ? pv.visitors.size : 0,
        page_views: pv ? pv.views : 0,
        sessions: sess ? sess.total : 0,
        bounce_rate: sess && sess.total > 0 ? Math.round((sess.bounced / sess.total) * 1000) / 10 : 0,
        avg_duration: sess && sess.total > 0 ? Math.round((sess.duration / sess.total) * 10) / 10 : 0,
      };
    });

  return jsonResponse(env, { daily }, 200, origin);
}

// ── GET /api/stats/countries ─────────────────────────────────────────────────

export async function handleCountries(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const pvs = await supabaseQuery<{ id: string }>(env, "page_views", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    select: "id",
  });
  if (pvs.length === 0) return jsonResponse(env, { countries: [] }, 200, origin);

  const pvIds = pvs.map((r) => r.id).slice(0, 1000);
  const locs = await supabaseQuery(env, "locations", {
    page_view_id: `in.(${pvIds.join(",")})`,
    select: "country",
    country: "not.is.null",
  });

  const countryMap = new Map<string, number>();
  for (const l of locs) {
    const c = (l.country as string) || "";
    if (c) countryMap.set(c, (countryMap.get(c) || 0) + 1);
  }

  const countries = Array.from(countryMap.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return jsonResponse(env, { countries }, 200, origin);
}

// ── GET /api/stats/cities ────────────────────────────────────────────────────

export async function handleCities(
  request: Request,
  env: Env
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const pvs = await supabaseQuery<{ id: string }>(env, "page_views", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    select: "id",
  });
  if (pvs.length === 0) return jsonResponse(env, { cities: [] }, 200, origin);

  const pvIds = pvs.map((r) => r.id).slice(0, 1000);
  const locs = await supabaseQuery(env, "locations", {
    page_view_id: `in.(${pvIds.join(",")})`,
    select: "city,country",
    city: "not.is.null",
  });

  const cityMap = new Map<string, { country: string; count: number }>();
  for (const l of locs) {
    const city = (l.city as string) || "";
    if (city) {
      const existing = cityMap.get(city);
      if (existing) {
        existing.count++;
      } else {
        cityMap.set(city, { country: l.country as string, count: 1 });
      }
    }
  }

  const cities = Array.from(cityMap.entries())
    .map(([city, data]) => ({ city, country: data.country, count: data.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return jsonResponse(env, { cities }, 200, origin);
}

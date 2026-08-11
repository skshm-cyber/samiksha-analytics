import { Env } from "../types";
import { supabaseQuery } from "../services/supabase";
import { jsonResponse } from "../middleware/cors";
import { getWindow } from "../utils/time";

// ── helpers ──────────────────────────────────────────────────────────────────

function getIntParam(url: URL, key: string, def: number): number {
  const v = parseInt(url.searchParams.get(key) || String(def), 10);
  return isNaN(v) || v < 1 ? def : v;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

// ── GET /api/stats/cards ─────────────────────────────────────────────────────
// Which pricing cards (readings) people click, and how often that leads to a
// booking CTA. Grouped by plan name from event properties.

interface CardAcc {
  clicks: number;
  ctas: number;
  sessions: Set<string>;
  visitors: Set<string>;
  category: string;
  price: number | null;
  currency: string;
  duration: string;
  badge: string;
}

export async function handleCards(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);

  const events = await supabaseQuery<Record<string, unknown>>(env, "events", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    event_type: `in.(pricing_card_click,cta_click)`,
    order: "timestamp.asc",
    select: "session_id,visitor_id,event_type,event_target,properties,page_url,timestamp",
  });

  const cardMap = new Map<string, CardAcc>();
  const lastCardSession = new Map<string, string>();
  const ctaSessions = new Set<string>();

  for (const e of events) {
    const props = (e.properties as Record<string, unknown>) || {};
    const type = e.event_type as string;
    const session = (e.session_id as string) || "";
    const visitor = (e.visitor_id as string) || "";

    if (type === "pricing_card_click") {
      const name = (props.name as string) || (e.event_target as string) || "Unknown";
      if (!cardMap.has(name)) {
        cardMap.set(name, {
          clicks: 0,
          ctas: 0,
          sessions: new Set(),
          visitors: new Set(),
          category: (props.category as string) || "",
          price: typeof props.price === "number" ? props.price : null,
          currency: (props.currency as string) || "INR",
          duration: (props.duration as string) || "",
          badge: (props.badge as string) || "",
        });
      }
      const c = cardMap.get(name)!;
      c.clicks++;
      if (session) {
        c.sessions.add(session);
        lastCardSession.set(session, name);
      }
      if (visitor) c.visitors.add(visitor);
    } else if (type === "cta_click") {
      const plan = (props.plan as string) || "";
      const target = (props.target as string) || "";
      // Attribute the CTA to a card: explicit plan → last card clicked in session
      let attributed = plan && cardMap.has(plan) ? plan : "";
      if (!attributed && session) attributed = lastCardSession.get(session) || "";
      if (attributed && cardMap.has(attributed)) {
        cardMap.get(attributed)!.ctas++;
      }
      if (target === "whatsapp" || target === "form") {
        if (session) ctaSessions.add(session);
      }
    }
  }

  const cards = Array.from(cardMap.entries())
    .map(([name, d]) => ({
      name,
      category: d.category,
      clicks: d.clicks,
      unique_visitors: d.visitors.size,
      ctas: d.ctas,
      cta_rate: pct(d.ctas, d.clicks),
      price: d.price,
      currency: d.currency,
      duration: d.duration,
      badge: d.badge,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 25);

  const metaDays = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
  return jsonResponse(env, { cards, meta: { days: metaDays, cta_sessions: ctaSessions.size } }, 200, origin);
}

// ── GET /api/stats/funnel ────────────────────────────────────────────────────
// Visitor → reached pricing → clicked a reading → took a booking action.
// All steps count unique VISITORS (mapped from sessions via page_views/events).

export async function handleFunnel(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);

  const [pageViews, userEvents] = await Promise.all([
    supabaseQuery<Record<string, unknown>>(env, "page_views", {
      timestamp: [`gte.${start}`, `lte.${end}`],
      select: "visitor_id,session_id,page_url",
    }),
    supabaseQuery<Record<string, unknown>>(env, "events", {
      timestamp: [`gte.${start}`, `lte.${end}`],
      select: "visitor_id,session_id,event_type,event_target,properties",
    }),
  ]);

  const visitors = new Set<string>();
  const pricingVisitors = new Set<string>();
  const cardVisitors = new Set<string>();
  const bookVisitors = new Set<string>();
  const pricingSessions = new Set<string>();
  const sessionVisitor = new Map<string, string>();

  for (const pv of pageViews) {
    const vid = pv.visitor_id as string;
    const sid = pv.session_id as string;
    visitors.add(vid);
    if (sid) {
      sessionVisitor.set(sid, vid);
      if ((pv.page_url as string).toLowerCase().includes("pricing")) {
        pricingSessions.add(sid);
      }
    }
  }
  for (const sid of pricingSessions) {
    const vid = sessionVisitor.get(sid);
    if (vid) pricingVisitors.add(vid);
  }

  for (const e of userEvents) {
    const vid = e.visitor_id as string;
    if (!vid) continue;
    const type = e.event_type as string;
    const props = (e.properties as Record<string, unknown>) || {};
    const target = (e.event_target as string) || "";

    if (type === "pricing_card_click") {
      cardVisitors.add(vid);
      pricingVisitors.add(vid);
    } else if (type === "cta_click") {
      const t = props.target as string;
      if (t === "whatsapp" || t === "form" || t === "card-cta") {
        bookVisitors.add(vid);
      }
    } else if (type === "link_click" && target.includes("wa.me")) {
      bookVisitors.add(vid);
    } else if (type === "form_submit") {
      bookVisitors.add(vid);
    } else if (type === "section_view" && props.name === "pricing") {
      pricingVisitors.add(vid);
    }
  }

  const visitorsCount = visitors.size;
  const funnel = [
    { key: "visitors", label: "Visitors", count: visitorsCount, pct: 100 },
    { key: "pricing", label: "Reached pricing", count: pricingVisitors.size, pct: pct(pricingVisitors.size, visitorsCount) },
    { key: "cards", label: "Clicked a reading", count: cardVisitors.size, pct: pct(cardVisitors.size, visitorsCount) },
    { key: "booked", label: "Booked / asked CTA", count: bookVisitors.size, pct: pct(bookVisitors.size, visitorsCount) },
  ];

  return jsonResponse(env, { funnel }, 200, origin);
}

// ── GET /api/stats/campaigns ─────────────────────────────────────────────────
// Breakdown of traffic by UTM source (Instagram/Facebook/Direct…).

export async function handleCampaigns(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);

  const rows = await supabaseQuery<Record<string, unknown>>(env, "page_views", {
    timestamp: [`gte.${start}`, `lte.${end}`],
    select: "utm_source,utm_medium,utm_campaign,visitor_id",
  });

  const srcMap = new Map<string, { visits: number; visitors: Set<string>; mediums: Set<string> }>();
  for (const row of rows) {
    let src = (row.utm_source as string) || "";
    if (src) src = src.toLowerCase().trim();
    if (!src) src = "direct";
    if (!srcMap.has(src)) srcMap.set(src, { visits: 0, visitors: new Set(), mediums: new Set() });
    const entry = srcMap.get(src)!;
    entry.visits++;
    entry.visitors.add(row.visitor_id as string);
    if (row.utm_medium) entry.mediums.add(row.utm_medium as string);
  }

  const campaigns = Array.from(srcMap.entries())
    .map(([source, d]) => ({
      source,
      visits: d.visits,
      unique_visitors: d.visitors.size,
      medium: Array.from(d.mediums).join(", "),
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 15);

  return jsonResponse(env, { campaigns }, 200, origin);
}

// ── GET /api/stats/journeys ──────────────────────────────────────────────────
// Chronological per-session timeline of the most recent visitors.

export async function handleJourneys(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const { start, end } = getWindow(url);
  const limit = Math.min(getIntParam(url, "limit", 8), 25);

  const recent = await supabaseQuery<Record<string, unknown>>(env, "sessions", {
    started_at: [`gte.${start}`, `lte.${end}`],
    order: "started_at.desc",
    limit: String(limit),
    select: "session_id,visitor_id,started_at,entry_page,page_count,duration_seconds,utm_source",
  });
  if (recent.length === 0) {
    return jsonResponse(env, { journeys: [] }, 200, origin);
  }

  const sessionIds = recent.map((r) => r.session_id as string).join(",");

  const [pageViews, userEvents] = await Promise.all([
    supabaseQuery<Record<string, unknown>>(env, "page_views", {
      session_id: `in.(${sessionIds})`,
      order: "timestamp.asc",
      select: "session_id,timestamp,page_url,page_title",
    }),
    supabaseQuery<Record<string, unknown>>(env, "events", {
      session_id: `in.(${sessionIds})`,
      timestamp: [`gte.${start}`, `lte.${end}`],
      order: "timestamp.asc",
      select: "session_id,timestamp,event_type,event_target,properties,page_url",
    }),
  ]);

  const journeys = recent.map((s) => {
    const session = s.session_id as string;
    const timeline: Record<string, unknown>[] = [];
    for (const pv of pageViews) {
      if (pv.session_id !== session) continue;
      timeline.push({ kind: "page", time: pv.timestamp, target: pv.page_url, label: pv.page_title });
    }
    for (const e of userEvents) {
      if (e.session_id !== session) continue;
      timeline.push({
        kind: "event",
        time: e.timestamp,
        event_type: e.event_type,
        target: e.event_target || "",
        properties: e.properties || {},
        page_url: e.page_url || "",
      });
    }
    timeline.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    return {
      session_id: session,
      visitor_id: s.visitor_id,
      started_at: s.started_at,
      entry_page: s.entry_page,
      duration_seconds: s.duration_seconds,
      utm_source: s.utm_source || "",
      timeline,
    };
  });

  return jsonResponse(env, { journeys }, 200, origin);
}
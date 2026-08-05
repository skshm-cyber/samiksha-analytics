import { Env } from "../types";

/**
 * Simple in-memory rate limiter.
 * Cloudflare Workers are stateless, so we use a simple counter per IP.
 * For production, consider Cloudflare Rate Limiting rules instead.
 */
const hits = new Map<string, number[]>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100; // per minute per IP

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const timestamps = hits.get(ip) || [];

  // Remove timestamps older than the window
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);
  hits.set(ip, recent);

  if (recent.length >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  recent.push(now);
  hits.set(ip, recent);
  return { allowed: true, remaining: MAX_REQUESTS - recent.length };
}

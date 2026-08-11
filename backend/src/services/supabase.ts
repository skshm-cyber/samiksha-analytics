import { Env } from "../types";

/**
 * Supabase REST (PostgREST) helper.
 *
 * Every table in Supabase is automatically exposed as a REST endpoint:
 *   GET  {SUPABASE_URL}/rest/v1/{table}       → SELECT
 *   POST {SUPABASE_URL}/rest/v1/{table}       → INSERT
 *   PATCH {SUPABASE_URL}/rest/v1/{table}      → UPDATE
 *   DELETE {SUPABASE_URL}/rest/v1/{table}     → DELETE
 *
 * We use POST for ingestion and GET for analytics queries.
 */

const HEADERS = {
  "Content-Type": "application/json",
  "Prefer": "return=minimal",
};

export function supabaseHeaders(env: Env, prefer?: string): Record<string, string> {
  return {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

/** Insert a single row into a Supabase table. */
export async function supabaseInsert(
  env: Env,
  table: string,
  row: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(env, "return=minimal"),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text };
  }
  return { ok: true };
}

/** Insert multiple rows into a Supabase table (single request). */
export async function supabaseInsertBatch(
  env: Env,
  table: string,
  rows: Record<string, unknown>[]
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(env, "return=minimal"),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text };
  }
  return { ok: true };
}

/** Query Supabase with PostgREST filters. Returns parsed JSON array. */
export async function supabaseQuery<T = Record<string, unknown>>(
  env: Env,
  table: string,
  params: Record<string, string | string[]> = {}
): Promise<T[]> {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, item);
    } else {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      ...supabaseHeaders(env, "return=representation"),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    console.error(`Supabase query error: ${res.status} ${await res.text()}`);
    return [];
  }
  return res.json() as Promise<T[]>;
}

/** Execute a raw SQL RPC function (must be created in Supabase). */
export async function supabaseRpc<T = Record<string, unknown>>(
  env: Env,
  fnName: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(env, "return=representation"),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    console.error(`Supabase RPC error: ${res.status} ${await res.text()}`);
    return [];
  }
  return res.json() as Promise<T[]>;
}

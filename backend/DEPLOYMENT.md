# Deployment Guide — Samiksha Analytics (Cloudflare Workers + Supabase)

## Architecture

```
GitHub Pages (Frontend)         Cloudflare Worker (Backend)        Supabase (Database)
┌──────────────────┐            ┌──────────────────────┐           ┌──────────────────┐
│ dashboard.html   │ ──fetch──▶ │ /api/track           │ ──REST──▶ │ PostgreSQL       │
│ tracker.js       │            │ /api/event           │           │ visitors         │
│ (static files)   │            │ /api/stats/*         │           │ sessions         │
└──────────────────┘            └──────────────────────┘           │ page_views       │
                                                                   │ events           │
                                                                   │ devices          │
                                                                   │ locations        │
                                                                   └──────────────────┘
```

---

## Step 1: Supabase Database

1. Go to [supabase.com](https://supabase.com) → New Project
2. Go to **SQL Editor** → paste contents of `backend/migrations/001_initial_schema.sql` → Run
3. Copy your **Project URL** and **anon key** from Settings → API

---

## Step 2: Cloudflare Worker

### Option A: Deploy via Wrangler CLI (recommended)

```bash
cd backend
npm install
npx wrangler login
npx wrangler secret put SUPABASE_URL
# Paste: https://YOUR-PROJECT.supabase.co

npx wrangler secret put SUPABASE_ANON_KEY
# Paste: your anon key

npx wrangler secret put CORS_ORIGINS
# Paste: https://skshm-cyber.github.io

npx wrangler deploy
```

Your Worker URL: `https://samiksha-analytics-api.YOUR_SUBDOMAIN.workers.dev`

### Option B: Deploy via GitHub (automatic)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Workers & Pages** → **Create** → **Connect to Git**
3. Select repo: `skshm-cyber/samiksha-analytics`
4. Settings:
   - **Project name**: `samiksha-analytics-api`
   - **Production branch**: `main`
   - **Build command**: `cd backend && npm install && npm run deploy`
   - **Build output directory**: `/` (not used for Workers)
5. Add environment variables in **Settings → Variables**:
   - `SUPABASE_URL` = `https://YOUR-PROJECT.supabase.co`
   - `SUPABASE_ANON_KEY` = `your anon key`
   - `CORS_ORIGINS` = `https://skshm-cyber.github.io`

---

## Step 3: Connect Frontend

### tracker.js — Change ONE line

Open `tracker/tracker.js`, line 25-26. Replace:

```javascript
var API_BASE = window.SAMIKSHA_API_URL
    || (window.location.protocol + "//" + window.location.hostname + ":8000");
```

With:

```javascript
var API_BASE = window.SAMIKSHA_API_URL
    || "https://samiksha-analytics-api.YOUR_SUBDOMAIN.workers.dev";
```

### In your website HTML

Add before the tracker.js script:

```html
<script>window.SAMIKSHA_API_URL = "https://samiksha-analytics-api.YOUR_SUBDOMAIN.workers.dev";</script>
<script src="https://skshm-cyber.github.io/tracker.js"></script>
```

---

## Step 4: Verify

1. Visit `https://samiksha-analytics-api.YOUR_SUBDOMAIN.workers.dev/health`
2. You should see: `{"status":"healthy","service":"samiksha-analytics-api"}`
3. Open your website → tracker.js sends data → check Supabase dashboard

---

## API Reference

### Ingestion (from tracker.js)

| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/track` | visitor_id, session_id, timestamp, page_url, browser, os, device_type, ... |
| POST | `/api/event` | visitor_id, session_id, timestamp, event_type, event_target, page_url |

### Analytics (for dashboard)

| Method | Endpoint | Query Params |
|--------|----------|-------------|
| GET | `/api/stats/overview` | — |
| GET | `/api/stats/secondary` | — |
| GET | `/api/stats/hourly` | ?days=1 |
| GET | `/api/stats/pages` | ?days=1&limit=20 |
| GET | `/api/stats/referrers` | ?days=1&limit=10 |
| GET | `/api/stats/browsers` | ?days=1 |
| GET | `/api/stats/devices` | ?days=1 |
| GET | `/api/stats/os` | ?days=1 |
| GET | `/api/stats/countries` | ?days=1&limit=20 |
| GET | `/api/stats/cities` | ?days=1&limit=20 |
| GET | `/api/stats/live` | — |
| GET | `/api/stats/trends` | ?days=30 |
| GET | `/api/stats/events` | ?days=1&limit=100 |
| GET | `/api/stats/events/summary` | ?days=1 |
| GET | `/api/stats/daily` | ?days=30 |

---

## Free Tier Limits

| Service | Free Tier |
|---------|-----------|
| Cloudflare Workers | 100K requests/day |
| Supabase | 500MB database, 50K MAU |
| GitHub Pages | 100GB bandwidth/month |

---

## Final Checklist

- [ ] Supabase project created
- [ ] SQL migration executed
- [ ] Cloudflare Worker deployed
- [ ] `/health` returns healthy
- [ ] `SUPABASE_URL` secret set
- [ ] `SUPABASE_ANON_KEY` secret set
- [ ] `CORS_ORIGINS` secret set
- [ ] tracker.js API_BASE updated
- [ ] Test page view via curl
- [ ] Dashboard shows real data

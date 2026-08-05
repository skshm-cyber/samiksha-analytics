# Deployment Guide — Samiksha Analytics Backend

## Overview

| Layer | Service | Free Tier |
|-------|---------|-----------|
| Frontend | GitHub Pages | Yes |
| Backend | Render | Yes (512 MB RAM, spins down after inactivity) |
| Database | Supabase PostgreSQL | Yes (500 MB, 50K monthly active users) |

---

## Step 1: Set Up Supabase Database

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Fill in:
   - **Project name**: `samiksha-analytics`
   - **Database password**: choose a strong password (save it!)
   - **Region**: closest to your users
4. Click **"Create new project"** (takes ~2 minutes)
5. Go to **Settings → Database** and copy the **Connection string → URI**

The URI looks like:
```
postgresql://postgres:YOUR_PASSWORD@db.XXXXX.supabase.co:5432/postgres
```

6. Go to **SQL Editor** (left sidebar)
7. Paste the contents of `migrations/001_initial_schema.sql`
8. Click **"Run"** to create all tables

---

## Step 2: Deploy to Render

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Fill in:
   - **Name**: `samiksha-analytics-api`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free
5. Under **"Advanced"** → **"Environment Variables"**, add:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:YOUR_PASSWORD@db.XXXXX.supabase.co:5432/postgres` |
| `CORS_ORIGINS` | `https://yourusername.github.io` |
| `ENVIRONMENT` | `production` |

6. Click **"Create Web Service"**
7. Wait for deployment (~3-5 minutes)
8. Your API is now live at: `https://samiksha-analytics-api.onrender.com`

---

## Step 3: Verify the API

Open your browser and visit:
```
https://samiksha-analytics-api.onrender.com/health
```

You should see:
```json
{"status": "healthy", "service": "samiksha-analytics-api"}
```

Visit the auto-generated API docs:
```
https://samiksha-analytics-api.onrender.com/docs
```

---

## Step 4: Connect Your Frontend (GitHub Pages)

### tracker.js — One Line Change

Open `tracker/tracker.js` and find line 25-26:

```javascript
var API_BASE = window.SAMIKSHA_API_URL
    || (window.location.protocol + "//" + window.location.hostname + ":8000");
```

Replace with:

```javascript
var API_BASE = window.SAMIKSHA_API_URL
    || "https://samiksha-analytics-api.onrender.com";
```

**That's the only change needed.** The API endpoints are already compatible.

### In your website HTML

Add this before the tracker.js script tag:

```html
<script>window.SAMIKSHA_API_URL = "https://samiksha-analytics-api.onrender.com";</script>
<script src="https://yourusername.github.io/path/to/tracker.js"></script>
```

Or if you've already set the default in tracker.js, just:

```html
<script src="https://yourusername.github.io/path/to/tracker.js"></script>
```

---

## Step 5: Connect Your Dashboard

In `frontend/dashboard.html`, the dashboard currently uses hardcoded data. To make it use real API data, you need to:

1. Set the API base URL at the top of the `<script>` section:

```javascript
var API_BASE = "https://samiksha-analytics-api.onrender.com";
```

2. Replace the hardcoded `data-target` values with API calls.

The dashboard endpoints are:

| Endpoint | Returns |
|----------|---------|
| `GET /api/stats/overview` | visitors_today, live_visitors, page_views_today, sessions_today |
| `GET /api/stats/secondary` | unique, duration, bounce rate, etc. |
| `GET /api/stats/hourly?days=1` | visitors by hour |
| `GET /api/stats/pages?days=1` | top pages |
| `GET /api/stats/referrers?days=1` | top referrers |
| `GET /api/stats/browsers?days=1` | browser breakdown |
| `GET /api/stats/devices?days=1` | device types |
| `GET /api/stats/os?days=1` | operating systems |
| `GET /api/stats/countries?days=1` | visitors by country |
| `GET /api/stats/cities?days=1` | visitors by city |
| `GET /api/stats/live` | currently active visitors |
| `GET /api/stats/trends?days=30` | daily trends |
| `GET /api/stats/events?days=1` | recent events |
| `GET /api/stats/events/summary?days=1` | event counts by type |
| `GET /api/stats/daily?days=30` | daily analytics |

---

## Step 6: Automatic Deployments

Render automatically redeploys when you push to GitHub:

1. Make changes to your backend code
2. `git add . && git commit -m "description" && git push`
3. Render detects the push and redeploys (~3-5 minutes)

---

## Important Notes

### Render Free Tier Limitations
- **Spins down after 15 minutes of inactivity** — first request after idle takes ~30 seconds
- **512 MB RAM** — enough for this project
- **750 hours/month** — enough for personal use

### Supabase Free Tier Limitations
- **500 MB database storage**
- **50,000 monthly active users**
- **500 MB bandwidth**
- **No daily backups** (upgrade for this)

### CORS
- The `CORS_ORIGINS` env var controls which domains can call your API
- Set it to your GitHub Pages URL: `https://yourusername.github.io`
- For local development, localhost is always allowed

### Environment Variables
Never commit `.env` files to Git. The `.env.example` file shows the required variables without real values.

---

## Local Development

1. Create a `.env` file in `backend/`:
```
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/samiksha_analytics
CORS_ORIGINS=http://localhost:3000
ENVIRONMENT=development
```

2. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

3. Run the server:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

4. Open API docs: `http://localhost:8000/docs`

---

## Testing API Requests

### Send a page view (what tracker.js does):

```bash
curl -X POST http://localhost:8000/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "visitor_id": "test-visitor-001",
    "session_id": "test-session-001",
    "timestamp": "2026-08-05T14:30:00.000Z",
    "timezone": "America/New_York",
    "language": "en-US",
    "browser": "Chrome",
    "browser_version": "120.0.6099.130",
    "os": "macOS",
    "device_type": "Desktop",
    "screen_width": 1920,
    "screen_height": 1080,
    "page_url": "https://mywebsite.com/pricing",
    "referrer": "https://google.com",
    "page_title": "Pricing - My Website",
    "is_first_visit": 1,
    "scroll_percentage": 0,
    "time_on_page": 0
  }'
```

### Get dashboard stats:

```bash
curl http://localhost:8000/api/stats/overview
```

Expected response:
```json
{
  "visitors_today": 1,
  "live_visitors": 1,
  "page_views_today": 1,
  "sessions_today": 1
}
```

---

## Final Checklist

- [ ] Supabase project created
- [ ] SQL migration executed in Supabase SQL Editor
- [ ] Render web service deployed
- [ ] `/health` endpoint returns healthy
- [ ] `/docs` shows Swagger UI
- [ ] `DATABASE_URL` env var set in Render
- [ ] `CORS_ORIGINS` env var set in Render
- [ ] tracker.js API_BASE updated
- [ ] Test page view via curl or browser
- [ ] Dashboard shows real data

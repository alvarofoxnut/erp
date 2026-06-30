# Deploy: Neon + Render + Vercel (free tier)

Split deployment:

| Service | Host | Role |
|---------|------|------|
| PostgreSQL | [Neon](https://neon.tech) | Database |
| API | [Render](https://render.com) | Node/Express backend |
| UI | [Vercel](https://vercel.com) | React static site |

Deploy in this order: **Neon → Render → Vercel** (Vercel needs the Render API URL).

---

## 1. Neon (database)

1. Create a project on Neon (free tier).
2. Create database `makhana_erp` (or use default `neondb` and update `DATABASE_URL`).
3. Copy two connection strings from the Neon dashboard:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL` (used by the running API)
   - **Direct** (no pooler) → `DIRECT_DATABASE_URL` (used for Prisma migrations on Render build)

Append `?sslmode=require` if not already present.

Example:

```env
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
DIRECT_DATABASE_URL=postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

4. Run migrations **once** from your machine (optional if Render build runs them):

```bash
cd backend
# set DATABASE_URL and DIRECT_DATABASE_URL in .env to Neon values
npm run db:migrate
npm run seed
```

`seed` creates admin `admin@makhanaerp.com` / `admin123` — **change this password after first login**.

---

## 2. Render (backend)

### Create Web Service

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**.
2. Connect your Git repo.
3. Settings:

| Field | Value |
|-------|--------|
| **Root Directory** | `backend` |
| **Runtime** | Node |
| **Build Command** | `npm ci && npm run build:deploy` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/api/health` |
| **Plan** | Free |

Or import **`render.yaml`** from the repo root (Blueprint).

### Environment variables (Render → Environment)

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon **pooled** URL |
| `DIRECT_DATABASE_URL` | Neon **direct** URL |
| `JWT_ACCESS_SECRET` | Long random string |
| `JWT_REFRESH_SECRET` | Long random string |
| `CLIENT_URL` | Your Vercel URL, e.g. `https://makhana-erp.vercel.app` |
| `COOKIE_CROSS_ORIGIN` | `true` (required: frontend and API are on different domains) |
| `JWT_ACCESS_EXPIRES` | `15m` (optional) |
| `JWT_REFRESH_EXPIRES` | `7d` (optional) |
| `LOG_LEVEL` | `info` (optional) |
| `ALLOW_VERCEL_PREVIEWS` | `true` (optional — allows `*.vercel.app` preview URLs in CORS) |

4. Deploy. Note your API URL, e.g. `https://makhana-erp-api.onrender.com`.

5. Verify: open `https://YOUR-API.onrender.com/api/health` — should return JSON success.

### Free tier notes (Render)

- Service **spins down after ~15 min** idle; first request can take **30–60 seconds** (cold start).
- Free Postgres on Render is **not** used when you use Neon.

### Seed on Render (if you skipped local seed)

Render → your service → **Shell**:

```bash
node src/scripts/seed.js
```

---

## 3. Vercel (frontend)

1. [Vercel Dashboard](https://vercel.com) → **Add New Project** → import the same repo.
2. Settings:

| Field | Value |
|-------|--------|
| **Root Directory** | `frontend` |
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

3. **Environment variables** (Production):

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | `https://YOUR-API.onrender.com/api` (no trailing slash on host; path is `/api`) |

4. Deploy. Copy your Vercel URL (e.g. `https://makhana-erp.vercel.app`).

5. Go back to **Render** → set `CLIENT_URL` to that exact Vercel URL (including `https://`) → **Redeploy** the API.

6. Open the Vercel URL → log in with admin credentials → change password.

`frontend/vercel.json` already rewrites all routes to `index.html` for React Router.

---

## Architecture

```
Browser → Vercel (React)
              ↓  HTTPS  VITE_API_URL
         Render (Express /api/*)
              ↓
         Neon (PostgreSQL)
```

Auth: access token in `localStorage`; refresh token in **httpOnly cookie** with `SameSite=None; Secure` when `COOKIE_CROSS_ORIGIN=true`.

---

## Checklist

- [ ] Neon: pooled + direct URLs in Render
- [ ] Render: `COOKIE_CROSS_ORIGIN=true`
- [ ] Render: `CLIENT_URL` = exact Vercel production URL
- [ ] Vercel: `VITE_API_URL` = `https://<render-host>/api`
- [ ] Migrations applied (`build:deploy` or manual `db:migrate`)
- [ ] Seed run once; admin password changed
- [ ] `/api/health` works on Render
- [ ] Login + page refresh (token refresh) works on Vercel

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS error | `CLIENT_URL` must match the browser URL exactly (scheme + host, no trailing slash). |
| Login works but refresh fails | Set `COOKIE_CROSS_ORIGIN=true` on Render; ensure site is HTTPS (Vercel/Render default). |
| `Can't reach database` on Render | Use Neon **pooled** URL for `DATABASE_URL`; check `sslmode=require`. |
| Migration fails on build | Set `DIRECT_DATABASE_URL` to Neon **non-pooler** URL. |
| 502 / slow first load | Render free tier cold start — wait and retry. |
| Prisma error locally about `DIRECT_DATABASE_URL` | Add to `backend/.env` (same as `DATABASE_URL` for local Postgres). |

---

## Local development (unchanged)

```bash
cd backend && npm run dev      # needs Postgres on :5433 or Docker dev DB
cd frontend && npm run dev     # http://localhost:5173
```

Do **not** set `COOKIE_CROSS_ORIGIN=true` locally unless testing cross-origin behavior.

---

## Optional: custom domain

- Vercel: add domain → update `CLIENT_URL` on Render to `https://yourdomain.com`
- Render: add custom domain for API → update `VITE_API_URL` on Vercel to `https://api.yourdomain.com/api`

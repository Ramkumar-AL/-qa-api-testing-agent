# Bench — AI API Testing Agent (web)

A hosted, browser-based version of the API testing agent: a chained
request runner with a real assertion + JSON-schema engine, AI-assisted test
generation, and AI failure triage — all wrapped in a React UI you deploy as
a live website.

## Why this needs a backend (not just a static page)

Executing a real HTTP request to an arbitrary API from inside a browser
tab runs into CORS: most APIs won't let a random web page fetch them
directly. The original hackathon project this is based on solved that with
Vercel serverless functions acting as a proxy — this project does the same
(`api/run-suite.js`, `api/generate.js`), which also keeps your OpenAI key
server-side instead of exposed in browser JavaScript.

## Local development

You need two things running at once: the frontend (Vite) and the API
functions (a tiny local server that mounts the same handler files Vercel
will run). Open two terminals in this folder:

```bash
npm install
cp .env.example .env   # optional — add OPENAI_API_KEY for AI-powered output

# terminal 1
npm run dev:api

# terminal 2
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Requests to
`/api/*` are proxied to the API server automatically (see
`vite.config.js`). Click **Run suite** — the default suite is a full
Restful-Booker login → create → read → delete flow, so you'll see chaining,
assertions, and pass/fail all working immediately.

## Deploying it as a real website (Vercel, free)

This is the "host it on the web" step — once done you get a permanent
`https://your-project.vercel.app` URL you can put in a resume or send to
an interviewer.

1. Create a free account at vercel.com if you don't have one (sign in with
   GitHub is easiest).
2. Push this folder to a new GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. In the Vercel dashboard: **Add New… → Project**, then import that GitHub
   repo. Vercel auto-detects the Vite framework and the `api/` functions —
   you don't need to change any build settings.
4. Before the first deploy (or any time after, under **Project Settings →
   Environment Variables**), add:
   - `OPENAI_API_KEY` — optional, enables real AI generation/triage instead
     of the offline heuristic fallback
   - `OPENAI_MODEL` — optional, defaults to `gpt-4o-mini`
5. Click **Deploy**. When it finishes, Vercel gives you the live URL.

Every push to `main` redeploys automatically after this.

## What's actually happening under the hood

- `src/lib/` holds the engine logic (variable resolution, JSONPath
  assertions, AJV schema validation, the regression diff, the HTML report
  template) and is **shared** — the exact same files run inside the
  serverless function (`api/_engine.js` imports them) and inside the
  browser bundle (`src/App.jsx` imports `diff.js` and `htmlReport.js` for
  the "download report" button and the history diff banner).
- History lives in the browser's `localStorage`, keyed by suite name. Every
  run is diffed against the last stored run for that name before being
  saved over it — that's what powers the "N changes vs. previous run"
  banner, entirely client-side, no database required.
- AI generation and triage (`api/generate.js`, inside `api/_engine.js`)
  call OpenAI's API if `OPENAI_API_KEY` is set on the server, and fall back
  to `src/lib/heuristics.js` (rule-based, derived from the actual sample
  response's fields) otherwise — the app is fully functional with zero
  external API keys.

## Known limitations / natural next steps

- History is per-browser (`localStorage`), not shared across devices or
  teammates — a real team dashboard would need a database (Postgres,
  Vercel KV, etc.).
- No OpenAPI/Swagger import yet — "Generate from sample" takes one sample
  request/response at a time.
- No load-testing mode — the original hackathon project's load tester was
  solid and worth porting in as a second tab.
- No shareable persistent report links (the original project used Vercel
  Blob for this) — the current "Download HTML report" button produces a
  file, not a hosted link. Adding Vercel Blob storage would close this gap
  if you want a "share this report with a teammate" link.

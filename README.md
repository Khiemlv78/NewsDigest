# NewsDigest

AI-powered daily tech news aggregator. Automatically fetches articles from RSS, Reddit, YouTube, Hacker News, GitHub Trending, and more — then summarizes and scores them using Gemini AI.

## Architecture

- **Worker** (Cloudflare Workers) — cron scraper, queue consumer, AI summarizer, REST API
- **Frontend** (SvelteKit on Cloudflare Pages) — PWA reader

**Stack:** Hono · TypeScript · Cloudflare D1 · Cloudflare Queue · Cloudflare KV · Gemini AI

## Quick Deploy

### Prerequisites

- Node.js 18+
- A [Cloudflare](https://dash.cloudflare.com) account (free plan works)

### 1. Install dependencies

```bash
npm install
cd fe && npm install && cd ..
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

### 3. Choose your AI backend & get API keys

NewsDigest supports two AI backend modes. **Choose one:**

---

#### Option A — Direct Gemini API *(simpler, recommended for self-hosting)*

Just get a free Gemini API key — no Cloudflare AI Gateway setup needed.

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) → **Create API key**
2. Copy the key → it goes into `GEMINI_API_KEY` in your `.env`

```bash
cp .env.example .env
```

---

#### Option B — Cloudflare AI Gateway *(advanced: caching, logging, rate-limit dashboard)*

Routes Gemini calls through Cloudflare for observability and caching.

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **AI** → **AI Gateway**
2. Click **Create Gateway** → name it (e.g. `newsdigest`) → Create
3. Inside the gateway, click **Providers** → **Add Provider**
4. Select **Google AI Studio** → go to [Google AI Studio](https://aistudio.google.com/apikey), create an API key, paste it as the Provider Key. Set alias to `default`
5. From the gateway page, copy:
   - **Gateway URL** → `https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_name>/google-ai-studio`
   - **Auth token** → from gateway Settings

```bash
cp .env.example.gateway .env
```

---

#### RapidAPI — YouTube Transcripts (only if using YouTube sources)

Used to fetch video transcripts so the AI can summarize YouTube content. Skip if you don't plan to add YouTube channel sources.

1. Go to [yt-api on RapidAPI](https://rapidapi.com/ytjar/api/yt-api)
2. Sign up / log in → **Subscribe** → choose the free tier (Basic)
3. Copy your **X-RapidAPI-Key** from the code examples on the right panel

#### Admin API Key (optional)

Protects write endpoints (add/delete sources, resummarize). Generate any random string:

```bash
openssl rand -hex 32
```

### 4. Configure environment

Fill in the keys you obtained above. See comments in the `.env` file for details.

### 5. Initialize Cloudflare resources

This creates D1 database, KV namespaces, Queues, Pages project, sets secrets, and runs DB migration — all idempotent (safe to re-run):

```bash
npm run cf:init
```

### 6. Deploy

```bash
npm run deploy
```

This deploys the Worker, builds the frontend with the correct API URL, and deploys to Cloudflare Pages.

---

## API Keys Reference

| Key | Source | Required | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | ✅ Option A | Direct Gemini API calls |
| `AI_GATEWAY_URL` | [Cloudflare AI Gateway](https://dash.cloudflare.com) → AI → AI Gateway | ✅ Option B | Gateway URL for Gemini AI calls |
| `AI_GATEWAY_TOKEN` | Same gateway → Settings | ✅ Option B | Authorization token |
| `RAPIDAPI_KEY` | [RapidAPI — yt-api](https://rapidapi.com/ytjar/api/yt-api) | ☑️ YouTube sources only | Fetches YouTube video transcripts for AI summarization |
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) | ☑️ YouTube sources only | Lists channel videos (YouTube RSS has been blocked) |
| `ADMIN_API_KEY` | Self-generated (`openssl rand -hex 32`) | ☑️ Optional | Protects write endpoints |

> **Note:** Set either `GEMINI_API_KEY` **or** `AI_GATEWAY_URL` + `AI_GATEWAY_TOKEN` — not both. If `GEMINI_API_KEY` is present, it takes priority.

---

## Customization (Prompt Configuration)

All AI prompt behavior is configurable via environment variables — no code changes needed. Defaults reproduce the original Vietnamese tech-news behavior; set any of these to adapt NewsDigest for a different language or topic domain.

| Variable | Default | Description |
|---|---|---|
| `PROMPT_OUTPUT_LANGUAGE` | `Vietnamese` | Language for AI summaries and digests |
| `PROMPT_TOPIC_PRIORITIES` | `AI/LLM, Security, Dev Tools, Startup/Business` | Comma-separated topics that receive higher hot_scores |
| `PROMPT_ALLOWED_TAGS` | `AI, Tech, Security, Business, Vietnam, World, Dev, Science, Crypto, Policy, Entertainment` | Comma-separated tag whitelist |
| `PROMPT_DIGEST_HEADINGS` | `AI & LLM, Security, Tools & Infrastructure, Startup & Business, Policy & Society` | Suggested section headings in the daily digest (soft suggestions) |
| `PROMPT_CUSTOM_CONTEXT` | *(empty)* | Extra instruction appended to the system prompt — plain text only |

Example: to run NewsDigest in English focused on finance and climate:

```bash
PROMPT_OUTPUT_LANGUAGE=English
PROMPT_TOPIC_PRIORITIES="Finance, Climate, Policy, Energy"
PROMPT_ALLOWED_TAGS="Finance, Climate, Policy, Tech, Business, World, Science"
PROMPT_DIGEST_HEADINGS="Markets & Economy, Climate & Energy, Policy, Technology"
PROMPT_CUSTOM_CONTEXT="Focus on Southeast Asian and global markets."
```

---

## Local Development

```bash
# Terminal 1: Worker (localhost:8787)
npm run dev

# Terminal 2: Frontend (localhost:5173)
npm run dev:fe
```

The frontend auto-detects the Worker at `http://localhost:8787` in dev mode — no `.env.local` needed.

---

## Notes

- `npm run cf:init` can be re-run to update secrets or re-apply schema migration.
- If your Worker uses a custom domain, set `WORKER_PUBLIC_URL` in `.env`.
- Never commit `.env` or `.dev.vars`.
- For AI coding agents working on this codebase, see [AGENTS.md](./AGENTS.md).
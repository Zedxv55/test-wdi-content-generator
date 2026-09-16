# DIAMOND WDI AI Content & Short Video Studio

Local web app for turning WDI product data + Short-vdo workbook templates into
marketing content, Google Flow-ready scene prompts, and AI-generated Product
Sheet reference prompts. Includes a local Production Memory (SQLite) that tracks
jobs, versions, QC, publishing, campaigns, and per-product identity sheets.

## Data sources (read-only masters, never modified by the app)

- `data/Present(Get-web-wdi).xlsx` — product master (1,030 rows, 922 unique codes)
- `data/Present(Short-vdo)ล่าสุด.xlsx` — video workbook:
  - S01–S17 production templates (`แผ่นงาน1`, EX01 example excluded)
  - V01–V15 user-facing series (`Series Selector v2`)
  - C01–C09 category prompt matrix + library
  - `AI Prompt Builder` blocks, `Platform Output`, `Product Truth Schema`
- `data/WDI-Fitment-Master.xlsx` — verified fitment evidence

Set `VIDEO_FILE` / `PRODUCT_FILE` in `.env` to point at alternate workbooks.

## Workflow

```text
PRODUCT → PRODUCT SHEET → C + V → AUTO S → VIDEO PROMPT → Flow
```

1. Pick a product → system builds a **Product Sheet** (identity card).
2. Pick a V intent + category (auto-suggested, overridable) → system maps S.
3. Generate → Content Pack JSON (script, voice-over, scenes, Flow prompts,
   image-to-video prompt, caption, CTA, source facts, QA).
4. QC → Publish tracking per platform, with full version history.

## Product Sheet (identity layer)

- Deterministic, evidence-based builder (`sheets.mjs`), category-aware
  schemas (C01–C09 + garment). Unverifiable fields stay `[NOT_VERIFIED]`.
- Versioned per product; source/category changes create new versions.
- Statuses: `DRAFT` → `NEEDS_REVIEW` → `VERIFIED`.
- `POST /api/sheet-prompt` uses vision AI to write a golden-pattern
  reference-sheet prompt, saved onto the sheet and reused by video prompts.

## Production Memory (SQLite, `data/wdi-production.db`)

Tables: `products`, `prompt_series`, `production_jobs` (unique product+V),
`production_versions` (append-only, `is_current`), `production_actions`
(append-only log), `publish_status`, `campaigns`, `campaign_items`,
`ai_memory`, `product_sheets`, `product_sheet_references`,
`product_sheet_actions`. Masters are upserted, history is never deleted.
On read-only hosts (Vercel) the DB falls back to in-memory mode.

## Features

- Search/filter products (code, name, category, brand, model, job status).
- V quick-pick + auto S mapping + duration (15/30/45s) + showcase/replacement mode.
- Per-product Content Matrix (V01–V15 done/todo), status badges, dashboard,
  Smart-Next suggestions, campaign progress.
- Rule-based AI Assistant answering from the production DB
  (`POST /api/assistant`) — quotes DB rows, never invents status.
- Marketplace prompts, ad image generator, WDI image proxy (`/api/wdi/image`).

## Run

```powershell
npm install
npm start
```

Open `http://localhost:3077`.

## Environment

Copy `.env.example` to `.env` and set:

```env
PORT=3077
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
VIDEO_FILE=data/Present(Short-vdo)ล่าสุด.xlsx
```

Never commit `.env` or API keys. The local SQLite DB, backups, AI cache
and logs are git-ignored (see `.gitignore`).

## API (selection)

- `GET /api/health` — counts + AI status + tracking backend (no secrets).
- `GET /api/meta` — filter metadata.
- `GET /api/products` — filtered products (optional `limit`/`offset`).
- `GET /api/templates` — S-series; `/api/series-v`, `/api/categories`,
  `/api/platforms`, `/api/resolve-series`, `/api/category-suggest`.
- `POST /api/generate` — `{product, vCode, categoryCode, duration, mode, force}`.
- Tracking: `/api/track/select`, `/api/jobs/status`, `/api/job`,
  `/api/versions`, `/api/version`, `/api/qc`, `/api/publish`,
  `/api/dashboard`, `/api/next`, `/api/campaigns*`, `/api/memory*`,
  `/api/memory/import`.
- Sheets: `/api/sheet`, `/api/sheet/detail`, `/api/sheet/versions`,
  `/api/sheet/verify`, `POST /api/sheet-prompt`.
- Assistant: `POST /api/assistant`.
- Images: `POST /api/image-generate` (`{prompt, w, h, mode}`).

## AI safety rules

Product workbook + verified fitment + Product Sheet are the source of truth.
The generator must not invent fitment, model/year, specifications, included
parts, price, stock, warranty, claims, colors, parts, views, or dimensions.
Real product images are references and must not be redesigned or altered.
Video prompts reuse the saved Product Sheet visual identity verbatim.

# DIAMOND WDI AI Content & Short Video Studio

Local web app for turning WDI product data + `Present(Short-vdo).xlsx` templates into Thai marketing content and Google Flow-ready scene prompts.

## Data sources
- `D:\Windows\Document\VSCode\ex\Present(Get-web-wdi).xlsx`
- `D:\Windows\Document\VSCode\ex\Present(Short-vdo).xlsx`

The current product workbook contains 1,030 products and the video workbook contains 6 usable series.
The original Excel files are read-only inputs and are not modified by this app.

## Features
- Search products by code/name/description.
- Filter by Category, Sub Category, Car Brand and Car Model when those columns exist in the source workbook.
- Select one of the Short-vdo production series.
- Generate a Content Pack with script, voice-over, scenes, Flow prompts, image-to-video prompt, caption, CTA and source facts.
- Export the selected production package as JSON.
- Uses `.env` for the OpenAI key and model; `.env` is ignored by Git.

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
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
```
Never commit `.env` or API keys.

## API
- `GET /api/health` — data counts + AI configuration status (never returns the key).
- `GET /api/config` — non-secret environment status.
- `GET /api/meta` — filter metadata.
- `GET /api/products` — filtered product data.
- `GET /api/templates` — normalized Short-vdo templates.
- `POST /api/generate` — generate a Content Pack through OpenAI.

## AI safety rules
The generator treats the product workbook as the source of truth. It must not invent fitment, model/year, specifications, included parts, price, stock, warranty or claims. Real product images are references and should not be redesigned or altered.

## Current verification
- Excel input loading: PASS
- Template loading: PASS
- Local HTTP health endpoint: PASS
- `.env` loading: PASS; key is detected without exposing its value
- OpenAI request reaches the API: PASS at authentication/transport level
- Full AI generation: currently blocked by the OpenAI account returning HTTP 429 `billing_not_active`; this is an account/billing state, not an app-code error. After billing/project activation, rerun the generation smoke test.

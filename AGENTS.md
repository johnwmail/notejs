# Agent Guidelines for Note App

## Project Overview

A lightweight, serverless note-taking web app written in TypeScript. Deployed on Cloudflare Workers or Vercel Edge. No JS frameworks, no build step. The entire HTML/CSS/JS UI is an inline template string in `src/lib/template.ts`.

## Architecture

- **Language**: TypeScript 5.6+
- **Frontend**: Inline HTML/CSS/JS template in `renderHTML()` within `src/lib/template.ts` — no separate static files
- **Storage**: Redis via Upstash (Cloudflare Workers / Vercel Edge)
- **Deployment**: Cloudflare Workers (`wrangler`) or Vercel Edge
- **No dependencies** for the frontend — pure vanilla HTML/CSS/JS, no npm, no build tools

## Key Files

| File | Purpose |
|---|---|
| `src/workers.ts` | Cloudflare Workers entry point |
| `src/vercel.ts` | Vercel Edge entry point |
| `src/handler.ts` | HTTP handlers (GET, POST, OPTIONS) |
| `src/lib/template.ts` | **Full HTML/CSS/JS UI template** (`renderHTML`) |
| `src/lib/storage.ts` | Redis/Upstash storage |
| `src/lib/utils.ts` | Note ID generation/validation, HTML escaping, ClientIP |
| `src/lib/types.ts` | TypeScript type definitions |

## Important Conventions

1. **All UI lives in `src/lib/template.ts`** — the `renderHTML` function contains the full HTML document as a template literal. There are no separate `.html`, `.css`, or `.js` files.
2. **Dynamic values** are injected via `${}` with `escapeHTMLServer()` for XSS safety.
3. **TypeScript must compile**: Run `npx tsc --noEmit` before committing changes.
4. **No new dependencies** for the frontend. Keep it vanilla.
5. **Responsive design** — must work on both desktop and mobile.
6. **Theme**: White background with blue accents (`#2563EB` primary, `#1D4ED8` hover).

## Running Locally

### Cloudflare Workers (Wrangler)

```bash
npm run dev
```

## Testing

```bash
npx tsc --noEmit
```

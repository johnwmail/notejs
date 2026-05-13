# notejs

A lightweight, serverless note-taking web app written in TypeScript. Create, edit, and share notes with auto-save. Deploys on Cloudflare Workers (native KV) or Vercel Edge (Vercel KV). No JS frameworks, no build step, zero dependencies — pure vanilla HTML/CSS/JS.

## Features

- **Simple Note Editor**: Lightweight web interface for creating and editing notes
- **Auto-Save**: Automatically saves note content every second
- **Shareable URLs**: Notes accessible via direct links with human-friendly WORDnn IDs
- **Multi-Deployment**: Cloudflare Workers or Vercel Edge
- **Zero Dependencies**: No npm runtime deps — KV via native bindings (Cloudflare) or REST fetch (Vercel)
- **XSS Protection**: User content is HTML-escaped
- **Responsive**: Works on desktop and mobile
- **Print Support**: Print-friendly interface

## Quick Start

### Prerequisites

- Node.js 18+

### Local Development

The app uses Wrangler (Cloudflare Workers) for local dev. KV is simulated by Miniflare — no account needed:

```bash
npm install
npm run dev
```

Open http://localhost:8787.

---

## Deploy to Cloudflare Workers (recommended)

**Storage**: Cloudflare KV — persistent, native, zero-config.

### Step 1: Create a KV namespace

```bash
npx wrangler kv:namespace create "KV"
```

### Step 2: Add the namespace ID to `wrangler.toml`

Copy the ID from the output and paste it:

```toml
[[kv_namespaces]]
binding = "KV"
id = "your-namespace-id"
```

### Step 3: Deploy

```bash
npm run deploy
```

Your app is live at `https://your-app.your-account.workers.dev` with persistent KV storage.

---

## Deploy to Vercel Edge

**Storage**: Vercel KV (Upstash Redis) — persistent with 7-day TTL.

### Step 1: Provision Vercel KV

Via CLI (recommended):
```bash
npx vercel install upstash/upstash-kv -m primaryRegion=sfo1
```

Or via the Vercel dashboard: Storage → Create → Vercel KV.

Either way auto-populates `KV_REST_API_URL` and `KV_REST_API_TOKEN` as environment variables.

### Step 2: Push to GitHub and import in Vercel

### Step 3: Deploy

```bash
npx vercel --prod
```

`vercel.json` routes all requests to `src/vercel.ts` as an Edge Function. The app uses `VercelKVStorage` which connects to Vercel KV via its REST API.

Your app is live at `https://your-app.vercel.app` with persistent KV storage.

---

## CI/CD (GitHub Actions)

The repository includes two workflows:

### Test (`test.yml`)

Runs on every push/PR to `feature/typescript`:
- `npm ci` → `tsc --noEmit` → `npm test`

### Deploy Cloudflare (`deploy-cloudflare.yml`)

Manual trigger (`workflow_dispatch`) — typecheck → deploy to Cloudflare Workers.

**Required secret:** `CF_API_TOKEN` — Cloudflare API token with Workers permissions (create in Cloudflare Dashboard → My Profile → API Tokens, template: "Edit Cloudflare Workers").

### Deploy Vercel (`deploy-vercel.yml`)

Manual trigger (`workflow_dispatch`) — typecheck → deploy to Vercel Edge.

**Required secret:** `VERCEL_TOKEN` — Vercel access token (create in Vercel Dashboard → Settings → Tokens).

**To set up secrets:** Go to your GitHub repo → Settings → Secrets and variables → Actions, then add each token. Run workflows via Actions tab → select workflow → Run workflow.

## API

### GET /noteid/{noteId} (or `/?note={noteId}`)

Retrieve and display a note.

**Parameters:**
- `noteId` (path) or `note` (query): Note ID (alphanumeric, 3–32 chars, no I/O/0/1)

**Notes:**
- The preferred URL format is `/noteid/{noteId}` for shell-friendly links (e.g., `http://example.com/noteid/BLAST47`).
- Backwards compatibility: `/?note={noteId}` still works.
- Links use the request host or `x-forwarded-*` headers for reverse proxy support.
- Requests with `User-Agent` containing "curl" return plain text instead of HTML.

### POST /

Save or delete a note.

**Request body (JSON):**
```json
{
  "noteId": "BLAST47",
  "content": "Note content here"
}
```

**Response (JSON):**
```json
{
  "success": true,
  "noteId": "BLAST47"
}
```

**Behavior:**
- If `noteId` is empty, a random WORDnn ID is generated (e.g., "BLAST47")
- If `content` is empty or whitespace-only, the note is deleted
- Otherwise, the note is saved

**Examples:**
```bash
# Create new note
curl -X POST https://your-app.com/ \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello World"}'

# Returns URL for curl requests
curl -X POST https://your-app.com/ \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/8.0" \
  -d '{"content":"Hello World"}'
# → https://your-app.com/noteid/BLAST47
```

## Project Structure

```
.
├── src/
│   ├── workers.ts          # Cloudflare Workers entry point
│   ├── vercel.ts           # Vercel Edge entry point
│   ├── handler.ts          # HTTP handlers (GET, POST, OPTIONS)
│   ├── handler.test.ts     # Handler unit tests
│   └── lib/
│       ├── template.ts     # Full HTML/CSS/JS UI template
│       ├── storage.ts      # Storage interface + KV / Vercel KV backends
│       ├── storage.test.ts # Storage unit tests
│       ├── utils.ts        # Note ID generation/validation, HTML escaping, ClientIP
│       └── types.ts        # TypeScript type definitions
├── wrangler.toml           # Cloudflare Workers configuration
├── vercel.json             # Vercel deployment configuration
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md               # This file
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server with Wrangler |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm test` | Run Vitest unit tests |
| `npm run typecheck` | Run TypeScript type check (`tsc --noEmit`) |

## Configuration

### Note ID Format

Note IDs use a WORDnn format — a random dictionary word (3–5 uppercase letters, excluding ambiguous characters I/O/0/1) followed by 2 digits. Examples: `BLAST47`, `ACE23`, `ZEBRA99`.

### Storage

Both platforms use persistent KV storage with 7-day TTL. Cloudflare Workers uses native **Workers KV** via `env.KV`. Vercel Edge uses **Vercel KV** (Upstash Redis) via REST API. Both implement the same `Storage` interface.

TTL is 7 days by default.

## Testing

```bash
npm test           # Run Vitest
npm run typecheck  # TypeScript type checking
```

## Security

- Input validation: Note IDs restricted to `[A-HJ-NP-Z2-9]{3,32}`
- XSS protection: User content server-side HTML-escaped before rendering
- No third-party frontend dependencies

## License

MIT License — feel free to use and modify for your needs.

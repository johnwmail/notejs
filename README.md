# notejs

A lightweight, serverless note-taking web app written in TypeScript. Create, edit, and share notes with auto-save. Deploys on Cloudflare Workers (native KV) or Vercel Edge (Upstash Redis). No JS frameworks, no build step, zero dependencies — pure vanilla HTML/CSS/JS.

## Features

- **Simple Note Editor**: Lightweight web interface for creating and editing notes
- **Auto-Save**: Automatically saves note content every second
- **Shareable URLs**: Notes accessible via direct links with human-friendly WORDnn IDs
- **Password-Protected Notes**: Optional per-note password encryption; a protected note is deleted after its first successful read
- **CLI Help and Version**: `curl` on the app root prints usage examples and the build version; the browser header displays the same version as a link to the GitHub repository
- **Favicon**: `/favicon.ico` serves the app icon
- **Multi-Deployment**: Cloudflare Workers or Vercel Edge
- **Zero Dependencies**: No npm runtime deps — KV via native bindings (Cloudflare) or REST fetch (Vercel)
- **XSS Protection**: User content is HTML-escaped
- **Responsive**: Works on desktop and mobile
- **Print Support**: Print-friendly interface

## Quick Start

### Prerequisites

- Node.js 24+

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

**Storage**: Upstash Redis — persistent with 7-day TTL.

### Step 1: Create Upstash Redis (or Vercel KV)

Create a Redis database at [upstash.com](https://upstash.com) (free tier). Copy the `KV_REST_API_URL` and `KV_REST_API_TOKEN` from the REST API section.

Alternatively, create via Vercel Dashboard: Storage → Create → Redis. This auto-injects the env vars.

### Step 2: Set environment variables

```bash
npx vercel env add KV_REST_API_URL production --value <your-url>
npx vercel env add KV_REST_API_TOKEN production --value <your-token>
```

### Step 3: Deploy

```bash
npx vercel --prod
```

`vercel.json` builds `src/vercel.ts` as an Edge Function and routes all requests to it. The app uses `VercelKVStorage` which connects to Upstash Redis via its REST API.

Your app is live at `https://your-app.vercel.app` with persistent KV storage.

---

## CI/CD (GitHub Actions)

The repository includes test and deployment workflows:

### Test (`test.yml`)

Runs on every push/PR to `main`:
- `npm ci` → `tsc --noEmit` → `npm test`

### Deploy Cloudflare (`deploy-cloudflare.yml`)

Pushing a `v*` tag (for example, `v0.3.1`) deploys to the production Worker. Manual `workflow_dispatch` runs `wrangler preview --name staging --ignore-base-config` and produces a Cloudflare Preview URL without updating production. Preview uses a separate KV namespace. Both paths run typecheck and tests first; tag builds show the tag as the app version, while manual builds show the short commit SHA.

**Required GitHub Actions secrets:**

| Secret | Description |
|---|---|
| `CF_API_TOKEN` | Cloudflare API token with Workers permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_KV_ID` | Production KV namespace ID |
| `CLOUDFLARE_PREVIEW_KV_ID` | Separate KV namespace ID for Worker Previews |

### Deploy Vercel (`deploy-vercel.yml`)

Pushing a `v*` tag deploys to Vercel Production. Manual `workflow_dispatch` deploys with `--target preview`. When the GitHub Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET` is configured, the workflow uses `curl` with Vercel's protection-bypass header to smoke-test password-protected note creation, read-once, and burn behavior. Preview reads `KV_REST_API_URL` and `KV_REST_API_TOKEN` from the Vercel project's Preview environment; point these at a separate staging Redis database. Both paths run typecheck and tests first. Pushing a matching tag triggers both Cloudflare and Vercel production deployments.

**Required secrets:**

| Secret | Description |
|---|---|
| `VERCEL_TOKEN` | Vercel access token (create in Vercel Dashboard → Settings → Tokens) |
| `VERCEL_ORG_ID` | Your Vercel team/org ID (from `.vercel/project.json`) |
| `VERCEL_PROJECT_ID` | Your Vercel project ID (from `.vercel/project.json`) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel deployment protection automation bypass secret for Preview smoke tests |

**To set up secrets:** Go to your GitHub repo → Settings → Secrets and variables → Actions, then add each value. Run workflows via Actions tab → select workflow → Run workflow.

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
- Running `curl https://your-app.com/` prints terminal usage examples for text, files, and password-protected notes. Browser requests to `/` still show the note editor.
- The CLI help and browser badge use the build version; `/favicon.ico` serves the GIF favicon.
- Unprotected notes retain the existing behavior. A protected note shows a password prompt in a browser and does not return content before successful verification.
- A protected note can be read once with the correct password. Its encrypted content is removed after successful decryption; a later reload reports that it has already been read.
- `HEAD` requests and incorrect passwords do not consume a protected note.
- CLI clients can provide the note-specific password in the `X-Note-Password` header. A successful `curl` GET returns plaintext and consumes the note:

  ```bash
  curl -H "X-Note-Password: $NOTE_PASSWORD" https://your-app.com/noteid/BLAST47
  ```

### POST /

Save or delete a note.

**Request body (JSON):**
```json
{
  "noteId": "BLAST47",
  "content": "Note content here",
  "password": "optional password for a newly created protected note"
}
```

For an existing protected note, `password` must be its current password. `newPassword` is optional and rotates the password while saving content:

```json
{
  "noteId": "BLAST47",
  "content": "Updated note content",
  "password": "current note password",
  "newPassword": "optional replacement password"
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
- Supplying a `password` in JSON or `X-Note-Password` header when creating a note enables password protection and automatically enables burn-after-read. Passwords must be at least 8 characters.
- Password protection can only be selected when creating the note. It cannot be added to an existing unprotected note or removed from a protected note.
- Updating a protected note requires its current password. If `newPassword` is omitted, the current password is retained. Updating after a read republishes the note under the same ID, making it unread again.
- Browser unlock uses a JSON `POST` with `action: "unlock"`, `noteId`, and `password`; the response contains plaintext only after successful password verification.

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

# Create a password-protected note (use a strong, unique passphrase)
echo "Secret note" | curl -sL --data-binary @- \
  -H "X-Note-Password: $NOTE_PASSWORD" \
  https://your-app.com/

# Read the protected note once; a successful request burns it
curl -H "X-Note-Password: $NOTE_PASSWORD" \
  https://your-app.com/noteid/BLAST47
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
│       ├── version.ts      # Shared package version
│       ├── crypto.ts       # Per-note password derivation and AES-GCM encryption
│       ├── crypto.test.ts  # Protected-note cryptography tests
│       ├── storage.ts      # Storage interface + KV / Vercel KV backends
│       ├── storage.test.ts # Storage unit tests
│       ├── utils.ts        # Note ID generation/validation, HTML escaping, ClientIP
│       └── types.ts        # TypeScript type definitions
├── wrangler.toml           # Cloudflare Workers configuration
├── vercel.json             # Vercel deployment configuration
├── .vercelignore           # Files excluded from Vercel deployment
├── .github/workflows/      # GitHub Actions CI/CD workflows
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

Both platforms use persistent KV storage with 7-day TTL. Cloudflare Workers uses native **Workers KV** via `env.KV`. Vercel Edge uses **Upstash Redis** via REST API (`KV_REST_API_URL` / `KV_REST_API_TOKEN`). Both implement the same `Storage` interface.

## Testing

```bash
npm test           # Run Vitest
npm run typecheck  # TypeScript type checking
```

## Security

- Input validation: Note IDs restricted to `[A-HJ-NP-Z2-9]{3,32}`
- XSS protection: User content server-side HTML-escaped before rendering
- Password-protected note content is encrypted with AES-GCM using a per-note key derived with PBKDF2-SHA-256 and a random salt; passwords are not stored in plaintext.
- A protected note is single-read. After successful unlock, the ciphertext is removed; a short-lived verifier tombstone remains so authenticated edits can republish the same note ID until its seven-day expiry.
- The server receives the password and decrypts the note to serve browser and CLI clients. This protects stored KV values from a KV-only data leak, but is not end-to-end encryption; the running application can access plaintext.
- Passwords are unrecoverable. Use a long, unique passphrase; a KV dump allows offline password guesses against the verifier.
- No third-party frontend dependencies

## License

MIT License — feel free to use and modify for your needs.

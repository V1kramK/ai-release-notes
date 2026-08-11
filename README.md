# AI Release Notes Generator

A self-hosted, AI-powered release notes generator that collects commits, pull requests, and Jira tickets to produce professional, categorized release notes using Cursor AI.

## Features

- **In-app credential management** — GitHub PAT, Jira credentials, and Cursor API token stored session-scoped in memory only (never written to disk or logs)
- **Multi-repository support** — Select one or more repositories and set base/head refs per repo
- **Smart filtering** — Only includes commits prefixed with a Jira issue key (e.g. `FOO-123 Fix login bug`)
- **Deterministic categorization** — 5 fixed categories based on Jira issue type and priority (never AI-inferred):
  - 🔴 **Breaking Changes** — Blocker-priority issues
  - ✨ **Features** — Story / New Feature issue types
  - 🔧 **Enhancements** — Improvement / Enhancement
  - 🐛 **Bug Fixes** — Bug / Defect
  - 📋 **Other Changes** — Tasks, Sub-tasks, Epics, everything else
- **Streaming progress** — SSE-based live updates, never a blank wait screen
- **In-browser editing** — Review, edit, and copy the Markdown draft directly
- **Demo mode** — Generate without Cursor API calls using the fake summarizer
- **Security-first** — Helmet security headers, CSRF protection, input allow-listing, 1MB body cap, JSONL audit trail

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start the server (hot reload)
npm run dev

# In another terminal, start the client dev server
npm run dev --workspace=packages/client

# Visit http://localhost:5173
```

### Production

```bash
# Build everything
npm run build

# Start production server (serves React SPA + API)
node packages/server/dist/index.js
# Visit http://localhost:3001
```

### Docker

```bash
# Build and run
docker compose up --build

# Visit http://localhost:3001
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3001` | Server listen port |
| `LOG_LEVEL` | `info` | Pino log level |
| `CURSOR_MODEL_ID` | `claude-4-5` | Default Cursor model |
| `MAX_CONCURRENT_GENERATIONS` | `2` | Max parallel generations |
| `AUDIT_DIR` | `./data/audit` | Directory for JSONL audit log |

No credential environment variables are required to start the server. All credentials are provided at runtime via the in-app settings form.

## Commit Convention

For a commit to be included in release notes, its message must start with a Jira issue key:

```
FOO-123 Fix login button not responding on mobile
FOO-456: Add dark mode toggle to settings panel
```

The regex enforced: `^[A-Z][A-Z0-9]+-\d+`

## Architecture

```
┌─────────────────────────────────────────┐
│           React 18 SPA (Vite)           │
│  Settings │ Repo Select │ Editor/Copy   │
└─────────────────────────────────────────┘
                    │ SSE + REST
┌─────────────────────────────────────────┐
│       Express 4 BFF (TypeScript)        │
│  /api/credentials  /api/repositories   │
│  /api/generate     /api/health          │
└──────┬──────────────┬────────────┬──────┘
       │              │            │
  GitHub API      Jira REST    Cursor Cloud
  (Octokit)      (fetch)       Agent API
```

**Single process, no database, no cache, no queue.** Credentials live in-process memory only. The only persistence is an append-only JSONL audit log.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/credentials` | Save credentials for session |
| `GET` | `/api/credentials/status` | Get masked credential status |
| `DELETE` | `/api/credentials` | Clear session credentials |
| `GET` | `/api/repositories` | List GitHub repos (server-proxied) |
| `POST` | `/api/generate` | Generate notes (SSE stream) |
| `GET` | `/api/health` | Health + Cursor reachability check |

## Security

- All tokens stored in-memory only, never written to disk or logs
- `HttpOnly; Secure; SameSite=Strict` session cookie
- Input validated with Zod against allow-lists
- Helmet security headers (CSP, HSTS, no unsafe-inline)
- 1MB JSON body cap
- JSONL audit trail with ≥1-year lazy retention
- No user-supplied URLs fetched server-side (SSRF prevention)

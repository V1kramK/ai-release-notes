# AI Release Notes Generator

An AI-powered tool that automatically generates clear, business-friendly release notes from Git commits, Jira tickets, and GitHub pull requests — organized by feature rather than by repository.

---

## What it does

1. **Connects to GitHub** — fetches commits between any two branches or tags within a configurable date window (e.g. last 30 days).
2. **Filters by Jira project or pinned tickets** — only includes commits whose message starts with a Jira issue key (e.g. `OPL-35497`).
3. **Enriches each commit** — fetches the full Jira description (including nested Atlassian Document Format content), comments, and any linked GitHub pull request.
4. **Summarizes with AI** — sends the enriched context to the Cursor AI (via the official `@cursor/sdk`) and produces a short, non-technical paragraph per Jira ticket.
5. **Outputs Markdown** — organizes the result into categories (Features, Bug Fixes, Enhancements, etc.), grouped by Jira ticket with the ticket summary as the heading.

---

## Architecture

```
packages/
├── shared/          # Domain types, SSE schema, categories (shared between server & client)
├── server/          # Node.js + Express BFF (Backend for Frontend)
│   ├── routes/      # API endpoints (generate, credentials, branches, jira-*)
│   └── services/    # Adapters: GitHub (Octokit), Jira, Cursor SDK, generator logic
└── client/          # React + Vite single-page app
    ├── components/  # UI panels: credentials, scope selector, Jira selector, generate
    └── hooks/       # useGenerate – SSE state management
```

**Key design decisions:**
- **SSE for streaming** — the `/api/generate` endpoint uses Server-Sent Events so the client receives live checkpoint messages, section results, and heartbeats as they are produced.
- **Session-scoped credentials** — API tokens are stored in-memory server-side (never in the browser), scoped to an `HttpOnly; SameSite=Strict` session cookie.
- **Jira-grouped output** — release notes are grouped by Jira ticket, not by repository, so stakeholders see one entry per feature/fix regardless of how many repos were touched.
- **Official Cursor SDK** — uses `Agent.prompt()` from `@cursor/sdk` for AI summarization, which handles authentication, request format, retries, and run lifecycle correctly.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 20+ |
| npm | 9+ |
| GitHub Personal Access Token | `repo` scope |
| Jira API token | Cloud or Server/Data Center |
| Cursor API key | From https://cursor.com/settings/api-keys |

---

## Quick start

```bash
# 1. Clone and install
git clone <repo-url> ai-release-notes
cd ai-release-notes
npm install

# 2. Build all packages
npm run build --workspace=packages/shared
npm run build --workspace=packages/server
npm run build --workspace=packages/client

# 3. Start the server (runs on port 3001)
./start-local.sh

# 4. Open the app
open http://localhost:3001
```

The `start-local.sh` script kills any previous instance, optionally rebuilds (`--rebuild` flag), starts the server with nohup, and waits for it to be healthy.

---

## Usage walkthrough

### Step 1 — Enter credentials

Open `http://localhost:3001` and click **Configure credentials**. Enter:

| Field | Description |
|---|---|
| GitHub Token | Personal access token with `repo` scope |
| Jira Base URL | e.g. `https://yourcompany.atlassian.net` |
| Jira Email | Your Atlassian account email |
| Jira API Token | From https://id.atlassian.com/manage-profile/security/api-tokens |
| Cursor API Key | From https://cursor.com/settings/api-keys |
| Cursor Model | Choose from the dropdown (fetched live from your account) or leave on **Auto** |

Credentials are stored server-side in-memory for the session — they are never written to disk and never sent to the browser.

### Step 2 — Select repositories and date range

Pick the GitHub organizations/repositories you want to include. For each repository:

- **Base (from)** — a branch or tag to compare from (e.g. `v1.5.0` or `release/SUP-1370`)
- **Head (to)** — the branch or tag to compare to (e.g. `main` or `release/SUP-1376`)

Both fields have searchable dropdowns that load up to **500 branches** and **200 tags** from GitHub.

### Step 3 — Configure Jira scope

**Filter by Jira project** — select one or more projects from the dropdown. Only commits whose message starts with a key from those projects will be included.

**Pin specific tickets** — search for a Jira issue by key (e.g. `OPL-35497`) or by keyword. Pinned tickets are always resolved and described, even if they have no matching commit in the date range.

**Look back** — choose how many days of commits to include (7 / 15 / 30 / 60 / 90 days, default 30).

### Step 4 — Generate

Click **Generate Release Notes**. The live checkpoint log shows exactly what the system is doing:

```
✓ Pinned issues: OPL-35497 — only these will be resolved
✓ Fetching commits from OpseraEngineering/sfdc-integrator-service (release/SUP-1370 → main, last 30d)
✓ Found 16 matching commits (27 total in range)
✓ Linked 0 pull request(s) to commits
✓ Checking Jira reachability…
✓ Fetching Jira details for 1 issue key(s)…
✓ Resolved 1/1 Jira issues
✓ Checking Cursor API connectivity…
✓ Cursor API reachable — starting AI summarization
✓ Summarizing OPL-35497 — Refresh token for long-running deployments (16 change(s))…
✓ AI summarization complete for OPL-35497
```

### Step 5 — Copy the output

The generated release notes appear in Markdown format, organized by category and then by Jira ticket:

```markdown
# Release Notes

## Features

### OPL-35497 — Salesforce session refresh for long-running deployments

The platform now automatically refreshes Salesforce access tokens during
long deployment queue times, preventing pipeline failures caused by expired
sessions. This improves reliability for large deployments that take more
than 30 minutes to complete. (OPL-35497)

### OPL-35433 — Profile Compare and Deploy with Git backup

Teams can now choose to back up and push Salesforce profile changes to a
Git repository as part of the Compare and Deploy step, giving you a full
audit trail of configuration changes alongside your code. (OPL-35433)
```

Click **Copy Markdown** to copy the full output to your clipboard.

---

## Output format

Release notes are organized into five categories based on the Jira issue type and priority:

| Category | Triggered by |
|---|---|
| Breaking Changes | Priority = Blocker |
| Features | Issue type = Story or New Feature |
| Enhancements | Issue type = Improvement or Enhancement |
| Bug Fixes | Issue type = Bug or Defect |
| Other Changes | Everything else (Task, Sub-task, etc.) |

Within each category, each Jira ticket gets its own heading (`### OPL-XXXXX — <summary>`) followed by a short business-friendly paragraph written by the AI.

---

## API reference

All endpoints require a valid session cookie set by `POST /api/credentials`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/credentials` | Save GitHub, Jira, and Cursor tokens |
| `GET` | `/api/credentials/status` | Check which credentials are configured |
| `GET` | `/api/credentials/models` | List available Cursor AI models |
| `DELETE` | `/api/credentials` | Clear the current session |
| `GET` | `/api/repos` | List GitHub repositories |
| `GET` | `/api/branches` | List branches and tags for a repo |
| `GET` | `/api/jira-projects` | List accessible Jira projects |
| `GET` | `/api/jira-issues` | Search Jira issues by key or keyword |
| `POST` | `/api/generate` | Stream release notes via SSE |
| `GET` | `/` | Serves the React SPA |

### POST /api/generate

Request body:

```json
{
  "scopes": [
    {
      "owner": "OpseraEngineering",
      "repo": "sfdc-integrator-service",
      "base": "release/SUP-1370",
      "head": "main"
    }
  ],
  "jiraProjectKeys": ["OPL"],
  "pinnedIssueKeys": ["OPL-35497"],
  "lookbackDays": 30
}
```

SSE events emitted:

| Event | Payload | Description |
|---|---|---|
| `checkpoint` | `{ message: string }` | Live stage-by-stage status message |
| `phase` | `{ phase, repo?, pct? }` | High-level phase change |
| `counts` | `{ repo, commitsExamined, commitsIncluded }` | Commit count summary |
| `section` | `{ category, repo, content, jiraKey?, jiraSummary? }` | One AI-generated section |
| `warning` | `{ repo?, message }` | Non-fatal issue (Jira not accessible, etc.) |
| `heartbeat` | `{ ts }` | Keep-alive during long operations |
| `done` | `{ totalCommits, totalSections, durationMs }` | Generation complete |
| `error` | `{ code, message, retryable }` | Fatal error |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port the server listens on |
| `MAX_CONCURRENT_GENERATIONS` | `2` | Max simultaneous generate requests |
| `CURSOR_MODEL_ID` | `auto` | Override the default Cursor model |
| `NODE_ENV` | `development` | Set to `production` for stricter CSP |

---

## Development

```bash
# Run server in dev mode (auto-restart on changes)
cd packages/server && npm run dev

# Run client dev server (Vite HMR)
cd packages/client && npm run dev

# Type-check all packages
npm run build --workspace=packages/shared
npm run build --workspace=packages/server
tsc --noEmit --project packages/client/tsconfig.json
```

---

## How Jira description parsing works

Jira Cloud stores issue descriptions in **Atlassian Document Format (ADF)** — a nested JSON tree similar to ProseMirror. A custom recursive `adfToText()` function traverses all node types:

- Headings, paragraphs, inline text
- Bullet lists, ordered lists, list items
- Code blocks (with language label)
- Tables (header and cell content)
- Blockquotes, panels, horizontal rules
- Inline cards (linked URLs) and mentions

This ensures the AI receives the complete description, including deeply nested structures, rather than a truncated or partially extracted version.

---

## Security notes

- API tokens are stored in-memory only — they are **never written to disk**, never logged, and never sent to the browser.
- Session cookies are `HttpOnly; SameSite=Strict` with a 4-hour TTL.
- All user inputs are validated with Zod schemas before use.
- Request body size is capped at 1 MB.
- Helmet is used for standard HTTP security headers.

---

## License

MIT

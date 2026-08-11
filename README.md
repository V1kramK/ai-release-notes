# AI Release Notes Generator

> **Author:** Vikram Singh Kushwaha · [Repository](https://github.com/V1kramK/ai-release-notes)

An AI-powered, self-hosted tool that automatically generates clear, **business-friendly release notes** from Git commits, Jira tickets, and GitHub pull requests — organized by Jira ticket so every stakeholder gets a coherent story regardless of how many repositories were involved.

---

## The Problem

Every engineering team that ships software owes its stakeholders an answer to one question: **what changed?**

Today that answer is assembled by hand — a release manager opens the commit log, cross-references PRs, opens Jira tickets one by one, and hand-writes a summary. This takes **2–4 hours per release**, produces inconsistent output, and is stale by the time it circulates.

This tool cuts that to **under 10 minutes**.

---

## How It Works

```
Developer pushes commits (e.g. "OPL-35497 Refresh SF token for long queues")
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│               AI Release Notes Generator                 │
│                                                         │
│  1. COLLECT     GitHub API → commits between base…head  │
│                 Filter: Jira key prefix at start        │
│                                                         │
│  2. ENRICH      GitHub → linked PR title + body         │
│                 Jira   → description, comments, labels  │
│                          (full ADF parser, not trimmed) │
│                                                         │
│  3. CATEGORIZE  Deterministic rule table:               │
│                 Blocker → Breaking Changes              │
│                 Story   → Features                      │
│                 Bug     → Bug Fixes  …etc.              │
│                                                         │
│  4. SUMMARIZE   Cursor AI (via @cursor/sdk)             │
│                 → one business-friendly paragraph       │
│                   per Jira ticket                       │
│                                                         │
│  5. STREAM      SSE events → live log in browser        │
└─────────────────────────────────────────────────────────┘
              │
              ▼
Release Manager reviews, edits, copies to Confluence / Slack / GitHub Releases
```

---

## Architecture

### System Layers

```
┌────────────────────────────────────────────────────────┐
│                React 18 SPA (client)                    │
│                                                        │
│  Step 1: Credentials panel  (GitHub · Jira · Cursor)   │
│  Step 2: Scope selector     (repo · branch/tag · days) │
│  Step 3: Jira selector      (projects · pinned tickets)│
│  Step 4: Generate           (live checkpoint log)      │
│  Step 5: Output             (editable Markdown + copy) │
└───────────────────────┬────────────────────────────────┘
                        │  HTTP / SSE (EventSource)
┌───────────────────────▼────────────────────────────────┐
│           Node.js 20 + Express 4  (BFF Server)          │
│                                                        │
│  Routes                                                │
│  ├─ POST /api/generate          SSE stream             │
│  ├─ POST /api/credentials       token intake + session │
│  ├─ GET  /api/credentials/status                       │
│  ├─ GET  /api/credentials/models  Cursor model list    │
│  ├─ GET  /api/repos             GitHub proxy           │
│  ├─ GET  /api/branches          branch + tag listing   │
│  ├─ GET  /api/jira-projects     project list           │
│  ├─ GET  /api/jira-issues       ticket search          │
│  └─ GET  /api/health                                   │
│                                                        │
│  Services                                              │
│  ├─ generator.ts   pipeline orchestration              │
│  ├─ github.ts      Octokit adapter                     │
│  ├─ jira.ts        Jira REST + ADF-to-text parser      │
│  ├─ cursor.ts      @cursor/sdk  Agent.prompt()         │
│  ├─ session store  in-memory Map (no database)         │
│  └─ audit sink     append-only JSONL                   │
└───────┬────────────────┬────────────────┬──────────────┘
        │                │                │
        ▼                ▼                ▼
   GitHub API        Jira API       Cursor AI API
   (Octokit)    (Cloud / Server)   (@cursor/sdk)
```

### Data Flow

The generation pipeline has six stages — all within a single SSE request, nothing written to disk:

| Stage | What happens |
|---|---|
| **1 · Scope intake** | Validate repo allow-list and refs against character allow-list (SSRF gate) |
| **2 · Commit collection** | `GET /compare/{base}…{head}` with full pagination (`per_page=100`) to bypass GitHub's 250-commit cap. Date-window filter applied (default last 30 days). |
| **3 · Filter & key extract** | Regex `^[A-Z][A-Z0-9]+-\d+` anchored at message start. Non-matching commits excluded and counted. |
| **4 · Enrichment** | PR resolution (SHA → PR via GitHub API). Jira batch fetch using `key in (…)` JQL — one request for all keys. Full ADF description parsed recursively. |
| **5 · Deterministic categorization** | Pure function `(issueType, priority) → category`. Blocker priority overrides issue type to Breaking Changes. AI never chooses categories. |
| **6 · AI summarization** | `Agent.prompt()` via `@cursor/sdk`. One paragraph per Jira ticket, business-friendly language. Results streamed as SSE `section` events as they complete. |

### Monorepo Structure

```
ai-release-notes/
├── packages/
│   ├── shared/                # Shared types + SSE schema
│   │   └── src/
│   │       ├── domain.ts      # CommitInfo, JiraIssue, GeneratedSection, …
│   │       ├── sse.ts         # Zod-validated SSE event schemas
│   │       └── categories.ts  # 5-category rule table
│   │
│   ├── server/                # Node.js BFF
│   │   └── src/
│   │       ├── ports/         # Injected interface contracts (GitHubPort, JiraPort, SummarizerPort, …)
│   │       ├── routes/        # Express route handlers
│   │       └── services/      # GitHub, Jira, Cursor adapters + generator pipeline
│   │
│   └── client/                # React + Vite SPA
│       └── src/
│           ├── components/    # CredentialsPanel, ScopeSelector, JiraProjectSelector, GeneratePanel
│           ├── hooks/         # useGenerate (SSE state machine)
│           └── lib/           # API client
│
├── docs/
│   └── PROJECT_OVERVIEW.md    # Team, write-up, artifact index
├── start-local.sh             # Server startup + health-check script
└── README.md
```

---

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js 20+ | https://nodejs.org |
| GitHub Personal Access Token | Needs `repo` scope |
| Jira API token | Cloud: https://id.atlassian.com/manage-profile/security/api-tokens |
| Cursor API key | https://cursor.com/settings/api-keys |

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/V1kramK/ai-release-notes.git
cd ai-release-notes
npm install

# 2. Build all packages
npm run build --workspace=packages/shared
npm run build --workspace=packages/server
npm run build --workspace=packages/client

# 3. Start (runs on port 3001)
./start-local.sh

# To rebuild and restart in one step:
./start-local.sh --rebuild

# 4. Open
open http://localhost:3001
```

---

## Usage Walkthrough

### Step 1 — Enter Credentials

Click **Configure credentials** and enter:

| Field | Description |
|---|---|
| GitHub Token | Personal access token with `repo` scope |
| Jira Base URL | e.g. `https://yourcompany.atlassian.net` |
| Jira Email | Your Atlassian account email |
| Jira API Token | From https://id.atlassian.com/manage-profile/security/api-tokens |
| Cursor API Key | From https://cursor.com/settings/api-keys |
| Cursor Model | Dropdown populated from your account — or leave on **Auto** |

Tokens are stored server-side in memory only. They are never written to disk and never returned to the browser.

### Step 2 — Select Repositories and Date Range

For each repository, pick:
- **Base (from)** — e.g. `release/v1.5.0` or a tag
- **Head (to)** — e.g. `main`
- Both fields have searchable dropdowns loading up to **500 branches** and **200 tags**

### Step 3 — Configure Jira Scope

- **Filter by project** — select one or more Jira projects; only commits matching those key prefixes are included
- **Pin specific tickets** — search by key (e.g. `OPL-35497`) or keyword; pinned tickets are always included even with no matching commits
- **Look back** — 7 / 15 / 30 / 60 / 90 days (default 30)

### Step 4 — Generate

Click **Generate Release Notes**. The live checkpoint log shows each stage:

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

### Step 5 — Copy the Output

Generated release notes appear as editable Markdown, grouped by Jira ticket:

```markdown
# Release Notes

## Features

### OPL-35497 — Salesforce session refresh for long-running deployments

The platform now automatically refreshes Salesforce access tokens during long
deployment queue times, preventing pipeline failures caused by expired sessions.
This improves reliability for large deployments that typically take more than
30 minutes to complete. (OPL-35497)

### OPL-35433 — Profile Compare and Deploy with Git backup

Teams can now choose to back up and push Salesforce profile changes to a Git
repository as part of the Compare and Deploy step, providing a full audit trail
of configuration changes alongside source code. (OPL-35433)
```

Click **Copy Markdown** to copy to clipboard.

---

## Output Format

Five fixed categories, assigned by rule — never by AI inference:

| Category | Triggered by |
|---|---|
| **Breaking Changes** | Jira priority = Blocker |
| **Features** | Issue type = Story or New Feature |
| **Enhancements** | Issue type = Improvement or Enhancement |
| **Bug Fixes** | Issue type = Bug or Defect |
| **Other Changes** | Task, Sub-task, Epic, or anything else |

Within each category, every Jira ticket gets its own heading (`### OPL-XXXXX — <summary>`) with a short business-friendly paragraph.

---

## SSE Event Contract

`POST /api/generate` streams the following events:

| Event | Payload | Description |
|---|---|---|
| `checkpoint` | `{ message: string }` | Stage-by-stage status message |
| `phase` | `{ phase, repo?, pct? }` | High-level phase transition |
| `counts` | `{ repo, commitsExamined, commitsIncluded }` | Commit count breakdown |
| `section` | `{ category, repo, content, jiraKey?, jiraSummary? }` | One AI-generated ticket summary |
| `warning` | `{ repo?, message }` | Non-fatal issue (Jira unreachable, key not found, etc.) |
| `heartbeat` | `{ ts }` | Keep-alive during long async operations |
| `done` | `{ totalCommits, totalSections, durationMs }` | Generation complete |
| `error` | `{ code, message, retryable }` | Fatal error |

---

## API Reference

All endpoints (except `/api/health`) require a session cookie from `POST /api/credentials`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/credentials` | Save GitHub, Jira, and Cursor tokens |
| `GET` | `/api/credentials/status` | Check which credentials are configured |
| `GET` | `/api/credentials/models` | List Cursor AI models (from SDK) |
| `DELETE` | `/api/credentials` | Clear the current session |
| `GET` | `/api/repos` | List GitHub repositories |
| `GET` | `/api/branches` | List branches and tags for a repo |
| `GET` | `/api/jira-projects` | List accessible Jira projects |
| `GET` | `/api/jira-issues` | Search Jira issues by key or keyword |
| `POST` | `/api/generate` | Stream release notes via SSE |
| `GET` | `/api/health` | Liveness + Cursor reachability check |
| `GET` | `/` | React SPA |

### POST /api/generate — Request Body

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

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `MAX_CONCURRENT_GENERATIONS` | `2` | Concurrent generate requests allowed |
| `CURSOR_MODEL_ID` | `auto` | Default Cursor model override |
| `NODE_ENV` | `development` | Set to `production` for stricter CSP |

---

## Security

- **Credentials stored server-side only** — never written to disk, never logged, never returned to the browser (masked previews only)
- **Session cookie** — `HttpOnly; SameSite=Strict`, 4-hour TTL, cleared on idle and process exit
- **No SQL, no subprocess** — SQL injection and OS command injection eliminated by design
- **SSRF hardening** — Jira URL must be `https://` and pass allow-list; repo selections validated against the server-proxied list; refs validated against a character allow-list
- **Cursor base URL** — compiled-in and fixed, never user-supplied
- **CSP** — enforced via Helmet with no `unsafe-inline`
- **Audit trail** — append-only JSONL, security events only (no release content, no tokens)

---

## How Jira ADF Parsing Works

Jira Cloud stores descriptions in **Atlassian Document Format (ADF)** — a nested JSON tree. A custom recursive `adfToText()` function traverses all node types so the full description is sent to the AI:

- Headings, paragraphs, inline text
- Bullet and ordered lists, nested list items
- Code blocks (with language label)
- Tables (header cells and body cells)
- Blockquotes, panels, horizontal rules
- Inline cards (linked URLs) and user mentions

---

## Development

```bash
# Type-check server
npm run build --workspace=packages/server

# Type-check client
tsc --noEmit --project packages/client/tsconfig.json

# Run with fake AI summarizer (no Cursor token needed)
# Pass useFake: true in the generate request body
```

---

## Project Documentation

See [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) for the full project overview including team members, design decisions, persona analysis, and artifact index.

---

## License

Opsera

# Project Overview — AI-Driven Release Notes Generator

---

## Team

| Name | Role | GitHub |
|---|---|---|
| Vikram Singh Kushwaha | Author · Architect · Engineer | [@V1kramK](https://github.com/V1kramK) |

---

## Repository

| | |
|---|---|
| **URL** | https://github.com/V1kramK/ai-release-notes |
| **README** | https://github.com/V1kramK/ai-release-notes/blob/main/README.md |
| **Branch** | `main` |
| **License** | MIT |

---

## Problem Statement

Every engineering team that ships software owes its stakeholders an answer to a simple question: **what changed?**

Today that answer is assembled by hand. A release manager opens the commit log, cross-references pull requests, opens Jira tickets one by one, and hand-writes a summary — a task estimated at **2–4 hours per release**. The result is:

- **Inconsistent** between teams and releases
- **Frequently incomplete** — significant changes get missed
- **Stale** by the time it is circulated
- **Wasteful** — engineers and release managers are spending engineering hours on clerical work

This problem is solved by this tool.

---

## Solution

The **AI Release Notes Generator** is a deliberately minimal, self-hosted tool that automates release note creation from three sources that already exist in every engineering team's workflow:

1. **Git commit messages** — filtered to those starting with a Jira issue key (e.g. `OPL-35497`)
2. **GitHub Pull Request descriptions** — linked to each commit for richer context
3. **Jira ticket details** — summary, full description (including nested ADF content), labels, issue type, priority, and comments

The tool enriches each commit with this context, deterministically categorizes every change into one of five fixed categories, and then asks a **Cursor AI agent** to turn the raw material into clean, readable, business-friendly prose. The draft appears progressively on screen as an editable Markdown document, grouped by **Jira ticket** (not by repository), which the user reviews, edits if needed, and copies wherever it needs to go.

### Impact and Benefits

| Metric | Target |
|---|---|
| Time to first draft | ≤ 60 seconds for up to ~250 commits |
| Hands-on effort per release | Under 10 minutes (from a 2–4 hour baseline) |
| Effort reduction | ≥ 90% (~8–16 hours saved per team per month) |
| Bullets used unedited | ≥ 80% |
| Category schema conformance | 100% (computed by rule, never AI-inferred) |

---

## How It Works

```
Developer pushes commits with Jira key prefix
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI Release Notes Generator                  │
│                                                             │
│  1. COLLECT    GitHub API → commits between base..head      │
│                Filter: ^[A-Z][A-Z0-9]+-\d+ at start        │
│                                                             │
│  2. ENRICH     GitHub API → linked PR title + body          │
│                Jira API  → summary, description, comments   │
│                           (full ADF parsing, not truncated) │
│                                                             │
│  3. CATEGORIZE Pure function: (issueType, priority) →       │
│                Breaking Changes / Features / Enhancements / │
│                Bug Fixes / Other Changes                    │
│                                                             │
│  4. SUMMARIZE  Cursor AI (Agent.prompt via @cursor/sdk)     │
│                → business-friendly paragraph per ticket     │
│                                                             │
│  5. STREAM     SSE events → live checkpoint log in browser  │
│                                                             │
│  6. OUTPUT     Editable Markdown, grouped by Jira ticket    │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
Release Manager reviews, edits, copies to Confluence / Slack / GitHub Releases
```

### Categorization Rules (Deterministic — Never AI-Inferred)

| Jira Condition | Category |
|---|---|
| Priority = **Blocker** | Breaking Changes |
| Issue type = Story or New Feature | Features |
| Issue type = Improvement or Enhancement | Enhancements |
| Issue type = Bug or Defect | Bug Fixes |
| Everything else (Task, Sub-task, Epic, etc.) | Other Changes |

---

## Architecture

### System Layers

```
┌──────────────────────────────────────────────────────┐
│              Browser (React 18 SPA)                   │
│  Credentials panel · Scope selector · Jira filter    │
│  Generate button · Live checkpoint log · MD preview  │
└─────────────────────┬────────────────────────────────┘
                      │  HTTP / SSE (EventSource)
┌─────────────────────▼────────────────────────────────┐
│         Node.js 20 + Express 4 (BFF Server)           │
│                                                       │
│  Routes:                                              │
│    POST /api/generate          ← SSE stream           │
│    POST /api/credentials       ← token intake         │
│    GET  /api/branches          ← ref listing          │
│    GET  /api/jira-projects     ← project list         │
│    GET  /api/jira-issues       ← ticket search        │
│    GET  /api/credentials/models ← model list          │
│    GET  /api/health                                   │
│                                                       │
│  Services:                                            │
│    generator.ts   ← pipeline orchestration            │
│    github.ts      ← Octokit adapter                  │
│    jira.ts        ← Jira REST + ADF parser            │
│    cursor.ts      ← @cursor/sdk Agent.prompt()        │
│    session store  ← in-memory Map (no DB)             │
│    audit sink     ← append-only JSONL                 │
└──────┬────────────────┬───────────────┬───────────────┘
       │                │               │
       ▼                ▼               ▼
  GitHub API        Jira API      Cursor AI API
  (Octokit)     (Cloud/Server)  (@cursor/sdk)
```

### Key Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 + TypeScript strict | Single language across SPA and API; first-class Octokit/Jira clients |
| Persistence | None (request-scoped memory only) | Retention/purge satisfied by design; no DB to operate |
| Streaming | Server-Sent Events (SSE) | Unidirectional server→client; native `EventSource` reconnect; cancel via `AbortController` |
| AI provider | Cursor Cloud Agent (`@cursor/sdk`) | Official SDK — correct request format, auth, retries, and run lifecycle |
| Categorization | Hardcoded 5-category rule table | Guarantees 100% schema conformance — AI never chooses categories |
| Credential storage | In-process session `Map` + `HttpOnly` cookie | Tokens never reach the browser, never touch disk |
| Grouping | Per Jira ticket (not per repository) | Stakeholders see a coherent story per feature/fix regardless of repo count |

### Monorepo Structure

```
ai-release-notes/
├── packages/
│   ├── shared/              # Domain types, SSE schema, categories
│   │   └── src/
│   │       ├── domain.ts    # CommitInfo, JiraIssue, GeneratedSection, etc.
│   │       ├── sse.ts       # SSE event schemas (Zod) + serializer
│   │       └── categories.ts # 5-category rule table
│   │
│   ├── server/              # Node.js BFF
│   │   └── src/
│   │       ├── ports/       # Injected interface contracts
│   │       ├── routes/      # Express route handlers
│   │       └── services/    # GitHub, Jira, Cursor adapters + generator
│   │
│   └── client/              # React + Vite SPA
│       └── src/
│           ├── components/  # CredentialsPanel, ScopeSelector, JiraProjectSelector, GeneratePanel
│           ├── hooks/       # useGenerate (SSE state machine)
│           └── lib/         # API client
│
├── start-local.sh           # Server startup + health-check script
├── README.md                # Full usage guide
└── docs/
    └── PROJECT_OVERVIEW.md  # This document
```

---

## Supporting Artifacts

The following design artifacts were produced during the project and are available in the project documents folder:

| Artifact | Description |
|---|---|
| **Intent Profile** | Vision, target personas, core features, technical constraints, and confidence analysis for the project |
| **PRD Spec** | Full product requirements: business objectives, success criteria, user stories, acceptance criteria, risks, and out-of-scope items |
| **Architecture Options** | Architecture executive summary, system layering, data flow diagram, authentication flow, security architecture (OWASP mapping), and deployment model |
| **User Stories** | 15 detailed user stories (US-001 through US-015) with full acceptance criteria, covering credential management, repo selection, Jira filtering, streaming, editing, error handling, and security |
| **Requirements Traceability Matrix** | Maps 13 requirements (REQ-001 through REQ-013) to PRD sections, architecture components, user stories, and implementation status |
| **Testing** | 76 functional test cases mapped to work items, covering all acceptance criteria |
| **Additional Requirements** | Original problem brief including use cases, AI model approach, technical feasibility, and impact assessment |

---

## User Personas

| Persona | Role | How They Benefit |
|---|---|---|
| **Release Manager / DevOps Engineer** | Primary user — enters credentials, selects repos and ranges, reviews and copies the draft | Release-note preparation drops from 2–4 hours to under 10 minutes |
| **Developer** | Writes commits with Jira key prefix and PR descriptions | Zero added effort — existing commit discipline is the only requirement |
| **QA Engineer** | Reads the categorized summary to scope regression testing | Breaking Changes and Bug Fixes sections complete enough to plan test scope without opening Jira |
| **Engineering Manager / Product / Customer Teams** | Consumes copied notes for stakeholder communication | AI-rewritten prose in plain language, ready to paste into a wiki, chat, or email |
| **Instance Operator** | Runs the single self-hosted container | No database, no queue, no credential environment variables required at startup |

---

## Security Model

- **Credentials never leave the server** — API tokens enter via the settings form, are validated server-side, and stored only in an in-memory `Map` keyed by an opaque session ID. They are never written to disk, never logged, and never returned to the browser (masked previews only).
- **Session cookie** — `HttpOnly; SameSite=Strict` with a 4-hour TTL. Auto-cleared on idle expiry and process exit.
- **No SQL, no shell** — eliminates SQL injection and OS command injection by design (no database, no subprocess).
- **SSRF hardening** — Jira base URL must be `https://` and pass an allow-list check; repository selections must match the server-proxied list; refs validated against a character allow-list.
- **Cursor API URL** — compiled-in and fixed, never user-supplied.
- **Content Security Policy** — enforced via Helmet with no `unsafe-inline`.
- **Audit trail** — append-only JSONL file records all credential lifecycle and generation events (no release content, no tokens).

---

## Out of Scope (v1)

- Database persistence or release history server-side
- Publish integrations (GitHub Releases, Slack, Confluence, Email)
- PDF / HTML export
- Webhook or CI/CD triggers
- Authentication, RBAC, or multi-tenant isolation
- Fallback AI providers (OpenAI, Anthropic, self-hosted)
- Scheduled or automatic generation

These are deferred to a post-prototype phase, gated on a Beta evaluation of time savings and adoption.

---

## Local Setup

```bash
# Clone
git clone https://github.com/V1kramK/ai-release-notes.git
cd ai-release-notes

# Install all workspaces
npm install

# Build
npm run build --workspace=packages/shared
npm run build --workspace=packages/server
npm run build --workspace=packages/client

# Start (port 3001)
./start-local.sh

# Rebuild and restart
./start-local.sh --rebuild
```

See [README.md](../README.md) for the full usage walkthrough.

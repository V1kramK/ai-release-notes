import { CATEGORY_ORDER, categorizeIssue, serializeSSEEvent } from "@release-notes/shared";
import type { EnrichedChange, GeneratedSection, JiraIssue, RepoScope } from "@release-notes/shared";
import type { Response } from "express";
import type { GitHubPort, JiraPort, SummarizerPort } from "../ports/index.js";

const MAX_CONCURRENT_SUMMARIZE = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      const task = tasks[i];
      if (task) {
        results[i] = await task();
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function sendEvent(res: Response, event: Parameters<typeof serializeSSEEvent>[0]): void {
  if (!res.writableEnded) {
    res.write(serializeSSEEvent(event));
  }
}

export interface GenerateOptions {
  jiraProjectKeys?: string[];
  /** How many days back to look for commits. Default 30. */
  lookbackDays?: number;
  /** If set, Jira resolution is limited to exactly these keys; commit list is also filtered to only these keys. */
  pinnedIssueKeys?: string[];
}

export async function generateReleaseNotes(
  scopes: RepoScope[],
  github: GitHubPort,
  jira: JiraPort,
  summarizer: SummarizerPort,
  res: Response,
  signal: AbortSignal,
  options: GenerateOptions = {}
): Promise<void> {
  const { jiraProjectKeys, lookbackDays = 30, pinnedIssueKeys } = options;
  const sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // If the user pinned specific tickets, treat those as the authoritative filter
  const pinnedSet = pinnedIssueKeys && pinnedIssueKeys.length > 0
    ? new Set(pinnedIssueKeys.map((k) => k.toUpperCase()))
    : null;

  // Build commit-message filter regex
  const jiraKeyPattern = pinnedSet
    // Pinned mode: only commits whose first token exactly matches a pinned key
    ? new RegExp(`^(${[...pinnedSet].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`)
    : jiraProjectKeys && jiraProjectKeys.length > 0
      ? new RegExp(`^(${jiraProjectKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})-\\d+`)
      : /^([A-Z][A-Z0-9]+-\d+)/;

  // Surface what options were actually received so users can verify in the UI
  if (pinnedIssueKeys && pinnedIssueKeys.length > 0) {
    sendEvent(res, { name: "checkpoint", data: { message: `Pinned issues: ${pinnedIssueKeys.join(", ")} — only these will be resolved` } });
  } else if (jiraProjectKeys && jiraProjectKeys.length > 0) {
    sendEvent(res, { name: "checkpoint", data: { message: `Jira filter: projects ${jiraProjectKeys.join(", ")}, last ${lookbackDays} days` } });
  } else {
    sendEvent(res, { name: "checkpoint", data: { message: `No Jira filter set — all Jira-prefixed commits will be included (last ${lookbackDays} days)` } });
  }

  const startTime = Date.now();
  const allChanges: EnrichedChange[] = [];

  for (const scope of scopes) {
    if (signal.aborted) return;

    sendEvent(res, {
      name: "phase",
      data: { phase: "collecting_commits", repo: scope.repo, pct: 0 },
    });

    try {
      sendEvent(res, { name: "checkpoint", data: { message: `Fetching commits from ${scope.owner}/${scope.repo} (${scope.base} → ${scope.head}, last ${lookbackDays}d)` } });

      const allCommits = await Promise.race([
        github.listCommits(scope.owner, scope.repo, scope.base, scope.head),
        sleep(45_000).then((): never => { throw new Error("GitHub commit fetch timed out after 45s"); }),
      ]);

      // Filter by date window, then by Jira key pattern
      const commits = allCommits
        .filter((c) => new Date(c.date) >= sinceDate)
        .filter((c) => jiraKeyPattern.test(c.message));

      sendEvent(res, {
        name: "counts",
        data: {
          repo: `${scope.owner}/${scope.repo}`,
          commitsExamined: allCommits.length,
          commitsIncluded: commits.length,
        },
      });
      sendEvent(res, { name: "checkpoint", data: { message: `Found ${commits.length} matching commits (${allCommits.length} total in range)` } });

      sendEvent(res, {
        name: "phase",
        data: { phase: "resolving_pull_requests", repo: scope.repo, pct: 10 },
      });

      const prTasks = commits.map((commit) => async () => {
        if (signal.aborted) return undefined;
        try {
          return await github.findPullRequestForCommit(scope.owner, scope.repo, commit.sha);
        } catch {
          return undefined;
        }
      });

      const prs = await pLimit(prTasks, 5);
      const prFound = prs.filter(Boolean).length;
      sendEvent(res, { name: "checkpoint", data: { message: `Linked ${prFound} pull request(s) to commits` } });

      sendEvent(res, {
        name: "phase",
        data: { phase: "resolving_jira_issues", repo: scope.repo, pct: 30 },
      });

      // Keys to resolve: pinned set takes priority; otherwise use all unique commit keys
      const uniqueKeys = pinnedSet
        ? [...pinnedSet]
        : [...new Set(commits.map((c) => c.jiraKey))];

      const jiraResultMap = new Map<string, JiraIssue | undefined>();

      if (uniqueKeys.length > 0) {
        sendEvent(res, { name: "checkpoint", data: { message: `Checking Jira reachability…` } });
        sendEvent(res, { name: "heartbeat", data: { ts: Date.now() } });

        const jiraReachable = await Promise.race([
          jira.ping(),
          sleep(6_000).then(() => false),
        ]);

        if (!jiraReachable) {
          sendEvent(res, {
            name: "warning",
            data: { repo: scope.repo, message: `Jira unreachable for ${scope.repo} — check base URL, email and API token. Skipping Jira enrichment.` },
          });
        } else {
          sendEvent(res, { name: "checkpoint", data: { message: `Fetching Jira details for ${uniqueKeys.length} issue key(s)…` } });

          // Keep heartbeats flowing during the batch call so the UI doesn't look frozen
          const heartbeatTimer = setInterval(() => {
            sendEvent(res, { name: "heartbeat", data: { ts: Date.now() } });
          }, 2000);

          try {
            const batchResult = await Promise.race([
              jira.batchGetIssues(uniqueKeys),
              sleep(30_000).then(() => new Map<string, JiraIssue>()),
            ]);
            clearInterval(heartbeatTimer);

            for (const key of uniqueKeys) {
              jiraResultMap.set(key, batchResult.get(key));
            }

            const resolved = batchResult.size;
            const missed = uniqueKeys.length - resolved;
            sendEvent(res, { name: "phase", data: { phase: "resolving_jira_issues", repo: scope.repo, pct: 70 } });
            sendEvent(res, { name: "checkpoint", data: { message: `Resolved ${resolved}/${uniqueKeys.length} Jira issues${missed > 0 ? ` (${missed} not accessible)` : ""}` } });
          } catch (err) {
            clearInterval(heartbeatTimer);
            sendEvent(res, {
              name: "warning",
              data: { repo: scope.repo, message: `Jira batch lookup failed: ${err instanceof Error ? err.message : "unknown"}` },
            });
          }
        }
      } else {
        sendEvent(res, { name: "checkpoint", data: { message: `No Jira keys found in commits — skipping Jira enrichment` } });
      }

      for (let i = 0; i < commits.length; i++) {
        const commit = commits[i];
        if (!commit) continue;
        const pr = prs[i];
        const jiraIssue = jiraResultMap.get(commit.jiraKey);

        const category = categorizeIssue(
          jiraIssue?.issueType ?? "Task",
          jiraIssue?.priority ?? "Medium"
        );

        allChanges.push({
          commit,
          pullRequest: pr,
          jiraIssue,
          category,
          repo: `${scope.owner}/${scope.repo}`,
        });
      }

      // For pinned keys that had no matching commit in this range, still include them
      // as context-only entries so the AI can write about them.
      if (pinnedSet) {
        const coveredKeys = new Set(commits.map((c) => c.jiraKey));
        for (const key of pinnedSet) {
          if (coveredKeys.has(key)) continue;
          const jiraIssue = jiraResultMap.get(key);
          if (!jiraIssue) continue; // can't include if Jira couldn't resolve it either
          const category = categorizeIssue(jiraIssue.issueType, jiraIssue.priority);
          allChanges.push({
            commit: { sha: "", message: `${key} (pinned — no commit in range)`, jiraKey: key, author: "", date: new Date().toISOString() },
            pullRequest: undefined,
            jiraIssue,
            category,
            repo: `${scope.owner}/${scope.repo}`,
          });
        }
      }
    } catch (err) {
      sendEvent(res, {
        name: "warning",
        data: {
          repo: scope.repo,
          message: `Failed to process ${scope.owner}/${scope.repo}: ${err instanceof Error ? err.message : String(err)}`,
        },
      });
    }
  }

  // Always send done — wrap entire summarization so no early return skips it
  try {
    if (signal.aborted) {
      sendEvent(res, { name: "checkpoint", data: { message: `Generation cancelled` } });
      return;
    }

    sendEvent(res, { name: "phase", data: { phase: "summarizing", pct: 50 } });
    sendEvent(res, { name: "checkpoint", data: { message: `Summarizing ${allChanges.length} change(s) across ${scopes.length} repo(s) with AI…` } });

    // Verify Cursor API is reachable before spending time on tasks
    sendEvent(res, { name: "checkpoint", data: { message: `Checking Cursor API connectivity…` } });
    let cursorPing: { ok: boolean; status?: number; error?: string };
    try {
      cursorPing = await summarizer.ping();
    } catch (pingErr) {
      cursorPing = { ok: false, error: pingErr instanceof Error ? pingErr.message : String(pingErr) };
    }

    if (!cursorPing.ok) {
      const reason = cursorPing.status === 401
        ? "401 Unauthorized — your Cursor API token is invalid or expired. Re-enter it in Step 1."
        : cursorPing.status
          ? `HTTP ${cursorPing.status}: ${cursorPing.error ?? "unknown error"}`
          : cursorPing.error ?? "network error";
      sendEvent(res, { name: "checkpoint", data: { message: `Cursor API unreachable: ${reason}` } });
      sendEvent(res, { name: "warning", data: { message: `Cannot reach Cursor API: ${reason}` } });
      return;
    }
    sendEvent(res, { name: "checkpoint", data: { message: `Cursor API reachable — starting AI summarization` } });

    // Group by category → jiraKey so release notes are organized by feature/ticket
    const groups = new Map<string, EnrichedChange[]>();
    for (const change of allChanges) {
      const jk = change.commit.jiraKey || "UNKNOWN";
      const key = `${change.category}:::${jk}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(change);
    }

    const summarizeTasks: Array<() => Promise<GeneratedSection | undefined>> = [];

    for (const category of CATEGORY_ORDER) {
      const jiraKeys = [...new Set(
        allChanges.filter((c) => c.category === category).map((c) => c.commit.jiraKey || "UNKNOWN"),
      )];

      for (const jk of jiraKeys) {
        const key = `${category}:::${jk}`;
        const changes = groups.get(key) ?? [];
        if (changes.length === 0) continue;

        const jiraSummary = changes.find((c) => c.jiraIssue)?.jiraIssue?.summary ?? "";
        const repos = [...new Set(changes.map((c) => c.repo))];

        summarizeTasks.push(async () => {
          if (signal.aborted) return undefined;

          const context = buildContext(category, jk, jiraSummary, repos, changes);
          const systemPrompt = buildSystemPrompt();

          sendEvent(res, { name: "checkpoint", data: { message: `Summarizing ${jk} — ${jiraSummary || category} (${changes.length} change(s))…` } });
          sendEvent(res, { name: "heartbeat", data: { ts: Date.now() } });

          const heartbeatTimer = setInterval(() => {
            sendEvent(res, { name: "heartbeat", data: { ts: Date.now() } });
          }, 5000);

          try {
            const result = await summarizer.summarize(systemPrompt, context);

            clearInterval(heartbeatTimer);

            if (result.status === "succeeded") {
              sendEvent(res, { name: "checkpoint", data: { message: `AI summarization complete for ${jk}` } });
              const section: GeneratedSection = {
                category,
                repo: repos.join(", "),
                content: result.text,
                jiraKey: jk,
                jiraSummary,
              };
              sendEvent(res, { name: "section", data: section });
              return section;
            }

            if (result.status === "failed") {
              sendEvent(res, {
                name: "warning",
                data: { repo: repos[0] ?? "", message: `Summarization failed for ${jk}: ${result.reason}` },
              });
              return undefined;
            }

            sendEvent(res, {
              name: "warning",
              data: { repo: repos[0] ?? "", message: `Summarization timed out for ${jk}` },
            });
            return undefined;
          } catch (err) {
            clearInterval(heartbeatTimer);
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[generator] summarization error for ${jk}:`, msg);
            sendEvent(res, {
              name: "warning",
              data: { repo: repos[0] ?? "", message: `Summarization error for ${jk}: ${msg}` },
            });
            return undefined;
          }
        });
      }
    }

    const sections = await pLimit(summarizeTasks, MAX_CONCURRENT_SUMMARIZE);
    const validSections = sections.filter((s): s is GeneratedSection => s !== undefined);

    sendEvent(res, { name: "phase", data: { phase: "assembling", pct: 95 } });
    sendEvent(res, {
      name: "done",
      data: {
        totalCommits: allChanges.length,
        totalSections: validSections.length,
        durationMs: Date.now() - startTime,
      },
    });
  } catch (fatalErr) {
    // Last-resort handler — ensures done is always sent even on unexpected errors
    const msg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
    console.error("[generator] fatal error in summarization phase:", msg);
    sendEvent(res, { name: "checkpoint", data: { message: `Error during summarization: ${msg}` } });
    sendEvent(res, {
      name: "done",
      data: { totalCommits: allChanges.length, totalSections: 0, durationMs: Date.now() - startTime },
    });
  }
}

function buildSystemPrompt(): string {
  return `You are a release notes writer producing notes for a broad audience that includes product managers, business stakeholders, and end users — not just engineers.

Rules:
- Write a short paragraph (2-4 sentences) that explains what was delivered and why it matters in plain, business-friendly language.
- Avoid implementation details like class names, method names, code paths, internal service names, or infrastructure specifics.
- Instead, describe the user-visible or business-visible outcome: what problem was solved, what capability was added, or what risk was reduced.
- Use present tense (e.g., "Improves…", "Adds…", "Resolves…").
- You may mention the Jira ticket key once for traceability (e.g., "(OPL-35497)").
- Do NOT invent changes not present in the source data.
- Output only the paragraph text — no headings, bullet points, or formatting.`;
}

function buildContext(
  category: string,
  jiraKey: string,
  jiraSummary: string,
  repos: string[],
  changes: EnrichedChange[],
): string {
  const lines: string[] = [
    `Jira Ticket: ${jiraKey}`,
    jiraSummary ? `Jira Summary: ${jiraSummary}` : "",
    `Category: ${category}`,
    `Repositories touched: ${repos.join(", ")}`,
    `Related changes (${changes.length}):`,
    "",
  ].filter(Boolean);

  for (const change of changes) {
    lines.push(`--- Change from ${change.repo} ---`);
    const [subject, ...bodyParts] = change.commit.message.split("\n");
    lines.push(`Commit: ${subject}`);
    const commitBody = bodyParts.join("\n").trim();
    if (commitBody) {
      lines.push(`Commit Body: ${commitBody.slice(0, 800)}`);
    }
    lines.push(`Author: ${change.commit.author}`);

    if (change.pullRequest) {
      lines.push(`PR #${change.pullRequest.number}: ${change.pullRequest.title}`);
      if (change.pullRequest.body) {
        lines.push(`PR Description: ${change.pullRequest.body.slice(0, 800)}`);
      }
    }

    if (change.jiraIssue) {
      if (change.jiraIssue.description) {
        lines.push(`Jira Description: ${change.jiraIssue.description.slice(0, 1200)}`);
      }
      if (change.jiraIssue.comments.length > 0) {
        lines.push(`Jira Comments (latest ${Math.min(change.jiraIssue.comments.length, 3)}):`);
        for (const comment of change.jiraIssue.comments.slice(-3)) {
          lines.push(`  - ${comment.slice(0, 300)}`);
        }
      }
      lines.push(`Issue Type: ${change.jiraIssue.issueType}`);
      if (change.jiraIssue.labels.length > 0) {
        lines.push(`Labels: ${change.jiraIssue.labels.join(", ")}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

import { CATEGORY_ORDER, categorizeIssue, serializeSSEEvent } from "@release-notes/shared";
const MAX_CONCURRENT_JIRA = 5;
const MAX_CONCURRENT_SUMMARIZE = 3;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function pLimit(tasks, limit) {
    const results = [];
    let index = 0;
    async function worker() {
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
function sendEvent(res, event) {
    if (!res.writableEnded) {
        res.write(serializeSSEEvent(event));
    }
}
export async function generateReleaseNotes(scopes, github, jira, summarizer, res, signal) {
    const startTime = Date.now();
    const allChanges = [];
    for (const scope of scopes) {
        if (signal.aborted)
            return;
        sendEvent(res, {
            name: "phase",
            data: { phase: "collecting_commits", repo: scope.repo, pct: 0 },
        });
        try {
            const commits = await github.listCommits(scope.owner, scope.repo, scope.base, scope.head);
            sendEvent(res, {
                name: "counts",
                data: {
                    repo: `${scope.owner}/${scope.repo}`,
                    commitsExamined: commits.length,
                    commitsIncluded: commits.length,
                },
            });
            sendEvent(res, {
                name: "phase",
                data: { phase: "resolving_pull_requests", repo: scope.repo, pct: 10 },
            });
            const prTasks = commits.map((commit) => async () => {
                if (signal.aborted)
                    return undefined;
                try {
                    return await github.findPullRequestForCommit(scope.owner, scope.repo, commit.sha);
                }
                catch {
                    return undefined;
                }
            });
            const prs = await pLimit(prTasks, 5);
            sendEvent(res, {
                name: "phase",
                data: { phase: "resolving_jira_issues", repo: scope.repo, pct: 30 },
            });
            const uniqueKeys = [...new Set(commits.map((c) => c.jiraKey))];
            const jiraResultMap = new Map();
            const jiraTasks = uniqueKeys.map((key) => async () => {
                if (signal.aborted)
                    return;
                try {
                    const issue = await jira.getIssue(key);
                    jiraResultMap.set(key, issue);
                    if (!issue) {
                        sendEvent(res, {
                            name: "warning",
                            data: { jiraKey: key, message: `Could not resolve Jira issue ${key}` },
                        });
                    }
                }
                catch {
                    sendEvent(res, {
                        name: "warning",
                        data: { jiraKey: key, message: `Jira lookup failed for ${key}` },
                    });
                }
            });
            await pLimit(jiraTasks, MAX_CONCURRENT_JIRA);
            for (let i = 0; i < commits.length; i++) {
                const commit = commits[i];
                if (!commit)
                    continue;
                const pr = prs[i];
                const jiraIssue = jiraResultMap.get(commit.jiraKey);
                const category = categorizeIssue(jiraIssue?.issueType ?? "Task", jiraIssue?.priority ?? "Medium");
                allChanges.push({
                    commit,
                    pullRequest: pr,
                    jiraIssue,
                    category,
                    repo: `${scope.owner}/${scope.repo}`,
                });
            }
        }
        catch (err) {
            sendEvent(res, {
                name: "warning",
                data: {
                    repo: scope.repo,
                    message: `Failed to process ${scope.owner}/${scope.repo}: ${err instanceof Error ? err.message : String(err)}`,
                },
            });
        }
    }
    if (signal.aborted)
        return;
    sendEvent(res, { name: "phase", data: { phase: "summarizing", pct: 50 } });
    const groups = new Map();
    for (const change of allChanges) {
        const key = `${change.category}:::${change.repo}`;
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(change);
    }
    const summarizeTasks = [];
    for (const category of CATEGORY_ORDER) {
        const repos = [...new Set(allChanges.filter((c) => c.category === category).map((c) => c.repo))];
        for (const repo of repos) {
            const key = `${category}:::${repo}`;
            const changes = groups.get(key) ?? [];
            if (changes.length === 0)
                continue;
            summarizeTasks.push(async () => {
                if (signal.aborted)
                    return undefined;
                const context = buildContext(category, repo, changes);
                const systemPrompt = buildSystemPrompt();
                let taskId;
                try {
                    const task = await summarizer.createTask(systemPrompt, context);
                    taskId = task.id;
                    let pollInterval = 1000;
                    while (!signal.aborted) {
                        sendEvent(res, { name: "heartbeat", data: { ts: Date.now() } });
                        const result = await summarizer.pollTask(taskId);
                        if (result.status === "succeeded") {
                            const section = { category, repo, content: result.text };
                            sendEvent(res, { name: "section", data: section });
                            return section;
                        }
                        if (result.status === "failed") {
                            sendEvent(res, {
                                name: "warning",
                                data: { repo, message: `Summarization failed for ${category} / ${repo}: ${result.reason}` },
                            });
                            return undefined;
                        }
                        if (result.status === "timed_out") {
                            sendEvent(res, {
                                name: "warning",
                                data: { repo, message: `Summarization timed out for ${category} / ${repo}` },
                            });
                            return undefined;
                        }
                        await sleep(pollInterval);
                        pollInterval = Math.min(pollInterval * 1.5, 3000);
                    }
                }
                catch (err) {
                    if (taskId)
                        await summarizer.cancelTask(taskId).catch(() => void 0);
                    sendEvent(res, {
                        name: "warning",
                        data: {
                            repo,
                            message: `Summarization error for ${category} / ${repo}: ${err instanceof Error ? err.message : String(err)}`,
                        },
                    });
                }
                return undefined;
            });
        }
    }
    const sections = await pLimit(summarizeTasks, MAX_CONCURRENT_SUMMARIZE);
    const validSections = sections.filter((s) => s !== undefined);
    sendEvent(res, { name: "phase", data: { phase: "assembling", pct: 95 } });
    sendEvent(res, {
        name: "done",
        data: {
            totalCommits: allChanges.length,
            totalSections: validSections.length,
            durationMs: Date.now() - startTime,
        },
    });
}
function buildSystemPrompt() {
    return `You are a release notes writer for a software engineering team. Write clear, concise, professional release notes.

Rules:
- Write each change as a bullet point starting with "-"
- Be concise but informative (1-2 sentences per bullet)
- Focus on what changed and why it matters to users/developers
- Use present tense (e.g., "Adds support for...", "Fixes crash when...")
- Reference Jira issue keys where relevant (e.g., "FOO-123")
- Do NOT invent changes not in the data
- Only output bullet points, no headings or section titles`;
}
function buildContext(category, repo, changes) {
    const lines = [
        `Repository: ${repo}`,
        `Category: ${category}`,
        `Changes (${changes.length}):`,
        "",
    ];
    for (const change of changes) {
        lines.push(`### ${change.commit.jiraKey}`);
        lines.push(`Commit: ${change.commit.message}`);
        if (change.pullRequest) {
            lines.push(`PR #${change.pullRequest.number}: ${change.pullRequest.title}`);
            if (change.pullRequest.body) {
                lines.push(`PR Description: ${change.pullRequest.body.slice(0, 500)}`);
            }
        }
        if (change.jiraIssue) {
            lines.push(`Jira Summary: ${change.jiraIssue.summary}`);
            if (change.jiraIssue.description) {
                lines.push(`Jira Description: ${change.jiraIssue.description.slice(0, 300)}`);
            }
            if (change.jiraIssue.labels.length > 0) {
                lines.push(`Labels: ${change.jiraIssue.labels.join(", ")}`);
            }
        }
        lines.push("");
    }
    return lines.join("\n");
}
//# sourceMappingURL=generator.js.map
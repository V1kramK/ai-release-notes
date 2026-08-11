export interface CredentialPayload {
  githubToken: string;
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraToken: string;
  cursorApiToken: string;
  cursorModelId?: string;
}

export interface CredentialStatus {
  status: "ok" | "none";
  credentials: {
    github: { configured: boolean; preview: string };
    jira: { configured: boolean; preview: string; baseUrl?: string };
    cursor: { configured: boolean; preview: string; modelId?: string };
  };
}

export interface Repository {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export interface RepoScope {
  owner: string;
  repo: string;
  base: string;
  head: string;
}

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  return res;
}

export async function saveCredentials(payload: CredentialPayload): Promise<CredentialStatus> {
  const res = await apiFetch("/api/credentials", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error((err as { message?: string }).message ?? "Failed to save credentials");
  }
  return (await res.json()) as CredentialStatus;
}

export async function getCredentialStatus(): Promise<CredentialStatus> {
  const res = await apiFetch("/api/credentials/status");
  return (await res.json()) as CredentialStatus;
}

export async function clearCredentials(): Promise<void> {
  await apiFetch("/api/credentials", { method: "DELETE" });
}

export interface JiraProject {
  key: string;
  name: string;
  id: string;
}

export interface BranchOrTag {
  name: string;
  type: "branch" | "tag";
  sha: string;
}

export async function listBranches(owner: string, repo: string): Promise<BranchOrTag[]> {
  const res = await apiFetch(`/api/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { refs: BranchOrTag[] };
  return data.refs;
}

export interface JiraIssueSummary {
  key: string;
  summary: string;
  issueType: string;
  priority: string;
  status: string;
}

export async function searchJiraIssues(projectKeys: string[], search: string): Promise<JiraIssueSummary[]> {
  const params = new URLSearchParams({ projectKeys: projectKeys.join(","), search });
  const res = await apiFetch(`/api/jira-issues?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { issues: JiraIssueSummary[] };
  return data.issues;
}

export async function listJiraProjects(): Promise<JiraProject[]> {
  const res = await apiFetch("/api/jira-projects");
  if (!res.ok) return [];
  const data = (await res.json()) as { projects: JiraProject[] };
  return data.projects;
}

export interface CursorModel {
  id: string;
  label: string;
}

export async function listCursorModels(): Promise<CursorModel[]> {
  const res = await apiFetch("/api/credentials/models");
  if (!res.ok) return [];
  const data = (await res.json()) as { models: CursorModel[] };
  return data.models;
}

export async function listRepositories(): Promise<Repository[]> {
  const res = await apiFetch("/api/repositories");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error((err as { message?: string }).message ?? "Failed to load repositories");
  }
  const data = (await res.json()) as { repositories: Repository[] };
  return data.repositories;
}

export function startGeneration(
  scopes: RepoScope[],
  useFake: boolean,
  onEvent: (eventName: string, data: unknown) => void,
  signal: AbortSignal,
  jiraProjectKeys?: string[],
  lookbackDays?: number,
  pinnedIssueKeys?: string[]
): void {
  fetch("/api/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopes, useFake, jiraProjectKeys, lookbackDays, pinnedIssueKeys }),
    signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ message: "Unknown error" }));
      onEvent("error", { code: "UPSTREAM_FAILED", message: (err as { message?: string }).message, retryable: true });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let receivedDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const messages = buffer.split("\n\n");
      buffer = messages.pop() ?? "";

      for (const msg of messages) {
        if (!msg.trim()) continue;
        let eventName = "message";
        let dataStr = "";

        for (const line of msg.split("\n")) {
          if (line.startsWith("event: ")) eventName = line.slice(7).trim();
          else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
        }

        if (dataStr) {
          try {
            const data = JSON.parse(dataStr) as unknown;
            if (eventName === "done") receivedDone = true;
            onEvent(eventName, data);
          } catch {
            // ignore malformed events
          }
        }
      }
    }

    // Stream ended without a done event — the server exited early (abort / crash)
    if (!receivedDone) {
      // Keep any warnings that were received; just clear the running state
      onEvent("done", { totalCommits: 0, totalSections: 0, durationMs: null });
    }
  }).catch((err: unknown) => {
    if (err instanceof Error && err.name === "AbortError") {
      // User cancelled — just clear running state
      onEvent("done", { totalCommits: 0, totalSections: 0, durationMs: null });
    } else if (err instanceof Error) {
      onEvent("error", { code: "UPSTREAM_FAILED", message: err.message, retryable: true });
    }
  });
}

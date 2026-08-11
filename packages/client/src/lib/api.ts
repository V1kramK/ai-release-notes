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
    cursor: { configured: boolean; preview: string };
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
  signal: AbortSignal
): void {
  fetch("/api/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopes, useFake }),
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
            onEvent(eventName, data);
          } catch {
            // ignore malformed events
          }
        }
      }
    }
  }).catch((err: unknown) => {
    if (err instanceof Error && err.name !== "AbortError") {
      onEvent("error", { code: "UPSTREAM_FAILED", message: err.message, retryable: true });
    }
  });
}

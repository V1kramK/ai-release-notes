import type { CommitInfo, EnrichedChange, GeneratedSection, JiraIssue, PullRequestInfo, RepositoryInfo } from "@release-notes/shared";

export interface GitHubPort {
  listRepositories(): Promise<RepositoryInfo[]>;
  listCommits(owner: string, repo: string, base: string, head: string): Promise<CommitInfo[]>;
  findPullRequestForCommit(owner: string, repo: string, sha: string): Promise<PullRequestInfo | undefined>;
}

export interface JiraPort {
  getIssue(key: string): Promise<JiraIssue | undefined>;
  /** Batch-fetch multiple issues in a single JQL query. Much faster than N individual getIssue calls. */
  batchGetIssues(keys: string[]): Promise<Map<string, JiraIssue>>;
  ping(): Promise<boolean>;
}

export type SummarizerResult =
  | { status: "succeeded"; text: string }
  | { status: "failed"; reason: string }
  | { status: "timed_out" };

export interface SummarizerPingResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface CursorModelInfo {
  id: string;
  name?: string;
}

export interface SummarizerPort {
  /** One-shot: send prompt, wait for result. Handles create+poll internally. */
  summarize(prompt: string, context: string): Promise<SummarizerResult>;
  ping(): Promise<SummarizerPingResult>;
  listModels(): Promise<CursorModelInfo[]>;
}

export interface SessionCredentials {
  githubToken: string;
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraToken: string;
  cursorApiToken: string;
  cursorModelId: string;
}

export interface SessionStorePort {
  set(sessionId: string, credentials: SessionCredentials): void;
  get(sessionId: string): SessionCredentials | undefined;
  delete(sessionId: string): void;
  touch(sessionId: string): void;
}

export interface AuditRecord {
  ts: string;
  event: string;
  sessionRef: string;
  repoCount?: number;
  commitsExamined?: number;
  commitsIncluded?: number;
  outcome?: string;
  durationMs?: number;
}

export interface AuditPort {
  append(record: AuditRecord): Promise<void>;
}

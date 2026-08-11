import type { CommitInfo, EnrichedChange, GeneratedSection, JiraIssue, PullRequestInfo, RepositoryInfo } from "@release-notes/shared";

export interface GitHubPort {
  listRepositories(): Promise<RepositoryInfo[]>;
  listCommits(owner: string, repo: string, base: string, head: string): Promise<CommitInfo[]>;
  findPullRequestForCommit(owner: string, repo: string, sha: string): Promise<PullRequestInfo | undefined>;
}

export interface JiraPort {
  getIssue(key: string): Promise<JiraIssue | undefined>;
  ping(): Promise<boolean>;
}

export interface SummarizerTask {
  id: string;
}

export type SummarizerResult =
  | { status: "succeeded"; text: string }
  | { status: "failed"; reason: string }
  | { status: "timed_out" };

export interface SummarizerPort {
  createTask(prompt: string, context: string): Promise<SummarizerTask>;
  pollTask(taskId: string): Promise<SummarizerResult>;
  cancelTask(taskId: string): Promise<void>;
  ping(): Promise<boolean>;
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

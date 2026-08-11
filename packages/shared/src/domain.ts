import type { Category } from "./categories.js";

export interface RepoScope {
  owner: string;
  repo: string;
  base: string;
  head: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  jiraKey: string;
  author: string;
  date: string;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  body: string;
  url: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  priority: string;
  labels: string[];
  comments: string[];
  url: string;
}

export interface EnrichedChange {
  commit: CommitInfo;
  pullRequest: PullRequestInfo | undefined;
  jiraIssue: JiraIssue | undefined;
  category: Category;
  repo: string;
}

export interface GeneratedSection {
  category: Category;
  repo: string;
  content: string;
  /** When grouped by Jira ticket, the issue key (e.g. "OPL-35497"). */
  jiraKey?: string;
  /** Human-readable Jira summary for the heading. */
  jiraSummary?: string;
}

export interface RepositoryInfo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export interface CredentialStatus {
  github: { configured: boolean; preview: string };
  jira: { configured: boolean; preview: string; baseUrl?: string };
  cursor: { configured: boolean; preview: string };
}

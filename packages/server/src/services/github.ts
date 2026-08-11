import { Octokit } from "@octokit/rest";
import type { CommitInfo, PullRequestInfo, RepositoryInfo } from "@release-notes/shared";
import type { GitHubPort } from "../ports/index.js";

const JIRA_KEY_REGEX = /^([A-Z][A-Z0-9]+-\d+)/;

export class OctokitGitHubAdapter implements GitHubPort {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listRepositories(): Promise<RepositoryInfo[]> {
    const repos: RepositoryInfo[] = [];
    let page = 1;

    while (true) {
      const response = await this.octokit.repos.listForAuthenticatedUser({
        per_page: 100,
        page,
        sort: "updated",
      });

      for (const repo of response.data) {
        repos.push({
          owner: repo.owner.login,
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
          defaultBranch: repo.default_branch,
        });
      }

      if (response.data.length < 100) break;
      page++;
    }

    return repos;
  }

  async listCommits(owner: string, repo: string, base: string, head: string): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];
    let page = 1;

    while (true) {
      const response = await this.octokit.repos.compareCommitsWithBasehead({
        owner,
        repo,
        basehead: `${base}...${head}`,
        per_page: 100,
        page,
      });

      for (const c of response.data.commits) {
        const message = c.commit.message.split("\n")[0] ?? "";
        const match = JIRA_KEY_REGEX.exec(message);
        if (!match?.[1]) continue;

        commits.push({
          sha: c.sha,
          message,
          jiraKey: match[1],
          author: c.commit.author?.name ?? c.commit.author?.email ?? "unknown",
          date: c.commit.author?.date ?? new Date().toISOString(),
        });
      }

      if (response.data.commits.length < 100) break;
      page++;
    }

    return commits;
  }

  async findPullRequestForCommit(owner: string, repo: string, sha: string): Promise<PullRequestInfo | undefined> {
    try {
      const response = await this.octokit.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo,
        commit_sha: sha,
      });

      const pr = response.data[0];
      if (!pr) return undefined;

      return {
        number: pr.number,
        title: pr.title,
        body: pr.body ?? "",
        url: pr.html_url,
      };
    } catch {
      return undefined;
    }
  }
}

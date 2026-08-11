import type { CommitInfo, PullRequestInfo, RepositoryInfo } from "@release-notes/shared";
import type { GitHubPort } from "../ports/index.js";
export declare class OctokitGitHubAdapter implements GitHubPort {
    private readonly octokit;
    constructor(token: string);
    listRepositories(): Promise<RepositoryInfo[]>;
    listCommits(owner: string, repo: string, base: string, head: string): Promise<CommitInfo[]>;
    findPullRequestForCommit(owner: string, repo: string, sha: string): Promise<PullRequestInfo | undefined>;
}

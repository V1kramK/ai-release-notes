import type { RepoScope } from "@release-notes/shared";
import type { Response } from "express";
import type { GitHubPort, JiraPort, SummarizerPort } from "../ports/index.js";
export declare function generateReleaseNotes(scopes: RepoScope[], github: GitHubPort, jira: JiraPort, summarizer: SummarizerPort, res: Response, signal: AbortSignal): Promise<void>;

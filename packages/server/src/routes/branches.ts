import { Router } from "express";
import type { RequestHandler } from "express";
import { Octokit } from "@octokit/rest";
import { requireCredentials } from "../middleware/session.js";

export interface BranchOrTag {
  name: string;
  type: "branch" | "tag";
  sha: string;
}

export function branchesRouter(): Router {
  const router = Router();

  const getHandler: RequestHandler = async (req, res) => {
    const query = req.query as Record<string, string | undefined>;
    const owner = query["owner"];
    const repo = query["repo"];

    if (!owner || !repo || !/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(repo)) {
      res.status(400).json({ code: "VALIDATION_FAILED", message: "owner and repo are required", retryable: false });
      return;
    }

    const sessionId = req.sessionId ?? "unknown";
    const creds = req.credStore.get(sessionId);
    if (!creds) {
      res.status(401).json({ code: "SESSION_EXPIRED", message: "No credentials", retryable: false });
      return;
    }

    try {
      const octokit = new Octokit({ auth: creds.githubToken });
      const results: BranchOrTag[] = [];

      // Paginate branches up to 500 so typed names beyond the first page appear
      for (let page = 1; page <= 5; page++) {
        const resp = await octokit.repos.listBranches({ owner, repo, per_page: 100, page });
        for (const b of resp.data) {
          results.push({ name: b.name, type: "branch", sha: b.commit.sha });
        }
        if (resp.data.length < 100) break;
      }

      // Fetch up to 200 tags (most repos have far fewer)
      for (let page = 1; page <= 2; page++) {
        const resp = await octokit.repos.listTags({ owner, repo, per_page: 100, page });
        for (const t of resp.data) {
          results.push({ name: t.name, type: "tag", sha: t.commit.sha });
        }
        if (resp.data.length < 100) break;
      }

      res.status(200).json({ refs: results });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("401") || message.includes("Bad credentials")) {
        res.status(401).json({ code: "CREDENTIAL_REJECTED", message: "GitHub token rejected", retryable: false });
        return;
      }
      res.status(502).json({ code: "UPSTREAM_FAILED", message: "Failed to fetch branches", retryable: true });
    }
  };

  router.get("/", requireCredentials, getHandler);
  return router;
}

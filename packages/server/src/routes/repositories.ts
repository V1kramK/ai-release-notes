import { Router } from "express";
import type { RequestHandler } from "express";
import { OctokitGitHubAdapter } from "../services/github.js";
import { requireCredentials } from "../middleware/session.js";

export function repositoriesRouter(): Router {
  const router = Router();

  const getHandler: RequestHandler = async (req, res) => {
    const sessionId = req.sessionId ?? "unknown";
    const creds = req.credStore.get(sessionId);
    if (!creds) {
      res.status(401).json({ code: "SESSION_EXPIRED", message: "No credentials", retryable: false });
      return;
    }

    try {
      const github = new OctokitGitHubAdapter(creds.githubToken);
      const repos = await github.listRepositories();
      res.status(200).json({ repositories: repos });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message.includes("401") || message.includes("Bad credentials")) {
        res.status(401).json({
          code: "CREDENTIAL_REJECTED",
          message: "GitHub token rejected. Please re-enter your credentials.",
          retryable: false,
        });
        return;
      }

      if (message.includes("403") || message.includes("429")) {
        res.status(429).json({
          code: "UPSTREAM_RATE_LIMITED",
          message: "GitHub API rate limit reached. Please wait and retry.",
          retryable: true,
        });
        return;
      }

      res.status(502).json({
        code: "UPSTREAM_FAILED",
        message: "Failed to fetch repositories from GitHub.",
        retryable: true,
      });
    }
  };

  router.get("/", requireCredentials, getHandler);

  return router;
}

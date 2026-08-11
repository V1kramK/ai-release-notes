import { Router } from "express";
import type { RequestHandler } from "express";
import { JiraAdapter } from "../services/jira.js";
import { requireCredentials } from "../middleware/session.js";

export interface JiraIssueSummary {
  key: string;
  summary: string;
  issueType: string;
  priority: string;
  status: string;
}

export function jiraIssuesRouter(): Router {
  const router = Router();

  const getHandler: RequestHandler = async (req, res) => {
    const query = req.query as Record<string, string | undefined>;
    const projectKeys = query["projectKeys"] ?? "";
    const search = (query["search"] ?? "").trim().slice(0, 100);

    if (!projectKeys) {
      res.status(400).json({ code: "VALIDATION_FAILED", message: "projectKeys is required", retryable: false });
      return;
    }

    const keys = projectKeys.split(",").filter((k) => /^[A-Z][A-Z0-9]*$/.test(k.trim())).map((k) => k.trim());
    if (keys.length === 0) {
      res.status(400).json({ code: "VALIDATION_FAILED", message: "No valid project keys", retryable: false });
      return;
    }

    const sessionId = req.sessionId ?? "unknown";
    const creds = req.credStore.get(sessionId);
    if (!creds) {
      res.status(401).json({ code: "SESSION_EXPIRED", message: "No credentials", retryable: false });
      return;
    }

    try {
      const jira = new JiraAdapter(creds.jiraBaseUrl, creds.jiraEmail, creds.jiraToken);
      const issues = await jira.searchIssues(keys, search, 50);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ issues });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown";
      res.status(502).json({ code: "UPSTREAM_FAILED", message: `Jira search failed: ${message}`, retryable: true });
    }
  };

  router.get("/", requireCredentials, getHandler);
  return router;
}

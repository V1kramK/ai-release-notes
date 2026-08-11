import { Router } from "express";
import type { RequestHandler } from "express";
import { JiraAdapter } from "../services/jira.js";
import { requireCredentials } from "../middleware/session.js";

export function jiraProjectsRouter(): Router {
  const router = Router();

  const getHandler: RequestHandler = async (req, res) => {
    const sessionId = req.sessionId ?? "unknown";
    const creds = req.credStore.get(sessionId);
    if (!creds) {
      res.status(401).json({ code: "SESSION_EXPIRED", message: "No credentials", retryable: false });
      return;
    }

    try {
      const jira = new JiraAdapter(creds.jiraBaseUrl, creds.jiraEmail, creds.jiraToken);
      const projects = await jira.listProjects();
      res.status(200).json({ projects });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({
        code: "UPSTREAM_FAILED",
        message: `Failed to fetch Jira projects: ${message}`,
        retryable: true,
      });
    }
  };

  router.get("/", requireCredentials, getHandler);

  return router;
}

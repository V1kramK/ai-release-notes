import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { requireCredentials } from "../middleware/session.js";
import type { AuditPort, SessionCredentials } from "../ports/index.js";

const DEFAULT_MODEL_ID = process.env["CURSOR_MODEL_ID"] ?? "auto";

const KNOWN_MODELS = [
  { id: "auto", label: "Auto (let Cursor pick)" },
  { id: "composer-2.5", label: "Composer 2.5" },
  { id: "claude-4-sonnet", label: "Claude 4 Sonnet" },
  { id: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "gpt-4o", label: "GPT-4o" },
];

const credentialsSchema = z.object({
  githubToken: z
    .string()
    .min(20)
    .max(500),
  jiraBaseUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith("https://"), "Jira base URL must use HTTPS"),
  jiraEmail: z.string().email().max(200),
  jiraToken: z.string().min(8).max(500),
  cursorApiToken: z.string().min(10).max(500),
  cursorModelId: z.string().min(1).max(100).optional(),
});

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

export function credentialsRouter(audit: AuditPort): Router {
  const router = Router();

  const postHandler: RequestHandler = async (req, res) => {
    const parse = credentialsSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        code: "VALIDATION_FAILED",
        message: "Invalid credential format",
        retryable: false,
        details: parse.error.message,
      });
      return;
    }

    const { githubToken, jiraBaseUrl, jiraEmail, jiraToken, cursorApiToken, cursorModelId } = parse.data;

    const credentials: SessionCredentials = {
      githubToken,
      jiraBaseUrl,
      jiraEmail,
      jiraToken,
      cursorApiToken,
      cursorModelId: cursorModelId ?? DEFAULT_MODEL_ID,
    };

    const sessionId = req.sessionId ?? "unknown";
    req.credStore.set(sessionId, credentials);

    await audit.append({
      ts: new Date().toISOString(),
      event: "credential_session_created",
      sessionRef: sessionId.slice(0, 8),
    });

    res.status(200).json({
      status: "ok",
      credentials: {
        github: { configured: true, preview: maskToken(githubToken) },
        jira: { configured: true, preview: maskToken(jiraToken), baseUrl: jiraBaseUrl },
        cursor: { configured: true, preview: maskToken(cursorApiToken), modelId: credentials.cursorModelId },
      },
    });
  };

  const statusHandler: RequestHandler = (req, res) => {
    const sessionId = req.sessionId;
    const creds = sessionId ? req.credStore.get(sessionId) : undefined;

    if (!creds) {
      res.status(200).json({
        status: "none",
        credentials: {
          github: { configured: false, preview: "" },
          jira: { configured: false, preview: "" },
          cursor: { configured: false, preview: "" },
        },
      });
      return;
    }

    res.status(200).json({
      status: "ok",
      credentials: {
        github: { configured: true, preview: maskToken(creds.githubToken) },
        jira: { configured: true, preview: maskToken(creds.jiraToken), baseUrl: creds.jiraBaseUrl },
        cursor: { configured: true, preview: maskToken(creds.cursorApiToken), modelId: creds.cursorModelId },
      },
    });
  };

  const deleteHandler: RequestHandler = async (req, res) => {
    const sessionId = req.sessionId ?? "unknown";
    req.credStore.delete(sessionId);

    await audit.append({
      ts: new Date().toISOString(),
      event: "credential_session_cleared",
      sessionRef: sessionId.slice(0, 8),
    });

    res.status(200).json({ status: "cleared" });
  };

  const modelsHandler: RequestHandler = async (req, res) => {
    const sessionId = req.sessionId;
    const creds = sessionId ? req.credStore.get(sessionId) : undefined;
    if (!creds) {
      res.status(200).json({ models: KNOWN_MODELS, source: "builtin" });
      return;
    }

    try {
      const { CursorSummarizer } = await import("../services/cursor.js");
      const summarizer = new CursorSummarizer(creds.cursorApiToken, creds.cursorModelId);
      const apiModels = await summarizer.listModels();

      if (apiModels.length > 0) {
        const fetched: Array<{ id: string; label: string }> = [
          { id: "auto", label: "Auto (let Cursor pick)" },
        ];
        for (const m of apiModels) {
          fetched.push({ id: m.id, label: m.name ?? m.id });
        }
        res.status(200).json({ models: fetched, source: "sdk" });
        return;
      }
    } catch {
      // Fall through to known models
    }

    res.status(200).json({ models: KNOWN_MODELS, source: "builtin" });
  };

  router.post("/", postHandler);
  router.get("/status", statusHandler);
  router.get("/models", modelsHandler);
  router.delete("/", requireCredentials, deleteHandler);

  return router;
}

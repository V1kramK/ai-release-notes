import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { serializeSSEEvent } from "@release-notes/shared";
import type { RepoScope } from "@release-notes/shared";
import { OctokitGitHubAdapter } from "../services/github.js";
import { JiraAdapter } from "../services/jira.js";
import { CursorSummarizer } from "../services/cursor.js";
import { FakeSummarizer } from "../services/fake-summarizer.js";
import { generateReleaseNotes } from "../services/generator.js";
import { requireCredentials } from "../middleware/session.js";
import type { AuditPort } from "../ports/index.js";

const REF_SAFE_REGEX = /^[a-zA-Z0-9._\-/]+$/;

const generateSchema = z.object({
  scopes: z
    .array(
      z.object({
        owner: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/),
        repo: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/),
        base: z.string().min(1).max(200).regex(REF_SAFE_REGEX),
        head: z.string().min(1).max(200).regex(REF_SAFE_REGEX),
      })
    )
    .min(1)
    .max(20),
  useFake: z.boolean().optional(),
});

const MAX_CONCURRENT = parseInt(process.env["MAX_CONCURRENT_GENERATIONS"] ?? "2", 10);
let activeGenerations = 0;

export function generateRouter(audit: AuditPort): Router {
  const router = Router();

  const postHandler: RequestHandler = async (req, res) => {
    if (activeGenerations >= MAX_CONCURRENT) {
      res.status(429).json({
        code: "CONCURRENCY_LIMIT",
        message: `Too many concurrent generations (max ${MAX_CONCURRENT}). Please wait and retry.`,
        retryable: true,
      });
      return;
    }

    const parse = generateSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        code: "VALIDATION_FAILED",
        message: "Invalid request",
        retryable: false,
        details: parse.error.message,
      });
      return;
    }

    const { scopes, useFake } = parse.data;
    const sessionId = req.sessionId ?? "unknown";
    const creds = req.credStore.get(sessionId);
    if (!creds) {
      res.status(401).json({ code: "SESSION_EXPIRED", message: "No credentials", retryable: false });
      return;
    }

    const startTime = Date.now();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const controller = new AbortController();
    activeGenerations++;

    req.on("close", () => {
      controller.abort();
    });

    try {
      const github = new OctokitGitHubAdapter(creds.githubToken);
      const jira = new JiraAdapter(creds.jiraBaseUrl, creds.jiraEmail, creds.jiraToken);
      const summarizer =
        useFake === true
          ? new FakeSummarizer()
          : new CursorSummarizer(creds.cursorApiToken, creds.cursorModelId);

      await generateReleaseNotes(scopes as RepoScope[], github, jira, summarizer, res, controller.signal);

      await audit.append({
        ts: new Date().toISOString(),
        event: "generation_completed",
        sessionRef: sessionId.slice(0, 8),
        repoCount: scopes.length,
        durationMs: Date.now() - startTime,
        outcome: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await audit.append({
        ts: new Date().toISOString(),
        event: "generation_failed",
        sessionRef: sessionId.slice(0, 8),
        repoCount: scopes.length,
        durationMs: Date.now() - startTime,
        outcome: "error",
      });

      if (!res.writableEnded) {
        res.write(
          serializeSSEEvent({
            name: "error",
            data: {
              code: "UPSTREAM_FAILED",
              message: `Generation failed: ${message}`,
              retryable: true,
            },
          })
        );
      }
    } finally {
      activeGenerations--;
      if (!res.writableEnded) res.end();
    }
  };

  router.post("/", requireCredentials, postHandler);

  return router;
}

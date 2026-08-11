import express from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

import { InMemorySessionStore } from "./services/session-store.js";
import { JsonlAuditSink } from "./services/audit.js";
import { FakeSummarizer } from "./services/fake-summarizer.js";

import { sessionMiddleware } from "./middleware/session.js";
import { credentialsRouter } from "./routes/credentials.js";
import { repositoriesRouter } from "./routes/repositories.js";
import { generateRouter } from "./routes/generate.js";
import { healthRouter } from "./routes/health.js";
import { jiraProjectsRouter } from "./routes/jira-projects.js";
import { branchesRouter } from "./routes/branches.js";
import { jiraIssuesRouter } from "./routes/jira-issues.js";

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);
const LOG_LEVEL = process.env["LOG_LEVEL"] ?? "info";
const AUDIT_DIR = process.env["AUDIT_DIR"] ?? "./data/audit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({
  level: LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['set-cookie']",
      "*.token",
      "*.api_token",
      "*.pat",
      "*.password",
      "*.cursorToken",
      "*.githubToken",
      "*.jiraToken",
      "*.cursorApiToken",
    ],
    censor: "[REDACTED]",
  },
});

const sessionStore = new InMemorySessionStore();
const audit = new JsonlAuditSink(AUDIT_DIR);
const fakeSummarizer = new FakeSummarizer();

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: "no-referrer" },
  })
);

app.use(
  pinoHttp({
    logger,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      censor: "[REDACTED]",
    },
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(sessionMiddleware(sessionStore));

// API routes
app.use("/api/health", healthRouter(fakeSummarizer));
app.use("/api/credentials", credentialsRouter(audit));
app.use("/api/repositories", repositoriesRouter());
app.use("/api/jira-projects", jiraProjectsRouter());
app.use("/api/branches", branchesRouter());
app.use("/api/jira-issues", jiraIssuesRouter());
app.use("/api/generate", generateRouter(audit));

// Serve React SPA in production
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(clientDist, "index.html"), (err?: Error) => {
    if (err) {
      res.status(200).json({ status: "api-only mode", message: "Frontend not built yet" });
    }
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  if (!res.headersSent) {
    res.status(500).json({
      code: "UPSTREAM_FAILED",
      message: "Internal server error",
      retryable: false,
    });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, "Release Notes Generator server started");
});

export { app };

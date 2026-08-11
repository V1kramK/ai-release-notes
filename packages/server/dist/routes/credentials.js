import { Router } from "express";
import { z } from "zod";
import { requireCredentials } from "../middleware/session.js";
const DEFAULT_MODEL_ID = process.env["CURSOR_MODEL_ID"] ?? "claude-4-5";
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
function maskToken(token) {
    if (token.length <= 8)
        return "****";
    return token.slice(0, 4) + "****" + token.slice(-4);
}
export function credentialsRouter(audit) {
    const router = Router();
    const postHandler = async (req, res) => {
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
        const credentials = {
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
                cursor: { configured: true, preview: maskToken(cursorApiToken) },
            },
        });
    };
    const statusHandler = (req, res) => {
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
                cursor: { configured: true, preview: maskToken(creds.cursorApiToken) },
            },
        });
    };
    const deleteHandler = async (req, res) => {
        const sessionId = req.sessionId ?? "unknown";
        req.credStore.delete(sessionId);
        await audit.append({
            ts: new Date().toISOString(),
            event: "credential_session_cleared",
            sessionRef: sessionId.slice(0, 8),
        });
        res.status(200).json({ status: "cleared" });
    };
    router.post("/", postHandler);
    router.get("/status", statusHandler);
    router.delete("/", requireCredentials, deleteHandler);
    return router;
}
//# sourceMappingURL=credentials.js.map
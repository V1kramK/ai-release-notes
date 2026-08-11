import { Router } from "express";
export function healthRouter(summarizer) {
    const router = Router();
    const getHandler = async (_req, res) => {
        try {
            const cursorReachable = await summarizer.ping();
            if (cursorReachable) {
                res.status(200).json({
                    status: "ok",
                    version: "1.0.0",
                    cursor: "reachable",
                    ts: new Date().toISOString(),
                });
            }
            else {
                res.status(503).json({
                    status: "degraded",
                    version: "1.0.0",
                    cursor: "unreachable",
                    ts: new Date().toISOString(),
                });
            }
        }
        catch {
            res.status(503).json({
                status: "degraded",
                version: "1.0.0",
                cursor: "error",
                ts: new Date().toISOString(),
            });
        }
    };
    router.get("/", getHandler);
    return router;
}
//# sourceMappingURL=health.js.map
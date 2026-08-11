import { randomUUID } from "crypto";
const SESSION_COOKIE = "rn_session";
export function sessionMiddleware(store) {
    return (req, res, next) => {
        req.credStore = store;
        const cookies = req.cookies;
        const existingId = cookies[SESSION_COOKIE];
        if (existingId && store.get(existingId)) {
            req.sessionId = existingId;
            store.touch(existingId);
        }
        else {
            const newId = randomUUID();
            req.sessionId = newId;
            res.cookie(SESSION_COOKIE, newId, {
                httpOnly: true,
                sameSite: "strict",
                maxAge: 4 * 60 * 60 * 1000,
            });
        }
        next();
    };
}
export function requireCredentials(req, res, next) {
    const { sessionId, credStore } = req;
    if (!sessionId || !credStore.get(sessionId)) {
        res.status(401).json({
            code: "SESSION_EXPIRED",
            message: "No active credential session. Please configure credentials first.",
            retryable: false,
        });
        return;
    }
    next();
}
//# sourceMappingURL=session.js.map
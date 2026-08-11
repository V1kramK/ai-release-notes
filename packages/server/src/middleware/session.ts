import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import type { SessionStorePort } from "../ports/index.js";

const SESSION_COOKIE = "rn_session";

declare global {
  namespace Express {
    interface Request {
      credStore: SessionStorePort;
      sessionId?: string;
    }
  }
}

export function sessionMiddleware(store: SessionStorePort) {
  return (req: Request, res: Response, next: NextFunction): void => {
    req.credStore = store;

    const cookies = req.cookies as Record<string, string | undefined>;
    const existingId = cookies[SESSION_COOKIE];
    if (existingId && store.get(existingId)) {
      req.sessionId = existingId;
      store.touch(existingId);
    } else {
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

export function requireCredentials(req: Request, res: Response, next: NextFunction): void {
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

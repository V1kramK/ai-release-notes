import type { Request, Response, NextFunction } from "express";
import type { SessionStorePort } from "../ports/index.js";
declare global {
    namespace Express {
        interface Request {
            credStore: SessionStorePort;
            sessionId?: string;
        }
    }
}
export declare function sessionMiddleware(store: SessionStorePort): (req: Request, res: Response, next: NextFunction) => void;
export declare function requireCredentials(req: Request, res: Response, next: NextFunction): void;

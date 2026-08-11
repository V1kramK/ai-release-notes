import type { SessionCredentials, SessionStorePort } from "../ports/index.js";
export declare class InMemorySessionStore implements SessionStorePort {
    private readonly store;
    set(sessionId: string, credentials: SessionCredentials): void;
    get(sessionId: string): SessionCredentials | undefined;
    delete(sessionId: string): void;
    touch(sessionId: string): void;
}

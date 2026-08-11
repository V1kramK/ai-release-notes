const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
export class InMemorySessionStore {
    store = new Map();
    set(sessionId, credentials) {
        this.store.set(sessionId, {
            credentials,
            expiresAt: Date.now() + SESSION_TTL_MS,
        });
    }
    get(sessionId) {
        const entry = this.store.get(sessionId);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(sessionId);
            return undefined;
        }
        return entry.credentials;
    }
    delete(sessionId) {
        this.store.delete(sessionId);
    }
    touch(sessionId) {
        const entry = this.store.get(sessionId);
        if (entry) {
            entry.expiresAt = Date.now() + SESSION_TTL_MS;
        }
    }
}
//# sourceMappingURL=session-store.js.map
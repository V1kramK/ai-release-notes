import type { SessionCredentials, SessionStorePort } from "../ports/index.js";

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface StoredSession {
  credentials: SessionCredentials;
  expiresAt: number;
}

export class InMemorySessionStore implements SessionStorePort {
  private readonly store = new Map<string, StoredSession>();

  set(sessionId: string, credentials: SessionCredentials): void {
    this.store.set(sessionId, {
      credentials,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
  }

  get(sessionId: string): SessionCredentials | undefined {
    const entry = this.store.get(sessionId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionId);
      return undefined;
    }
    return entry.credentials;
  }

  delete(sessionId: string): void {
    this.store.delete(sessionId);
  }

  touch(sessionId: string): void {
    const entry = this.store.get(sessionId);
    if (entry) {
      entry.expiresAt = Date.now() + SESSION_TTL_MS;
    }
  }
}

import { useState, useEffect, useCallback } from "react";
import { saveCredentials, getCredentialStatus, clearCredentials } from "../lib/api.js";
import type { CredentialPayload, CredentialStatus } from "../lib/api.js";

export function useCredentials() {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await getCredentialStatus();
      setStatus(s);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (payload: CredentialPayload) => {
    setSaving(true);
    setError(null);
    try {
      const s = await saveCredentials(payload);
      setStatus(s);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credentials");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await clearCredentials();
      await refresh();
    } catch {
      // ignore
    }
  }, [refresh]);

  return { status, loading, saving, error, save, clear, refresh };
}

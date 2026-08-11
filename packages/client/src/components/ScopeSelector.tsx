import { useState, useEffect, useCallback } from "react";
import { listRepositories } from "../lib/api.js";
import type { Repository, RepoScope } from "../lib/api.js";

interface Props {
  credentialsReady: boolean;
  onScopesChange: (scopes: RepoScope[]) => void;
}

interface RepoRow {
  repo: Repository;
  selected: boolean;
  base: string;
  head: string;
}

export function ScopeSelector({ credentialsReady, onScopesChange }: Props) {
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadRepos = useCallback(async () => {
    if (!credentialsReady) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listRepositories();
      setRepos(
        list.map((r) => ({
          repo: r,
          selected: false,
          base: r.defaultBranch,
          head: "HEAD",
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  }, [credentialsReady]);

  useEffect(() => {
    if (credentialsReady) void loadRepos();
  }, [credentialsReady, loadRepos]);

  useEffect(() => {
    const selected = repos
      .filter((r) => r.selected && r.base && r.head)
      .map((r) => ({
        owner: r.repo.owner,
        repo: r.repo.name,
        base: r.base,
        head: r.head,
      }));
    onScopesChange(selected);
  }, [repos, onScopesChange]);

  const toggle = (fullName: string) => {
    setRepos((rows) =>
      rows.map((r) => (r.repo.fullName === fullName ? { ...r, selected: !r.selected } : r))
    );
  };

  const update = (fullName: string, field: "base" | "head", value: string) => {
    setRepos((rows) =>
      rows.map((r) => (r.repo.fullName === fullName ? { ...r, [field]: value } : r))
    );
  };

  const filtered = repos.filter((r) =>
    r.repo.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCount = repos.filter((r) => r.selected).length;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>📂</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Repositories & Ranges</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Select repos and set base/head refs
            </div>
          </div>
        </div>
        {selectedCount > 0 && (
          <span className="badge badge-blue">{selectedCount} selected</span>
        )}
      </div>

      {!credentialsReady && (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>
          Configure credentials above to load repositories.
        </div>
      )}

      {credentialsReady && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input
              type="text"
              placeholder="Search repositories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary btn-sm" onClick={() => void loadRepos()} disabled={loading}>
              {loading ? <span className="spinner" /> : "↺ Refresh"}
            </button>
          </div>

          {error && <div className="error-text" style={{ marginBottom: 12 }}>⚠ {error}</div>}

          {loading && repos.length === 0 && (
            <div style={{ color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
              <span className="spinner" style={{ margin: "0 auto", display: "block" }} />
              <div style={{ marginTop: 8 }}>Loading repositories…</div>
            </div>
          )}

          {!loading && repos.length === 0 && !error && (
            <div style={{ color: "var(--text-muted)", padding: "12px 0" }}>
              No repositories found.
            </div>
          )}

          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((row) => (
              <div
                key={row.repo.fullName}
                style={{
                  background: row.selected ? "rgba(79,110,247,0.08)" : "var(--bg-input)",
                  border: `1px solid ${row.selected ? "var(--border-focus)" : "var(--border)"}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  transition: "0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    id={`repo-${row.repo.fullName}`}
                    checked={row.selected}
                    onChange={() => toggle(row.repo.fullName)}
                    style={{ width: "auto", cursor: "pointer", accentColor: "var(--accent)" }}
                  />
                  <label
                    htmlFor={`repo-${row.repo.fullName}`}
                    style={{
                      flex: 1,
                      cursor: "pointer",
                      marginBottom: 0,
                      textTransform: "none",
                      letterSpacing: 0,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--text)",
                    }}
                  >
                    {row.repo.fullName}
                    {row.repo.private && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-muted)" }}>🔒 private</span>
                    )}
                  </label>
                </div>

                {row.selected && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                    <div>
                      <label>Base (from)</label>
                      <input
                        type="text"
                        value={row.base}
                        onChange={(e) => update(row.repo.fullName, "base", e.target.value)}
                        placeholder={row.repo.defaultBranch}
                      />
                    </div>
                    <div>
                      <label>Head (to)</label>
                      <input
                        type="text"
                        value={row.head}
                        onChange={(e) => update(row.repo.fullName, "head", e.target.value)}
                        placeholder="HEAD or tag or SHA"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

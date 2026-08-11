import { useState, useEffect, useCallback, useRef } from "react";
import { listRepositories, listBranches } from "../lib/api.js";
import type { Repository, RepoScope, BranchOrTag } from "../lib/api.js";

interface Props {
  credentialsReady: boolean;
  onScopesChange: (scopes: RepoScope[]) => void;
}

interface RepoRow {
  repo: Repository;
  selected: boolean;
  base: string;
  head: string;
  refs: BranchOrTag[];
  loadingRefs: boolean;
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
      setRepos(list.map((r) => ({
        repo: r,
        selected: false,
        base: r.defaultBranch,
        head: r.defaultBranch,
        refs: [],
        loadingRefs: false,
      })));
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
      .map((r) => ({ owner: r.repo.owner, repo: r.repo.name, base: r.base, head: r.head }));
    onScopesChange(selected);
  }, [repos, onScopesChange]);

  const loadRefs = useCallback(async (fullName: string, owner: string, repo: string) => {
    setRepos((rows) => rows.map((r) => r.repo.fullName === fullName ? { ...r, loadingRefs: true } : r));
    const refs = await listBranches(owner, repo).catch(() => [] as BranchOrTag[]);
    setRepos((rows) => rows.map((r) => {
      if (r.repo.fullName !== fullName) return r;
      // Verify the default branch actually exists in the fetched refs; fall back to first branch
      const verifiedDefault =
        refs.find((ref) => ref.name === r.repo.defaultBranch)?.name ??
        refs.find((ref) => ref.type === "branch")?.name ??
        r.head;
      // Prefer the most recent tag as the base so there is a meaningful diff range;
      // fall back to the verified default branch (user should change it manually)
      const latestTag = refs.find((ref) => ref.type === "tag")?.name;
      return { ...r, loadingRefs: false, refs, head: verifiedDefault, base: latestTag ?? verifiedDefault };
    }));
  }, []);

  const toggle = (fullName: string, owner: string, repo: string) => {
    setRepos((rows) => rows.map((r) => {
      if (r.repo.fullName !== fullName) return r;
      const nowSelected = !r.selected;
      if (nowSelected && r.refs.length === 0) {
        void loadRefs(fullName, owner, repo);
      }
      return { ...r, selected: nowSelected };
    }));
  };

  const update = (fullName: string, field: "base" | "head", value: string) => {
    setRepos((rows) => rows.map((r) => r.repo.fullName === fullName ? { ...r, [field]: value } : r));
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
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Select repos and pick base → head branches or tags</div>
          </div>
        </div>
        {selectedCount > 0 && <span className="badge badge-blue">{selectedCount} selected</span>}
      </div>

      {!credentialsReady && (
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Configure credentials above to load repositories.</div>
      )}

      {credentialsReady && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input type="text" placeholder="Search repositories…" value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
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

          <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((row) => (
              <div key={row.repo.fullName} style={{
                background: row.selected ? "rgba(79,110,247,0.08)" : "var(--bg-input)",
                border: `1px solid ${row.selected ? "var(--border-focus)" : "var(--border)"}`,
                borderRadius: 8, padding: "10px 14px", transition: "0.15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" id={`repo-${row.repo.fullName}`} checked={row.selected}
                    onChange={() => toggle(row.repo.fullName, row.repo.owner, row.repo.name)}
                    style={{ width: "auto", cursor: "pointer", accentColor: "var(--accent)" }} />
                  <label htmlFor={`repo-${row.repo.fullName}`} style={{
                    flex: 1, cursor: "pointer", marginBottom: 0, textTransform: "none",
                    letterSpacing: 0, fontSize: 14, fontWeight: 500, color: "var(--text)",
                  }}>
                    {row.repo.fullName}
                    {row.repo.private && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-muted)" }}>🔒</span>}
                  </label>
                </div>

                {row.selected && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                    <RefPicker
                      label="Base (from)"
                      value={row.base}
                      refs={row.refs}
                      loading={row.loadingRefs}
                      onChange={(v) => update(row.repo.fullName, "base", v)}
                      helpText="Older point — tag, branch, or SHA"
                    />
                    <RefPicker
                      label="Head (to)"
                      value={row.head}
                      refs={row.refs}
                      loading={row.loadingRefs}
                      onChange={(v) => update(row.repo.fullName, "head", v)}
                      helpText="Newer point — usually main or latest tag"
                    />
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

function RefPicker({ label, value, refs, loading, onChange, helpText }: {
  label: string;
  value: string;
  refs: BranchOrTag[];
  loading: boolean;
  onChange: (v: string) => void;
  helpText: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false); // true only when user has actively typed
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sync external value → input when it changes from outside; reset dirty so we show all refs
  useEffect(() => { setQuery(value); setDirty(false); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Commit whatever is typed as the value
        if (query !== value) onChange(query);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [query, value, onChange]);

  // Only filter when the user has actively typed — otherwise show all refs
  const lq = dirty ? query.toLowerCase() : "";
  const branches = refs.filter((r) => r.type === "branch" && (!dirty || r.name.toLowerCase().includes(lq)));
  const tags = refs.filter((r) => r.type === "tag" && (!dirty || r.name.toLowerCase().includes(lq)));
  const hasResults = branches.length > 0 || tags.length > 0;
  const exactMatch = refs.some((r) => r.name === query);

  const select = (name: string) => {
    setQuery(name);
    setDirty(false);
    onChange(name);
    setOpen(false);
  };

  if (loading) {
    return (
      <div>
        <label>{label}</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text-muted)", fontSize: 13 }}>
          <span className="spinner" /> Loading refs…
        </div>
        <p className="help-text">{helpText}</p>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <label>{label}</label>
      <input
        type="text"
        value={query}
        placeholder="Search branch, tag, or type SHA…"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setDirty(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onChange(query); setOpen(false); }
          if (e.key === "Escape") setOpen(false);
        }}
        style={{ borderRadius: open ? "var(--radius) var(--radius) 0 0" : undefined }}
      />
      {open && refs.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: "var(--bg-card)", border: "1px solid var(--border-focus)",
          borderTop: "none", borderRadius: "0 0 var(--radius) var(--radius)",
          maxHeight: 220, overflowY: "auto", boxShadow: "var(--shadow)",
        }}>
          {/* Custom value row if typed something not in list */}
          {query && !exactMatch && (
            <div
              onClick={() => select(query)}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "var(--accent)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(79,110,247,0.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <span style={{ fontSize: 11, opacity: 0.7 }}>✏</span>
              Use <code style={{ color: "var(--accent)" }}>{query}</code> as-is (SHA / custom ref)
            </div>
          )}

          {!hasResults && query && (
            <div style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 12 }}>
              No matching branches or tags — press Enter to use as custom ref
            </div>
          )}

          {branches.length > 0 && (
            <>
              <div style={{ padding: "4px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--bg)" }}>
                Branches
              </div>
              {branches.map((b) => (
                <div key={b.name} onClick={() => select(b.name)}
                  style={{ padding: "7px 12px", cursor: "pointer", fontSize: 13, color: b.name === value ? "var(--accent)" : "var(--text)", fontWeight: b.name === value ? 600 : 400, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(79,110,247,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <span style={{ fontSize: 11 }}>⎇</span> {b.name}
                  {b.name === value && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--accent)" }}>✓</span>}
                </div>
              ))}
            </>
          )}

          {tags.length > 0 && (
            <>
              <div style={{ padding: "4px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--bg)" }}>
                Tags
              </div>
              {tags.map((t) => (
                <div key={t.name} onClick={() => select(t.name)}
                  style={{ padding: "7px 12px", cursor: "pointer", fontSize: 13, color: t.name === value ? "var(--accent)" : "var(--text)", fontWeight: t.name === value ? 600 : 400, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(79,110,247,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <span style={{ fontSize: 11 }}>🏷</span> {t.name}
                  {t.name === value && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--accent)" }}>✓</span>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
      <p className="help-text">{helpText}</p>
    </div>
  );
}

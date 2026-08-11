import { useState, useEffect, useCallback, useRef } from "react";
import { listJiraProjects, searchJiraIssues } from "../lib/api.js";
import type { JiraProject, JiraIssueSummary } from "../lib/api.js";

const LOOKBACK_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
];

interface Props {
  credentialsReady: boolean;
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  lookbackDays: number;
  onLookbackDaysChange: (n: number) => void;
  pinnedIssues: string[];
  onPinnedIssuesChange: (keys: string[]) => void;
}

const PRIORITY_ICON: Record<string, string> = {
  Blocker: "🔴", Critical: "🔴", High: "🟠", Medium: "🟡", Low: "🔵", Lowest: "⚪",
};
const TYPE_ICON: Record<string, string> = {
  Bug: "🐛", Story: "📖", Task: "✅", "New Feature": "✨",
  Improvement: "🔧", Enhancement: "🔧", Epic: "⚡", "Sub-task": "↳",
};

export function JiraProjectSelector({
  credentialsReady,
  selectedKeys,
  onSelectionChange,
  lookbackDays,
  onLookbackDaysChange,
  pinnedIssues,
  onPinnedIssuesChange,
}: Props) {
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Ticket search state
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketResults, setTicketResults] = useState<JiraIssueSummary[]>([]);
  const [ticketLoading, setTicketLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!credentialsReady) return;
    setLoading(true);
    try {
      const list = await listJiraProjects();
      setProjects(list);
    } finally {
      setLoading(false);
    }
  }, [credentialsReady]);

  useEffect(() => {
    if (credentialsReady) void load();
  }, [credentialsReady, load]);

  // Debounced ticket search
  useEffect(() => {
    if (selectedKeys.length === 0) { setTicketResults([]); setTicketLoading(false); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    // Mark loading immediately so the UI shows spinner instead of "not found" during debounce
    setTicketLoading(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchJiraIssues(selectedKeys, ticketSearch);
        setTicketResults(results);
      } finally {
        setTicketLoading(false);
      }
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [ticketSearch, selectedKeys]);

  const toggleProject = (key: string) => {
    if (selectedKeys.includes(key)) {
      onSelectionChange(selectedKeys.filter((k) => k !== key));
      // Remove any pinned issues from this project
      onPinnedIssuesChange(pinnedIssues.filter((k) => !k.startsWith(key + "-")));
    } else {
      onSelectionChange([...selectedKeys, key]);
    }
  };

  const togglePinnedIssue = (key: string) => {
    if (pinnedIssues.includes(key)) {
      onPinnedIssuesChange(pinnedIssues.filter((k) => k !== key));
    } else {
      onPinnedIssuesChange([...pinnedIssues, key]);
    }
  };

  const filtered = projects.filter((p) =>
    p.key.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!credentialsReady) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>🎯</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Jira Filter</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Pick projects → optionally pin specific tickets to include
          </div>
        </div>
        {selectedKeys.length > 0 && (
          <span className="badge badge-blue" style={{ marginLeft: "auto" }}>
            {selectedKeys.join(", ")}
          </span>
        )}
      </div>

      {/* ── Step 1: Project selection ── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Step 1 — Select Projects
      </div>

      {selectedKeys.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--warning)", marginBottom: 10, padding: "6px 10px", background: "rgba(245,158,11,0.08)", borderRadius: 6, border: "1px solid rgba(245,158,11,0.2)" }}>
          ⚠ No project selected — all Jira-prefixed commits will be included
        </div>
      )}

      {/* Selected project pills */}
      {selectedKeys.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {selectedKeys.map((key) => {
            const p = projects.find((p) => p.key === key);
            return (
              <span key={key} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px", background: "rgba(79,110,247,0.15)",
                border: "1px solid var(--border-focus)", borderRadius: 99,
                fontSize: 12, fontWeight: 600, color: "var(--accent)",
              }}>
                <code style={{ color: "inherit" }}>{key}</code>
                {p && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· {p.name}</span>}
                <button onClick={() => toggleProject(key)}
                  style={{ background: "none", color: "var(--text-muted)", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</button>
              </span>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span className="spinner" /> Loading Jira projects…
        </div>
      ) : projects.length > 0 ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="text" placeholder="Search by key or name…" value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-secondary btn-sm" onClick={() => onSelectionChange(projects.map((p) => p.key))}>All</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { onSelectionChange([]); onPinnedIssuesChange([]); }}>None</button>
            <button className="btn btn-secondary btn-sm" onClick={() => void load()}>↺</button>
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
            {filtered.map((p) => {
              const sel = selectedKeys.includes(p.key);
              return (
                <label key={p.key} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 12px",
                  background: sel ? "rgba(79,110,247,0.08)" : "var(--bg-input)",
                  border: `1px solid ${sel ? "var(--border-focus)" : "var(--border)"}`,
                  borderRadius: 6, cursor: "pointer", transition: "0.12s",
                }}>
                  <input type="checkbox" checked={sel} onChange={() => toggleProject(p.key)}
                    style={{ width: "auto", accentColor: "var(--accent)" }} />
                  <code style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", minWidth: 60 }}>{p.key}</code>
                  <span style={{ fontSize: 13, color: "var(--text)" }}>{p.name}</span>
                </label>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
          No Jira projects found — check credentials.
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 10 }} onClick={() => void load()}>Retry</button>
        </div>
      )}

      {/* ── Step 2: Ticket search & pin ── */}
      {selectedKeys.length > 0 && (
        <>
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0 14px" }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Step 2 — Pin specific tickets (optional)
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            Pin specific issues to always include them, even if not in the commit range. Leave empty to include all matching commits.
          </div>

          {/* Pinned issues pills */}
          {pinnedIssues.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {pinnedIssues.map((key) => {
                const issue = ticketResults.find((i) => i.key === key);
                return (
                  <span key={key} style={{
                    display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
                    background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)",
                    borderRadius: 99, fontSize: 12, fontWeight: 600, color: "var(--success)",
                  }}>
                    <code style={{ color: "inherit" }}>{key}</code>
                    {issue && <span style={{ color: "var(--text-muted)", fontWeight: 400, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.summary}</span>}
                    <button onClick={() => togglePinnedIssue(key)}
                      style={{ background: "none", color: "var(--text-muted)", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</button>
                  </span>
                );
              })}
            </div>
          )}

          <input
            type="text"
            placeholder={`Search tickets in ${selectedKeys.join(", ")}… (key or summary)`}
            value={ticketSearch}
            onChange={(e) => setTicketSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />

          {ticketLoading && (
            <div style={{ color: "var(--text-muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: "6px 0" }}>
              <span className="spinner" /> Searching…
            </div>
          )}

          {!ticketLoading && ticketResults.length > 0 && (
            <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {ticketResults.map((issue) => {
                const pinned = pinnedIssues.includes(issue.key);
                return (
                  <label key={issue.key} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px",
                    background: pinned ? "rgba(34,197,94,0.06)" : "var(--bg-input)",
                    border: `1px solid ${pinned ? "rgba(34,197,94,0.4)" : "var(--border)"}`,
                    borderRadius: 6, cursor: "pointer", transition: "0.12s",
                  }}>
                    <input type="checkbox" checked={pinned} onChange={() => togglePinnedIssue(issue.key)}
                      style={{ width: "auto", accentColor: "var(--success)", marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <code style={{ fontSize: 12, fontWeight: 700, color: pinned ? "var(--success)" : "var(--accent)" }}>{issue.key}</code>
                        <span style={{ fontSize: 11 }}>{TYPE_ICON[issue.issueType] ?? "📋"}</span>
                        <span style={{ fontSize: 11 }}>{PRIORITY_ICON[issue.priority] ?? "⚪"}</span>
                        <span style={{ fontSize: 11, color: "var(--text-dim)", background: "var(--bg)", padding: "1px 6px", borderRadius: 4 }}>{issue.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {issue.summary}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {!ticketLoading && ticketResults.length === 0 && ticketSearch && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "6px 0" }}>No matching tickets found.</div>
          )}

          {!ticketLoading && ticketResults.length === 0 && !ticketSearch && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "6px 0" }}>
              Type a ticket key (e.g. <code>OPS-123</code>) or keyword to search issues.
            </div>
          )}
        </>
      )}

      {/* ── Lookback window ── */}
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <label style={{ marginBottom: 0, whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Look back
        </label>
        <select value={lookbackDays} onChange={(e) => onLookbackDaysChange(Number(e.target.value))}
          style={{ width: "auto" }}>
          {LOOKBACK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>of commits per repo</span>
      </div>
    </div>
  );
}

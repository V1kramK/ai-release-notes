import type { GenerationState, GenerationWarning } from "../hooks/useGenerate.js";
import type { RepoScope } from "../lib/api.js";

interface Props {
  scopes: RepoScope[];
  state: GenerationState;
  onGenerate: (useFake?: boolean) => void;
  onCancel: () => void;
  onReset: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  collecting_commits: "Collecting commits",
  resolving_pull_requests: "Resolving pull requests",
  resolving_jira_issues: "Resolving Jira issues",
  summarizing: "Summarizing with AI",
  assembling: "Assembling notes",
};

export function GeneratePanel({ scopes, state, onGenerate, onCancel, onReset }: Props) {
  const canGenerate = scopes.length > 0 && !state.running;
  const { running, phase, warnings, done, error, durationMs, sections } = state;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>⚡</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Generate</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            AI-powered release notes from your selected repositories
          </div>
        </div>
      </div>

      {scopes.length === 0 && !running && (
        <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>
          Select at least one repository above to continue.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="btn btn-primary"
          disabled={!canGenerate}
          onClick={() => onGenerate(false)}
        >
          {running ? <><span className="spinner" /> Generating…</> : "Generate release notes"}
        </button>

        <button
          className="btn btn-secondary"
          disabled={!canGenerate}
          onClick={() => onGenerate(true)}
          title="Use mock summarizer (no Cursor API calls)"
        >
          ⚗ Demo mode
        </button>

        {running && (
          <button className="btn btn-danger btn-sm" onClick={onCancel}>
            ✕ Cancel
          </button>
        )}

        {(done || error) && (
          <button className="btn btn-secondary btn-sm" onClick={onReset}>
            ↺ Reset
          </button>
        )}
      </div>

      {(running || phase) && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: "var(--text)" }} role="status" aria-live="polite">
              {phase ? (
                <>
                  {PHASE_LABELS[phase.phase] ?? phase.phase}
                  {phase.repo && <span style={{ color: "var(--text-muted)" }}> — {phase.repo}</span>}
                </>
              ) : (
                "Starting…"
              )}
            </div>
            {sections.length > 0 && (
              <span className="badge badge-blue">{sections.length} section{sections.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className={`progress-bar ${phase?.pct == null ? "progress-indeterminate" : ""}`}>
            <div
              className="progress-fill"
              style={{ width: phase?.pct != null ? `${phase.pct}%` : "40%" }}
            />
          </div>
        </div>
      )}

      {done && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="badge badge-green">✓ Done</span>
          {durationMs != null && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              in {(durationMs / 1000).toFixed(1)}s · {sections.length} section{sections.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8 }}>
          <div style={{ color: "var(--error)", fontSize: 13, fontWeight: 600 }}>Generation failed</div>
          <div style={{ color: "var(--text)", fontSize: 13, marginTop: 4 }}>{error}</div>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--warning)", marginBottom: 6 }}>
            ⚠ {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {warnings.map((w, i) => (
              <WarningRow key={i} warning={w} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WarningRow({ warning }: { warning: GenerationWarning }) {
  return (
    <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 8px", background: "rgba(245,158,11,0.06)", borderRadius: 4, border: "1px solid rgba(245,158,11,0.2)" }}>
      {warning.jiraKey && <code style={{ color: "var(--warning)", marginRight: 6 }}>{warning.jiraKey}</code>}
      {warning.repo && <span style={{ marginRight: 6, color: "var(--text-dim)" }}>{warning.repo}:</span>}
      {warning.message}
    </div>
  );
}

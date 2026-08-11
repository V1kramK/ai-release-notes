import { useState, useEffect } from "react";
import type { CredentialPayload, CredentialStatus } from "../lib/api.js";
import { listCursorModels } from "../lib/api.js";
import type { CursorModel } from "../lib/api.js";

interface Props {
  status: CredentialStatus | null;
  saving: boolean;
  error: string | null;
  onSave: (payload: CredentialPayload) => Promise<boolean>;
  onClear: () => void;
}

const DEFAULT_MODEL = "auto";

const EMPTY: CredentialPayload = {
  githubToken: "",
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraToken: "",
  cursorApiToken: "",
  cursorModelId: DEFAULT_MODEL,
};

export function CredentialsPanel({ status, saving, error, onSave, onClear }: Props) {
  const [form, setForm] = useState<CredentialPayload>(EMPTY);
  const [showTokens, setShowTokens] = useState(false);
  const [collapsed, setCollapsed] = useState(status?.status === "ok");
  const [models, setModels] = useState<CursorModel[]>([]);

  useEffect(() => {
    listCursorModels().then(setModels).catch(() => {});
  }, []);

  const configured = status?.status === "ok";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onSave({ ...form, cursorModelId: form.cursorModelId || undefined });
    if (ok) {
      setCollapsed(true);
      setForm(EMPTY);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔑</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Credentials</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              GitHub · Jira · Cursor API
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {configured ? (
            <span className="badge badge-green">
              <span className="dot dot-green" /> Active
            </span>
          ) : (
            <span className="badge badge-yellow">
              <span className="dot dot-yellow" /> Not configured
            </span>
          )}
          <span style={{ color: "var(--text-muted)", fontSize: 18, transform: collapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "0.2s" }}>
            ›
          </span>
        </div>
      </div>

      {configured && !collapsed && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <CredentialItem label="GitHub" preview={status!.credentials.github.preview} />
            <CredentialItem label="Jira" preview={status!.credentials.jira.preview} extra={status!.credentials.jira.baseUrl} />
            <CredentialItem label="Cursor" preview={status!.credentials.cursor.preview} extra={status!.credentials.cursor.modelId} />
          </div>
          <div className="divider" />
          <button className="btn btn-danger btn-sm" onClick={onClear}>
            Clear credentials
          </button>
        </div>
      )}

      {!collapsed && !configured && (
        <form onSubmit={(e) => void handleSubmit(e)} style={{ marginTop: 20 }}>
          <div style={{ display: "grid", gap: 16 }}>
            <Section title="GitHub">
              <div className="field">
                <label htmlFor="githubToken">Personal Access Token (PAT)</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="githubToken"
                    type={showTokens ? "text" : "password"}
                    placeholder="ghp_... or github_pat_..."
                    value={form.githubToken}
                    onChange={(e) => setForm((f) => ({ ...f, githubToken: e.target.value }))}
                    required
                    autoComplete="off"
                  />
                </div>
                <p className="help-text">Needs repo:read scope to list commits and PRs</p>
              </div>
            </Section>

            <Section title="Jira">
              <div className="field">
                <label htmlFor="jiraBaseUrl">Base URL</label>
                <input
                  id="jiraBaseUrl"
                  type="url"
                  placeholder="https://yourcompany.atlassian.net"
                  value={form.jiraBaseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, jiraBaseUrl: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="jiraEmail">Email (for Cloud)</label>
                <input
                  id="jiraEmail"
                  type="email"
                  placeholder="you@company.com"
                  value={form.jiraEmail}
                  onChange={(e) => setForm((f) => ({ ...f, jiraEmail: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="jiraToken">API Token (Cloud) or PAT (Server)</label>
                <input
                  id="jiraToken"
                  type={showTokens ? "text" : "password"}
                  placeholder="Jira API token or PAT"
                  value={form.jiraToken}
                  onChange={(e) => setForm((f) => ({ ...f, jiraToken: e.target.value }))}
                  required
                  autoComplete="off"
                />
              </div>
            </Section>

            <Section title="Cursor AI">
              <div className="field">
                <label htmlFor="cursorApiToken">API Token</label>
                <input
                  id="cursorApiToken"
                  type={showTokens ? "text" : "password"}
                  placeholder="Cursor API token"
                  value={form.cursorApiToken}
                  onChange={(e) => setForm((f) => ({ ...f, cursorApiToken: e.target.value }))}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="cursorModelId">Model</label>
                <select
                  id="cursorModelId"
                  value={form.cursorModelId}
                  onChange={(e) => setForm((f) => ({ ...f, cursorModelId: e.target.value }))}
                >
                  {models.length > 0 ? (
                    models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))
                  ) : (
                    <option value={DEFAULT_MODEL}>Auto (let Cursor pick)</option>
                  )}
                </select>
              </div>
            </Section>
          </div>

          {error && (
            <div className="error-text" style={{ marginTop: 12 }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner" /> Saving…</> : "Save credentials"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textTransform: "none", letterSpacing: 0, fontSize: 13, fontWeight: 500, color: "var(--text-muted)", marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={showTokens}
                onChange={(e) => setShowTokens(e.target.checked)}
                style={{ width: "auto" }}
              />
              Show tokens
            </label>
          </div>
        </form>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ paddingLeft: 0 }}>{children}</div>
    </div>
  );
}

function CredentialItem({ label, preview, extra }: { label: string; preview: string; extra?: string }) {
  return (
    <div style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", flex: "1 1 auto", minWidth: 160 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <code style={{ fontSize: 13, color: "var(--text)" }}>{preview}</code>
      {extra && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{extra}</div>}
    </div>
  );
}

import { useState, useCallback } from "react";
import { CredentialsPanel } from "./components/CredentialsPanel.js";
import { ScopeSelector } from "./components/ScopeSelector.js";
import { GeneratePanel } from "./components/GeneratePanel.js";
import { NotesEditor } from "./components/NotesEditor.js";
import { useCredentials } from "./hooks/useCredentials.js";
import { useGenerate } from "./hooks/useGenerate.js";
import type { RepoScope } from "./lib/api.js";

export function App() {
  const credentials = useCredentials();
  const { state, generate, cancel, reset, assembledMarkdown } = useGenerate();
  const [scopes, setScopes] = useState<RepoScope[]>([]);

  const handleGenerate = useCallback(
    (useFake = false) => {
      generate(scopes, useFake);
    },
    [scopes, generate]
  );

  const credentialsReady = credentials.status?.status === "ok";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 24 }}>🚀</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>
              AI Release Notes Generator
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              GitHub · Jira · Cursor AI
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {credentialsReady && (
          <span className="badge badge-green">
            <span className="dot dot-green" /> Session active
          </span>
        )}
      </header>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          maxWidth: 860,
          width: "100%",
          margin: "0 auto",
          padding: "24px 16px",
        }}
      >
        {credentials.loading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
            <span className="spinner" style={{ display: "inline-block" }} />
            <div style={{ marginTop: 12 }}>Loading…</div>
          </div>
        ) : (
          <>
            <CredentialsPanel
              status={credentials.status}
              saving={credentials.saving}
              error={credentials.error}
              onSave={credentials.save}
              onClear={() => void credentials.clear()}
            />

            <ScopeSelector
              credentialsReady={credentialsReady}
              onScopesChange={setScopes}
            />

            <GeneratePanel
              scopes={scopes}
              state={state}
              onGenerate={handleGenerate}
              onCancel={cancel}
              onReset={reset}
            />

            <NotesEditor
              markdown={assembledMarkdown}
              visible={state.sections.length > 0}
            />
          </>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "16px 24px",
          borderTop: "1px solid var(--border)",
          textAlign: "center",
          fontSize: 12,
          color: "var(--text-dim)",
        }}
      >
        AI Release Notes Generator — self-hosted, session-scoped, no data stored server-side
      </footer>
    </div>
  );
}

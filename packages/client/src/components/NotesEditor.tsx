import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Props {
  markdown: string;
  visible: boolean;
}

export function NotesEditor({ markdown: initialMarkdown, visible }: Props) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [tab, setTab] = useState<"edit" | "preview">("preview");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMarkdown(initialMarkdown);
  }, [initialMarkdown]);

  if (!visible || !markdown) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = markdown;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `release-notes-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>📝</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Release Notes</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Edit, preview, and copy
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleDownload}
            title="Download as .md file"
          >
            ↓ Download
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void handleCopy()}
            style={{ minWidth: 80 }}
          >
            {copied ? "✓ Copied!" : "📋 Copy"}
          </button>
        </div>
      </div>

      <div className="tab-bar" style={{ marginTop: 16, marginBottom: 16 }}>
        <button className={`tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>
          Preview
        </button>
        <button className={`tab ${tab === "edit" ? "active" : ""}`} onClick={() => setTab("edit")}>
          Edit Markdown
        </button>
      </div>

      {tab === "preview" ? (
        <div
          className="markdown-output"
          style={{
            minHeight: 200,
            maxHeight: 600,
            overflowY: "auto",
            padding: "4px 0",
            lineHeight: 1.7,
          }}
        >
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
      ) : (
        <textarea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          style={{
            minHeight: 400,
            fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', monospace",
            fontSize: 13,
            lineHeight: 1.6,
            resize: "vertical",
          }}
          spellCheck={false}
          aria-label="Markdown editor"
        />
      )}

      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <div className="tooltip-wrap">
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {markdown.split("\n").length} lines · {markdown.length} chars
          </span>
        </div>
      </div>
    </div>
  );
}

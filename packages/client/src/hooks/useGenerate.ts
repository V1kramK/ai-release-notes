import { useState, useCallback, useRef } from "react";
import { startGeneration } from "../lib/api.js";
import type { RepoScope } from "../lib/api.js";
import { CATEGORY_ORDER } from "@release-notes/shared";
import type { Category } from "@release-notes/shared";

export interface GenerationPhase {
  phase: string;
  repo?: string;
  pct?: number;
}

export interface GenerationWarning {
  repo?: string;
  jiraKey?: string;
  message: string;
}

export interface SectionData {
  category: Category;
  repo: string;
  content: string;
}

export interface GenerationState {
  running: boolean;
  phase: GenerationPhase | null;
  sections: SectionData[];
  warnings: GenerationWarning[];
  done: boolean;
  error: string | null;
  durationMs: number | null;
}

const INITIAL_STATE: GenerationState = {
  running: false,
  phase: null,
  sections: [],
  warnings: [],
  done: false,
  error: null,
  durationMs: null,
};

export function useGenerate() {
  const [state, setState] = useState<GenerationState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback((scopes: RepoScope[], useFake = false) => {
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setState({ ...INITIAL_STATE, running: true });

    startGeneration(
      scopes,
      useFake,
      (eventName, data) => {
        const d = data as Record<string, unknown>;

        if (eventName === "phase") {
          setState((prev) => ({
            ...prev,
            phase: {
              phase: String(d["phase"] ?? ""),
              repo: typeof d["repo"] === "string" ? d["repo"] : undefined,
              pct: typeof d["pct"] === "number" ? d["pct"] : undefined,
            },
          }));
        } else if (eventName === "section") {
          setState((prev) => ({
            ...prev,
            sections: [
              ...prev.sections,
              {
                category: String(d["category"] ?? "") as Category,
                repo: String(d["repo"] ?? ""),
                content: String(d["content"] ?? ""),
              },
            ],
          }));
        } else if (eventName === "warning") {
          setState((prev) => ({
            ...prev,
            warnings: [
              ...prev.warnings,
              {
                message: String(d["message"] ?? ""),
                repo: typeof d["repo"] === "string" ? d["repo"] : undefined,
                jiraKey: typeof d["jiraKey"] === "string" ? d["jiraKey"] : undefined,
              },
            ],
          }));
        } else if (eventName === "done") {
          setState((prev) => ({
            ...prev,
            running: false,
            done: true,
            durationMs: typeof d["durationMs"] === "number" ? d["durationMs"] : null,
            phase: null,
          }));
        } else if (eventName === "error") {
          setState((prev) => ({
            ...prev,
            running: false,
            error: String(d["message"] ?? "Unknown error"),
            phase: null,
          }));
        }
      },
      controller.signal
    );
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, running: false, phase: null }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const assembledMarkdown = (() => {
    if (state.sections.length === 0) return "";
    const lines: string[] = ["# Release Notes", ""];

    for (const category of CATEGORY_ORDER) {
      const categorySections = state.sections.filter((s) => s.category === category);
      if (categorySections.length === 0) continue;

      lines.push(`## ${category}`, "");

      for (const section of categorySections) {
        if (categorySections.length > 1) {
          lines.push(`### ${section.repo}`, "");
        }
        lines.push(section.content, "");
      }
    }

    return lines.join("\n");
  })();

  return { state, generate, cancel, reset, assembledMarkdown };
}

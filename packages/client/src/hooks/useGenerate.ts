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
  jiraKey?: string;
  jiraSummary?: string;
}

export interface CheckpointEntry {
  message: string;
  ts: number;
}

export interface GenerationState {
  running: boolean;
  phase: GenerationPhase | null;
  sections: SectionData[];
  warnings: GenerationWarning[];
  checkpoints: CheckpointEntry[];
  done: boolean;
  error: string | null;
  durationMs: number | null;
}

const INITIAL_STATE: GenerationState = {
  running: false,
  phase: null,
  sections: [],
  warnings: [],
  checkpoints: [],
  done: false,
  error: null,
  durationMs: null,
};

export function useGenerate() {
  const [state, setState] = useState<GenerationState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback((scopes: RepoScope[], useFake = false, jiraProjectKeys?: string[], lookbackDays?: number, pinnedIssueKeys?: string[]) => {
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
                jiraKey: typeof d["jiraKey"] === "string" ? d["jiraKey"] : undefined,
                jiraSummary: typeof d["jiraSummary"] === "string" ? d["jiraSummary"] : undefined,
              },
            ],
          }));
        } else if (eventName === "checkpoint") {
          setState((prev) => ({
            ...prev,
            checkpoints: [...prev.checkpoints, { message: String(d["message"] ?? ""), ts: Date.now() }],
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
          const ms = typeof d["durationMs"] === "number" && d["durationMs"] > 0 ? d["durationMs"] : null;
          setState((prev) => ({
            ...prev,
            running: false,
            done: ms !== null || prev.sections.length > 0,  // only mark done if we have real results or real timing
            durationMs: ms,
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
      controller.signal,
      jiraProjectKeys,
      lookbackDays,
      pinnedIssueKeys
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
        const heading = section.jiraKey
          ? `### ${section.jiraKey}${section.jiraSummary ? ` — ${section.jiraSummary}` : ""}`
          : `### ${section.repo}`;
        lines.push(heading, "");
        lines.push(section.content, "");
      }
    }

    return lines.join("\n");
  })();

  return { state, generate, cancel, reset, assembledMarkdown };
}

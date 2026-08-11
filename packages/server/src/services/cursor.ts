import { Agent, Cursor, CursorAgentError } from "@cursor/sdk";
import type { SummarizerPort, SummarizerResult, SummarizerPingResult, CursorModelInfo } from "../ports/index.js";

export class CursorSummarizer implements SummarizerPort {
  private readonly apiKey: string;
  private readonly modelId: string;

  constructor(apiKey: string, modelId: string) {
    this.apiKey = apiKey;
    this.modelId = modelId;
  }

  async summarize(systemPrompt: string, context: string): Promise<SummarizerResult> {
    const fullPrompt = `${systemPrompt}\n\n---\n\n${context}`;

    try {
      console.info(`[cursor-sdk] Agent.prompt starting, model=${this.modelId}`);

      const result = await Agent.prompt(fullPrompt, {
        apiKey: this.apiKey,
        model: { id: this.modelId },
        tools: [],
      });

      console.info(`[cursor-sdk] Agent.prompt finished, status=${result.status}, durationMs=${result.durationMs}`);

      if (result.status === "finished") {
        const text = result.result ?? "";
        if (!text) {
          return { status: "failed", reason: "Agent finished but returned no text" };
        }
        return { status: "succeeded", text };
      }

      if (result.status === "error") {
        const reason = result.error?.message ?? "Agent run errored";
        return { status: "failed", reason };
      }

      if (result.status === "cancelled") {
        return { status: "failed", reason: "Agent run was cancelled" };
      }

      return { status: "failed", reason: `Unexpected status: ${result.status}` };
    } catch (err) {
      if (err instanceof CursorAgentError) {
        const retryNote = err.isRetryable ? " (retryable)" : "";
        console.error(`[cursor-sdk] CursorAgentError: ${err.message}${retryNote}`);
        return { status: "failed", reason: `${err.message}${retryNote}` };
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cursor-sdk] unexpected error:`, msg);
      return { status: "failed", reason: msg };
    }
  }

  async ping(): Promise<SummarizerPingResult> {
    try {
      const models = await Cursor.models.list({ apiKey: this.apiKey });
      if (models && models.length > 0) {
        return { ok: true };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("authentication")) {
        return { ok: false, status: 401, error: msg };
      }
      return { ok: false, error: msg };
    }
  }

  async listModels(): Promise<CursorModelInfo[]> {
    try {
      const models = await Cursor.models.list({ apiKey: this.apiKey });
      return models.map((m) => ({
        id: m.id,
        name: m.displayName ?? m.id,
      }));
    } catch (err) {
      console.warn("[cursor-sdk] failed to list models:", err instanceof Error ? err.message : err);
      return [];
    }
  }
}

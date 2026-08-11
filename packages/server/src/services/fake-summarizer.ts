import type { SummarizerPort, SummarizerResult, CursorModelInfo } from "../ports/index.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeSummarizer implements SummarizerPort {
  async summarize(_prompt: string, context: string): Promise<SummarizerResult> {
    await sleep(800);

    const lines = context
      .split("\n")
      .filter((l) => l.startsWith("Commit: ") || l.startsWith("Jira Summary: "))
      .map((l) => `- ${l.replace(/^(Commit|Jira Summary): /, "").trim()}`)
      .join("\n");

    return {
      status: "succeeded",
      text: lines || "- No changes detected in this category for this release.",
    };
  }

  async ping(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async listModels(): Promise<CursorModelInfo[]> {
    return [{ id: "fake-model", name: "Fake (Demo)" }];
  }
}

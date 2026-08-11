import { createHash } from "crypto";
import type { SummarizerPort, SummarizerResult, SummarizerTask } from "../ports/index.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeSummarizer implements SummarizerPort {
  private readonly tasks = new Map<string, { context: string; polls: number }>();

  async createTask(prompt: string, context: string): Promise<SummarizerTask> {
    const id = createHash("sha256").update(context).digest("hex").slice(0, 12);
    this.tasks.set(id, { context, polls: 0 });
    return { id };
  }

  async pollTask(taskId: string): Promise<SummarizerResult> {
    await sleep(300);
    const task = this.tasks.get(taskId);
    if (!task) return { status: "failed", reason: "Task not found" };

    task.polls++;

    if (task.polls < 2) {
      return { status: "failed", reason: "still running (fake)" };
    }

    const lines = task.context
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => `- ${l.slice(2).trim()}`)
      .join("\n");

    return {
      status: "succeeded",
      text: lines || "- No changes detected in this category for this release.",
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

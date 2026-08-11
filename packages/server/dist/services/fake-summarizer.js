import { createHash } from "crypto";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class FakeSummarizer {
    tasks = new Map();
    async createTask(prompt, context) {
        const id = createHash("sha256").update(context).digest("hex").slice(0, 12);
        this.tasks.set(id, { context, polls: 0 });
        return { id };
    }
    async pollTask(taskId) {
        await sleep(300);
        const task = this.tasks.get(taskId);
        if (!task)
            return { status: "failed", reason: "Task not found" };
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
    async cancelTask(taskId) {
        this.tasks.delete(taskId);
    }
    async ping() {
        return true;
    }
}
//# sourceMappingURL=fake-summarizer.js.map
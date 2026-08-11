const CURSOR_API_BASE = "https://api.cursor.com";
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_INTERVAL_MS = 3000;
const TASK_TIMEOUT_MS = 180_000;
function jitter(base) {
    return base + Math.floor(Math.random() * 500);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class CursorSummarizer {
    apiToken;
    modelId;
    constructor(apiToken, modelId) {
        this.apiToken = apiToken;
        this.modelId = modelId;
    }
    headers() {
        return {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
            "User-Agent": "release-notes-generator/1.0",
        };
    }
    async createTask(prompt, context) {
        const body = JSON.stringify({
            model: this.modelId,
            messages: [
                {
                    role: "system",
                    content: prompt,
                },
                {
                    role: "user",
                    content: context,
                },
            ],
        });
        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30_000);
                const response = await fetch(`${CURSOR_API_BASE}/v1/agents`, {
                    method: "POST",
                    headers: this.headers(),
                    body,
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (!response.ok) {
                    const text = await response.text().catch(() => "");
                    throw new Error(`Cursor API ${response.status}: ${text.slice(0, 200)}`);
                }
                const data = (await response.json());
                return { id: data.id };
            }
            catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                if (attempt < 1)
                    await sleep(1000);
            }
        }
        throw lastError ?? new Error("Failed to create Cursor agent task");
    }
    async pollTask(taskId) {
        const deadline = Date.now() + TASK_TIMEOUT_MS;
        let interval = POLL_INTERVAL_MS;
        while (Date.now() < deadline) {
            await sleep(jitter(interval));
            interval = Math.min(interval * 1.5, MAX_POLL_INTERVAL_MS);
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15_000);
                const response = await fetch(`${CURSOR_API_BASE}/v1/agents/${taskId}`, {
                    headers: this.headers(),
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (response.status === 429) {
                    const retryAfter = response.headers.get("retry-after");
                    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
                    await sleep(waitMs);
                    continue;
                }
                if (!response.ok) {
                    const text = await response.text().catch(() => "");
                    if (response.status >= 500) {
                        await sleep(jitter(2000));
                        continue;
                    }
                    return { status: "failed", reason: `HTTP ${response.status}: ${text.slice(0, 200)}` };
                }
                const data = (await response.json());
                if (data.status === "completed" && data.result) {
                    return { status: "succeeded", text: data.result };
                }
                if (data.status === "failed") {
                    return { status: "failed", reason: data.error ?? "Agent reported failure" };
                }
                if (data.status === "cancelled") {
                    return { status: "failed", reason: "Agent task was cancelled" };
                }
            }
            catch (err) {
                if (Date.now() >= deadline)
                    break;
                await sleep(jitter(2000));
            }
        }
        return { status: "timed_out" };
    }
    async cancelTask(taskId) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10_000);
            await fetch(`${CURSOR_API_BASE}/v1/agents/${taskId}/cancel`, {
                method: "POST",
                headers: this.headers(),
                signal: controller.signal,
            });
            clearTimeout(timeout);
        }
        catch {
            // best-effort cancel
        }
    }
    async ping() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10_000);
            const response = await fetch(`${CURSOR_API_BASE}/v1/health`, {
                headers: { "User-Agent": "release-notes-generator/1.0" },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            return response.status < 500;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=cursor.js.map
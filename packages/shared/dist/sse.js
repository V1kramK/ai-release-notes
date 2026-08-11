"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSE_EVENT_SCHEMAS = exports.SSE_CONTRACT_VERSION = void 0;
exports.serializeSSEEvent = serializeSSEEvent;
exports.parseSSEEvent = parseSSEEvent;
const zod_1 = require("zod");
exports.SSE_CONTRACT_VERSION = "1.0.0";
const PhaseSchema = zod_1.z.object({
    phase: zod_1.z.enum([
        "collecting_commits",
        "resolving_pull_requests",
        "resolving_jira_issues",
        "summarizing",
        "assembling",
    ]),
    repo: zod_1.z.string().optional(),
    pct: zod_1.z.number().int().min(0).max(100).optional(),
});
const CountsSchema = zod_1.z.object({
    repo: zod_1.z.string(),
    commitsExamined: zod_1.z.number().int().nonnegative(),
    commitsIncluded: zod_1.z.number().int().nonnegative(),
});
const WarningSchema = zod_1.z.object({
    repo: zod_1.z.string().optional(),
    jiraKey: zod_1.z.string().optional(),
    message: zod_1.z.string(),
});
const HeartbeatSchema = zod_1.z.object({
    ts: zod_1.z.number(),
});
const SectionSchema = zod_1.z.object({
    category: zod_1.z.string(),
    repo: zod_1.z.string(),
    content: zod_1.z.string(),
});
const DoneSchema = zod_1.z.object({
    totalCommits: zod_1.z.number().int().nonnegative(),
    totalSections: zod_1.z.number().int().nonnegative(),
    durationMs: zod_1.z.number().nonnegative(),
});
const ErrorSchema = zod_1.z.object({
    code: zod_1.z.string(),
    message: zod_1.z.string(),
    retryable: zod_1.z.boolean(),
    details: zod_1.z.string().optional(),
});
exports.SSE_EVENT_SCHEMAS = {
    phase: PhaseSchema,
    counts: CountsSchema,
    warning: WarningSchema,
    heartbeat: HeartbeatSchema,
    section: SectionSchema,
    done: DoneSchema,
    error: ErrorSchema,
};
function serializeSSEEvent(event) {
    return `event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
function parseSSEEvent(raw) {
    const lines = raw.split("\n");
    let eventName;
    let dataLine;
    for (const line of lines) {
        if (line.startsWith("event: ")) {
            eventName = line.slice(7).trim();
        }
        else if (line.startsWith("data: ")) {
            dataLine = line.slice(6).trim();
        }
    }
    if (!eventName || !dataLine)
        return null;
    if (!(eventName in exports.SSE_EVENT_SCHEMAS))
        return null;
    const schema = exports.SSE_EVENT_SCHEMAS[eventName];
    const parsed = schema.safeParse(JSON.parse(dataLine));
    if (!parsed.success)
        return null;
    return { name: eventName, data: parsed.data };
}
//# sourceMappingURL=sse.js.map
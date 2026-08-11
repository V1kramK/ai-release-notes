import { z } from "zod";
import type { Category } from "./categories.js";
import type { ErrorCodeType } from "./errors.js";
export declare const SSE_CONTRACT_VERSION = "1.0.0";
declare const PhaseSchema: z.ZodObject<{
    phase: z.ZodEnum<["collecting_commits", "resolving_pull_requests", "resolving_jira_issues", "summarizing", "assembling"]>;
    repo: z.ZodOptional<z.ZodString>;
    pct: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    phase: "collecting_commits" | "resolving_pull_requests" | "resolving_jira_issues" | "summarizing" | "assembling";
    repo?: string | undefined;
    pct?: number | undefined;
}, {
    phase: "collecting_commits" | "resolving_pull_requests" | "resolving_jira_issues" | "summarizing" | "assembling";
    repo?: string | undefined;
    pct?: number | undefined;
}>;
declare const CountsSchema: z.ZodObject<{
    repo: z.ZodString;
    commitsExamined: z.ZodNumber;
    commitsIncluded: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    repo: string;
    commitsExamined: number;
    commitsIncluded: number;
}, {
    repo: string;
    commitsExamined: number;
    commitsIncluded: number;
}>;
declare const WarningSchema: z.ZodObject<{
    repo: z.ZodOptional<z.ZodString>;
    jiraKey: z.ZodOptional<z.ZodString>;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    repo?: string | undefined;
    jiraKey?: string | undefined;
}, {
    message: string;
    repo?: string | undefined;
    jiraKey?: string | undefined;
}>;
declare const HeartbeatSchema: z.ZodObject<{
    ts: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    ts: number;
}, {
    ts: number;
}>;
declare const SectionSchema: z.ZodObject<{
    category: z.ZodType<Category>;
    repo: z.ZodString;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    repo: string;
    content: string;
    category: "Breaking Changes" | "Features" | "Enhancements" | "Bug Fixes" | "Other Changes";
}, {
    repo: string;
    content: string;
    category: "Breaking Changes" | "Features" | "Enhancements" | "Bug Fixes" | "Other Changes";
}>;
declare const DoneSchema: z.ZodObject<{
    totalCommits: z.ZodNumber;
    totalSections: z.ZodNumber;
    durationMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    totalCommits: number;
    totalSections: number;
    durationMs: number;
}, {
    totalCommits: number;
    totalSections: number;
    durationMs: number;
}>;
declare const ErrorSchema: z.ZodObject<{
    code: z.ZodType<ErrorCodeType>;
    message: z.ZodString;
    retryable: z.ZodBoolean;
    details: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: ErrorCodeType;
    message: string;
    retryable: boolean;
    details?: string | undefined;
}, {
    code: ErrorCodeType;
    message: string;
    retryable: boolean;
    details?: string | undefined;
}>;
export declare const SSE_EVENT_SCHEMAS: {
    readonly phase: z.ZodObject<{
        phase: z.ZodEnum<["collecting_commits", "resolving_pull_requests", "resolving_jira_issues", "summarizing", "assembling"]>;
        repo: z.ZodOptional<z.ZodString>;
        pct: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        phase: "collecting_commits" | "resolving_pull_requests" | "resolving_jira_issues" | "summarizing" | "assembling";
        repo?: string | undefined;
        pct?: number | undefined;
    }, {
        phase: "collecting_commits" | "resolving_pull_requests" | "resolving_jira_issues" | "summarizing" | "assembling";
        repo?: string | undefined;
        pct?: number | undefined;
    }>;
    readonly counts: z.ZodObject<{
        repo: z.ZodString;
        commitsExamined: z.ZodNumber;
        commitsIncluded: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        repo: string;
        commitsExamined: number;
        commitsIncluded: number;
    }, {
        repo: string;
        commitsExamined: number;
        commitsIncluded: number;
    }>;
    readonly warning: z.ZodObject<{
        repo: z.ZodOptional<z.ZodString>;
        jiraKey: z.ZodOptional<z.ZodString>;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        message: string;
        repo?: string | undefined;
        jiraKey?: string | undefined;
    }, {
        message: string;
        repo?: string | undefined;
        jiraKey?: string | undefined;
    }>;
    readonly heartbeat: z.ZodObject<{
        ts: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        ts: number;
    }, {
        ts: number;
    }>;
    readonly section: z.ZodObject<{
        category: z.ZodType<Category>;
        repo: z.ZodString;
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        repo: string;
        content: string;
        category: "Breaking Changes" | "Features" | "Enhancements" | "Bug Fixes" | "Other Changes";
    }, {
        repo: string;
        content: string;
        category: "Breaking Changes" | "Features" | "Enhancements" | "Bug Fixes" | "Other Changes";
    }>;
    readonly done: z.ZodObject<{
        totalCommits: z.ZodNumber;
        totalSections: z.ZodNumber;
        durationMs: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        totalCommits: number;
        totalSections: number;
        durationMs: number;
    }, {
        totalCommits: number;
        totalSections: number;
        durationMs: number;
    }>;
    readonly error: z.ZodObject<{
        code: z.ZodType<ErrorCodeType>;
        message: z.ZodString;
        retryable: z.ZodBoolean;
        details: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code: ErrorCodeType;
        message: string;
        retryable: boolean;
        details?: string | undefined;
    }, {
        code: ErrorCodeType;
        message: string;
        retryable: boolean;
        details?: string | undefined;
    }>;
};
export type SSEEventName = keyof typeof SSE_EVENT_SCHEMAS;
export type PhaseEvent = z.infer<typeof PhaseSchema>;
export type CountsEvent = z.infer<typeof CountsSchema>;
export type WarningEvent = z.infer<typeof WarningSchema>;
export type HeartbeatEvent = z.infer<typeof HeartbeatSchema>;
export type SectionEvent = z.infer<typeof SectionSchema>;
export type DoneEvent = z.infer<typeof DoneSchema>;
export type ErrorEvent = z.infer<typeof ErrorSchema>;
export type ReleaseNotesEvent = {
    name: "phase";
    data: PhaseEvent;
} | {
    name: "counts";
    data: CountsEvent;
} | {
    name: "warning";
    data: WarningEvent;
} | {
    name: "heartbeat";
    data: HeartbeatEvent;
} | {
    name: "section";
    data: SectionEvent;
} | {
    name: "done";
    data: DoneEvent;
} | {
    name: "error";
    data: ErrorEvent;
};
export declare function serializeSSEEvent(event: ReleaseNotesEvent): string;
export declare function parseSSEEvent(raw: string): ReleaseNotesEvent | null;
export {};
//# sourceMappingURL=sse.d.ts.map
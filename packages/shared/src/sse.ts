import { z } from "zod";
import type { Category } from "./categories.js";
import type { ErrorCodeType } from "./errors.js";

export const SSE_CONTRACT_VERSION = "1.0.0";

const PhaseSchema = z.object({
  phase: z.enum([
    "collecting_commits",
    "resolving_pull_requests",
    "resolving_jira_issues",
    "summarizing",
    "assembling",
  ]),
  repo: z.string().optional(),
  pct: z.number().int().min(0).max(100).optional(),
});

const CountsSchema = z.object({
  repo: z.string(),
  commitsExamined: z.number().int().nonnegative(),
  commitsIncluded: z.number().int().nonnegative(),
});

const WarningSchema = z.object({
  repo: z.string().optional(),
  jiraKey: z.string().optional(),
  message: z.string(),
});

const HeartbeatSchema = z.object({
  ts: z.number(),
});

const SectionSchema = z.object({
  category: z.string() as z.ZodType<Category>,
  repo: z.string(),
  content: z.string(),
  jiraKey: z.string().optional(),
  jiraSummary: z.string().optional(),
});

const DoneSchema = z.object({
  totalCommits: z.number().int().nonnegative(),
  totalSections: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});

const ErrorSchema = z.object({
  code: z.string() as z.ZodType<ErrorCodeType>,
  message: z.string(),
  retryable: z.boolean(),
  details: z.string().optional(),
});

const CheckpointSchema = z.object({
  message: z.string(),
});

export const SSE_EVENT_SCHEMAS = {
  phase: PhaseSchema,
  counts: CountsSchema,
  warning: WarningSchema,
  heartbeat: HeartbeatSchema,
  section: SectionSchema,
  done: DoneSchema,
  error: ErrorSchema,
  checkpoint: CheckpointSchema,
} as const;

export type SSEEventName = keyof typeof SSE_EVENT_SCHEMAS;

export type PhaseEvent = z.infer<typeof PhaseSchema>;
export type CountsEvent = z.infer<typeof CountsSchema>;
export type WarningEvent = z.infer<typeof WarningSchema>;
export type HeartbeatEvent = z.infer<typeof HeartbeatSchema>;
export type SectionEvent = z.infer<typeof SectionSchema>;
export type DoneEvent = z.infer<typeof DoneSchema>;
export type ErrorEvent = z.infer<typeof ErrorSchema>;

export type CheckpointEvent = z.infer<typeof CheckpointSchema>;

export type ReleaseNotesEvent =
  | { name: "phase"; data: PhaseEvent }
  | { name: "counts"; data: CountsEvent }
  | { name: "warning"; data: WarningEvent }
  | { name: "heartbeat"; data: HeartbeatEvent }
  | { name: "section"; data: SectionEvent }
  | { name: "done"; data: DoneEvent }
  | { name: "error"; data: ErrorEvent }
  | { name: "checkpoint"; data: CheckpointEvent };

export function serializeSSEEvent(event: ReleaseNotesEvent): string {
  return `event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function parseSSEEvent(raw: string): ReleaseNotesEvent | null {
  const lines = raw.split("\n");
  let eventName: string | undefined;
  let dataLine: string | undefined;

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      eventName = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataLine = line.slice(6).trim();
    }
  }

  if (!eventName || !dataLine) return null;
  if (!(eventName in SSE_EVENT_SCHEMAS)) return null;

  const schema = SSE_EVENT_SCHEMAS[eventName as SSEEventName];
  const parsed = schema.safeParse(JSON.parse(dataLine));
  if (!parsed.success) return null;

  return { name: eventName, data: parsed.data } as ReleaseNotesEvent;
}

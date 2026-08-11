import type { SummarizerPort, SummarizerResult, SummarizerTask } from "../ports/index.js";
export declare class CursorSummarizer implements SummarizerPort {
    private readonly apiToken;
    private readonly modelId;
    constructor(apiToken: string, modelId: string);
    private headers;
    createTask(prompt: string, context: string): Promise<SummarizerTask>;
    pollTask(taskId: string): Promise<SummarizerResult>;
    cancelTask(taskId: string): Promise<void>;
    ping(): Promise<boolean>;
}

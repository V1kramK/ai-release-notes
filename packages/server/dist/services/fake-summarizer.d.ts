import type { SummarizerPort, SummarizerResult, SummarizerTask } from "../ports/index.js";
export declare class FakeSummarizer implements SummarizerPort {
    private readonly tasks;
    createTask(prompt: string, context: string): Promise<SummarizerTask>;
    pollTask(taskId: string): Promise<SummarizerResult>;
    cancelTask(taskId: string): Promise<void>;
    ping(): Promise<boolean>;
}

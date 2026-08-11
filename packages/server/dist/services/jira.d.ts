import type { JiraIssue } from "@release-notes/shared";
import type { JiraPort } from "../ports/index.js";
export declare class JiraAdapter implements JiraPort {
    private readonly baseUrl;
    private readonly auth;
    constructor(baseUrl: string, email: string, token: string);
    getIssue(key: string): Promise<JiraIssue | undefined>;
    ping(): Promise<boolean>;
}

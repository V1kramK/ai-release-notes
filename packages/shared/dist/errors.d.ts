export declare const ErrorCode: {
    readonly VALIDATION_FAILED: "VALIDATION_FAILED";
    readonly SESSION_EXPIRED: "SESSION_EXPIRED";
    readonly CREDENTIAL_REJECTED: "CREDENTIAL_REJECTED";
    readonly UPSTREAM_RATE_LIMITED: "UPSTREAM_RATE_LIMITED";
    readonly UPSTREAM_FAILED: "UPSTREAM_FAILED";
    readonly AGENT_FAILED: "AGENT_FAILED";
    readonly AGENT_TIMEOUT: "AGENT_TIMEOUT";
    readonly CONCURRENCY_LIMIT: "CONCURRENCY_LIMIT";
};
export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];
export interface ErrorEnvelope {
    code: ErrorCodeType;
    message: string;
    retryable: boolean;
    details?: string;
}
//# sourceMappingURL=errors.d.ts.map
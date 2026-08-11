export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  CREDENTIAL_REJECTED: "CREDENTIAL_REJECTED",
  UPSTREAM_RATE_LIMITED: "UPSTREAM_RATE_LIMITED",
  UPSTREAM_FAILED: "UPSTREAM_FAILED",
  AGENT_FAILED: "AGENT_FAILED",
  AGENT_TIMEOUT: "AGENT_TIMEOUT",
  CONCURRENCY_LIMIT: "CONCURRENCY_LIMIT",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorEnvelope {
  code: ErrorCodeType;
  message: string;
  retryable: boolean;
  details?: string;
}

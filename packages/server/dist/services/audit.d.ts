import type { AuditPort, AuditRecord } from "../ports/index.js";
export declare class JsonlAuditSink implements AuditPort {
    private readonly dir;
    private readonly filePath;
    constructor(auditDir: string);
    append(record: AuditRecord): Promise<void>;
    private lazyPurge;
}
export declare class InMemoryAuditSink implements AuditPort {
    readonly records: AuditRecord[];
    append(record: AuditRecord): Promise<void>;
}

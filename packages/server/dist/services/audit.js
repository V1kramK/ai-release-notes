import { appendFile, mkdir } from "fs/promises";
import { join } from "path";
const RETENTION_DAYS = 365;
export class JsonlAuditSink {
    dir;
    filePath;
    constructor(auditDir) {
        this.dir = auditDir;
        this.filePath = join(auditDir, "audit.jsonl");
    }
    async append(record) {
        await mkdir(this.dir, { recursive: true });
        await this.lazyPurge();
        const line = JSON.stringify(record) + "\n";
        await appendFile(this.filePath, line, { encoding: "utf8", flag: "a" });
    }
    async lazyPurge() {
        try {
            const { readFile, writeFile } = await import("fs/promises");
            const content = await readFile(this.filePath, "utf8").catch(() => "");
            if (!content)
                return;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
            const lines = content.split("\n").filter(Boolean);
            const retained = lines.filter((line) => {
                try {
                    const record = JSON.parse(line);
                    if (!record.ts)
                        return false;
                    return new Date(record.ts) >= cutoff;
                }
                catch {
                    return false;
                }
            });
            if (retained.length < lines.length) {
                await writeFile(this.filePath, retained.join("\n") + (retained.length > 0 ? "\n" : ""), "utf8");
            }
        }
        catch {
            // purge is best-effort
        }
    }
}
export class InMemoryAuditSink {
    records = [];
    async append(record) {
        this.records.push(record);
    }
}
//# sourceMappingURL=audit.js.map
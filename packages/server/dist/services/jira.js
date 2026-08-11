async function jiraFetch(baseUrl, path, auth, signal) {
    const url = `${baseUrl}/rest/api/3${path}`;
    const init = {
        headers: {
            Authorization: auth,
            Accept: "application/json",
        },
    };
    if (signal)
        init.signal = signal;
    return fetch(url, init);
}
export class JiraAdapter {
    baseUrl;
    auth;
    constructor(baseUrl, email, token) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        const isCloud = baseUrl.includes("atlassian.net");
        if (isCloud) {
            this.auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
        }
        else {
            this.auth = `Bearer ${token}`;
        }
    }
    async getIssue(key) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15_000);
            const response = await jiraFetch(this.baseUrl, `/issue/${encodeURIComponent(key)}?fields=summary,description,issuetype,priority,labels,comment`, this.auth, controller.signal);
            clearTimeout(timeout);
            if (!response.ok)
                return undefined;
            const data = (await response.json());
            const fields = data.fields;
            const issueType = fields["issuetype"]?.name ?? "Task";
            const priority = fields["priority"]?.name ?? "Medium";
            const labels = Array.isArray(fields["labels"]) ? fields["labels"] : [];
            const commentObj = fields["comment"];
            const comments = (commentObj?.comments ?? [])
                .map((c) => {
                const body = c.body;
                if (typeof body === "string")
                    return body;
                return "";
            })
                .filter(Boolean);
            const descriptionRaw = fields["description"];
            let description = "";
            if (typeof descriptionRaw === "string") {
                description = descriptionRaw;
            }
            else if (descriptionRaw && typeof descriptionRaw === "object") {
                const doc = descriptionRaw;
                if (doc.content) {
                    description = doc.content
                        .flatMap((block) => block.content ?? [])
                        .map((inline) => inline.text ?? "")
                        .join(" ")
                        .trim();
                }
            }
            return {
                key,
                summary: fields["summary"] ?? key,
                description,
                issueType,
                priority,
                labels,
                comments,
                url: `${this.baseUrl}/browse/${key}`,
            };
        }
        catch {
            return undefined;
        }
    }
    async ping() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10_000);
            const response = await jiraFetch(this.baseUrl, "/myself", this.auth, controller.signal);
            clearTimeout(timeout);
            return response.ok;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=jira.js.map
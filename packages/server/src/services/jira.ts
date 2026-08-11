import type { JiraIssue } from "@release-notes/shared";
import type { JiraPort } from "../ports/index.js";

interface JiraIssueResponse {
  key: string;
  fields: Record<string, unknown>;
}

interface JiraSearchResponse {
  issues: JiraIssueResponse[];
}

interface JiraUserResponse {
  accountId?: string;
  emailAddress?: string;
}

async function jiraFetch(
  baseUrl: string,
  path: string,
  auth: string,
  signal?: AbortSignal
): Promise<Response> {
  const url = `${baseUrl}/rest/api/3${path}`;
  const init: RequestInit = {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  };
  if (signal) init.signal = signal;
  return fetch(url, init);
}

export class JiraAdapter implements JiraPort {
  private readonly baseUrl: string;
  private readonly auth: string;

  constructor(baseUrl: string, email: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    const isCloud = baseUrl.includes("atlassian.net");
    if (isCloud) {
      this.auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
    } else {
      this.auth = `Bearer ${token}`;
    }
  }

  async getIssue(key: string): Promise<JiraIssue | undefined> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await jiraFetch(
        this.baseUrl,
        `/issue/${encodeURIComponent(key)}?fields=summary,description,issuetype,priority,labels,comment`,
        this.auth,
        controller.signal
      );

      clearTimeout(timeout);

      if (!response.ok) return undefined;

      const data = (await response.json()) as JiraIssueResponse;
      const fields = data.fields;

      const issueType =
        (fields["issuetype"] as { name?: string } | undefined)?.name ?? "Task";
      const priority =
        (fields["priority"] as { name?: string } | undefined)?.name ?? "Medium";
      const labels = Array.isArray(fields["labels"]) ? (fields["labels"] as string[]) : [];

      const commentObj = fields["comment"] as
        | { comments?: Array<{ body?: unknown }> }
        | undefined;
      const comments: string[] = (commentObj?.comments ?? [])
        .map((c) => {
          const body = c.body;
          if (typeof body === "string") return body;
          return "";
        })
        .filter(Boolean);

      const descriptionRaw = fields["description"];
      let description = "";
      if (typeof descriptionRaw === "string") {
        description = descriptionRaw;
      } else if (descriptionRaw && typeof descriptionRaw === "object") {
        const doc = descriptionRaw as { content?: Array<{ content?: Array<{ text?: string }> }> };
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
        summary: (fields["summary"] as string | undefined) ?? key,
        description,
        issueType,
        priority,
        labels,
        comments,
        url: `${this.baseUrl}/browse/${key}`,
      };
    } catch {
      return undefined;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await jiraFetch(this.baseUrl, "/myself", this.auth, controller.signal);
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }
}

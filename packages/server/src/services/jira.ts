import type { JiraIssue } from "@release-notes/shared";
import type { JiraPort } from "../ports/index.js";

export interface JiraProject {
  key: string;
  name: string;
  id: string;
}

interface JiraIssueResponse {
  key: string;
  fields: Record<string, unknown>;
}

async function jiraFetch(
  baseUrl: string,
  apiVersion: "2" | "3",
  path: string,
  auth: string,
  signal?: AbortSignal
): Promise<Response> {
  const url = `${baseUrl}/rest/api/${apiVersion}${path}`;
  const init: RequestInit = {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  };
  if (signal) init.signal = signal;
  return fetch(url, init);
}

/** Jira Cloud moved /search → /search/jql in 2024. Return the correct search path per version. */
function searchPath(apiVersion: "2" | "3", query: string): string {
  const base = apiVersion === "3" ? "/search/jql" : "/search";
  return `${base}?${query}`;
}

/**
 * Recursively extract plain text from Jira's Atlassian Document Format (ADF).
 * Handles paragraphs, headings, bullet/ordered lists, tables, code blocks,
 * blockquotes, panels, and any other node type by walking the full content tree.
 */
function adfToText(node: unknown, depth = 0): string {
  if (!node || typeof node !== "object") return "";
  const n = node as {
    type?: string;
    text?: string;
    content?: unknown[];
    attrs?: Record<string, unknown>;
  };

  // Leaf: plain text or hard break
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  if (n.type === "emoji") return (n.attrs?.["shortName"] as string | undefined) ?? "";

  const children = Array.isArray(n.content) ? n.content : [];

  switch (n.type) {
    case "heading": {
      const level = (n.attrs?.["level"] as number | undefined) ?? 1;
      const prefix = "#".repeat(Math.min(level, 6));
      return `${prefix} ${children.map((c) => adfToText(c, depth + 1)).join("")}\n\n`;
    }
    case "paragraph":
      return children.map((c) => adfToText(c, depth + 1)).join("") + "\n";
    case "bulletList":
    case "orderedList":
      return children.map((c) => adfToText(c, depth + 1)).join("") + "\n";
    case "listItem": {
      const indent = "  ".repeat(depth);
      const bullet = n.type === "listItem" ? "-" : "-";
      const inner = children.map((c) => adfToText(c, depth + 1)).join("").trimEnd();
      return `${indent}${bullet} ${inner}\n`;
    }
    case "codeBlock": {
      const lang = (n.attrs?.["language"] as string | undefined) ?? "";
      const code = children.map((c) => adfToText(c, depth + 1)).join("");
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
    case "blockquote":
      return children.map((c) => adfToText(c, depth + 1)).join("").split("\n").map((l) => `> ${l}`).join("\n") + "\n";
    case "table":
      return children.map((c) => adfToText(c, depth + 1)).join("") + "\n";
    case "tableRow":
      return "| " + children.map((c) => adfToText(c, depth + 1).replace(/\n/g, " ").trim()).join(" | ") + " |\n";
    case "tableCell":
    case "tableHeader":
      return children.map((c) => adfToText(c, depth + 1)).join("").trim();
    case "panel": {
      const panelType = (n.attrs?.["panelType"] as string | undefined) ?? "info";
      const inner = children.map((c) => adfToText(c, depth + 1)).join("").trim();
      return `[${panelType.toUpperCase()}] ${inner}\n\n`;
    }
    case "rule":
      return "---\n";
    case "inlineCard":
    case "blockCard":
      return (n.attrs?.["url"] as string | undefined) ?? "";
    case "mention":
      return `@${(n.attrs?.["text"] as string | undefined) ?? ""}`;
    case "media":
    case "mediaSingle":
    case "mediaGroup":
      // Skip binary attachments
      return "";
    default:
      // Unknown node — walk children so we don't lose nested text
      return children.map((c) => adfToText(c, depth + 1)).join("");
  }
}

/** Convert a Jira description field (ADF object or plain string) to plain text. */
function parseDescription(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  // ADF document root: { version: 1, type: "doc", content: [...] }
  if (typeof raw === "object") {
    return adfToText(raw).trim();
  }
  return "";
}

export class JiraAdapter implements JiraPort {
  private readonly baseUrl: string;
  private readonly auth: string;
  private readonly apiVersion: "2" | "3";

  constructor(baseUrl: string, email: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    const isCloud = baseUrl.includes("atlassian.net");
    this.apiVersion = isCloud ? "3" : "2";
    if (isCloud) {
      this.auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
    } else {
      // Server/DC: supports both Basic (user:pass) and Bearer (PAT)
      // If email is provided, use Basic; otherwise Bearer
      this.auth = email
        ? `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`
        : `Bearer ${token}`;
    }
  }

  async getIssue(key: string): Promise<JiraIssue | undefined> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await jiraFetch(
        this.baseUrl,
        this.apiVersion,
        `/issue/${encodeURIComponent(key)}?fields=summary,description,issuetype,priority,labels,comment`,
        this.auth,
        controller.signal
      );

      clearTimeout(timeout);

      if (!response.ok) {
        return undefined;
      }

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
        .map((c) => parseDescription(c.body))
        .filter(Boolean);

      const description = parseDescription(fields["description"]);

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

  async batchGetIssues(keys: string[]): Promise<Map<string, JiraIssue>> {
    const result = new Map<string, JiraIssue>();
    if (keys.length === 0) return result;

    const CHUNK = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += CHUNK) {
      chunks.push(keys.slice(i, i + CHUNK));
    }

    for (const chunk of chunks) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);

        const keyList = chunk.map((k) => `"${k}"`).join(", ");
        const jql = encodeURIComponent(`key in (${keyList}) ORDER BY key ASC`);
        // Omit `comment` — it's large, often restricted, and slows the query significantly.
        // Comments will be fetched individually for issues that need them.
        const fields = "summary,description,issuetype,priority,labels,status";

        const response = await jiraFetch(
          this.baseUrl,
          this.apiVersion,
          searchPath(this.apiVersion, `jql=${jql}&maxResults=${CHUNK}&fields=${fields}`),
          this.auth,
          controller.signal
        );
        clearTimeout(timeout);

        if (!response.ok) {
          const errText = await response.text().catch(() => "(unreadable)");
          console.error(`[batchGetIssues] Jira search ${response.status}: ${errText.slice(0, 300)}`);
          continue;
        }

        const data = (await response.json()) as {
          issues?: Array<{
            key?: string;
            fields?: Record<string, unknown>;
          }>;
        };

        for (const issue of data.issues ?? []) {
          if (!issue.key) continue;
          const fields = issue.fields ?? {};

          const issueType = (fields["issuetype"] as { name?: string } | undefined)?.name ?? "Task";
          const priority = (fields["priority"] as { name?: string } | undefined)?.name ?? "Medium";
          const labels = Array.isArray(fields["labels"]) ? (fields["labels"] as string[]) : [];
          const comments: string[] = []; // fetched separately when needed

          const description = parseDescription(fields["description"]);

          result.set(issue.key, {
            key: issue.key,
            summary: (fields["summary"] as string | undefined) ?? issue.key,
            description,
            issueType,
            priority,
            labels,
            comments,
            url: `${this.baseUrl}/browse/${issue.key}`,
          });
        }
      } catch {
        // Swallow per-chunk errors — other chunks can still succeed
      }
    }

    return result;
  }

  async searchIssues(projectKeys: string[], search: string, maxResults = 50): Promise<Array<{
    key: string; summary: string; issueType: string; priority: string; status: string;
  }>> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const projectJql = projectKeys.map((k) => `"${k}"`).join(", ");
      const safe = search.replace(/"/g, "").trim();
      // When the user types an exact issue key (e.g. OPL-35497), search by key alone —
      // the project filter is redundant (the key already encodes the project) and can
      // inadvertently exclude results if the project alias doesn't match exactly.
      const isIssueKey = /^[A-Z][A-Z0-9]*-\d+$/i.test(safe);
      const jql = encodeURIComponent(
        isIssueKey
          ? `key = "${safe.toUpperCase()}" ORDER BY updated DESC`
          : safe
            ? `project in (${projectJql}) AND summary ~ "${safe}*" ORDER BY updated DESC`
            : `project in (${projectJql}) ORDER BY updated DESC`
      );
      const fields = "summary,issuetype,priority,status";

      const response = await jiraFetch(
        this.baseUrl,
        this.apiVersion,
        searchPath(this.apiVersion, `jql=${jql}&maxResults=${maxResults}&fields=${fields}`),
        this.auth,
        controller.signal
      );
      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => "(unreadable)");
        console.error(`[searchIssues] Jira ${response.status}: ${errText.slice(0, 300)}`);
        return [];
      }

      const data = (await response.json()) as { issues?: Array<{
        key?: string;
        fields?: {
          summary?: string;
          issuetype?: { name?: string };
          priority?: { name?: string };
          status?: { name?: string };
        };
      }> };

      return (data.issues ?? []).map((issue) => ({
        key: issue.key ?? "",
        summary: issue.fields?.summary ?? "",
        issueType: issue.fields?.issuetype?.name ?? "Task",
        priority: issue.fields?.priority?.name ?? "Medium",
        status: issue.fields?.status?.name ?? "",
      })).filter((i) => i.key);
    } catch {
      return [];
    }
  }

  async listProjects(): Promise<JiraProject[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      // Fetch up to 200 projects
      const response = await jiraFetch(
        this.baseUrl,
        this.apiVersion,
        "/project?maxResults=200&orderBy=name",
        this.auth,
        controller.signal
      );
      clearTimeout(timeout);

      if (!response.ok) return [];

      const data = (await response.json()) as unknown;
      const projects = Array.isArray(data) ? data : (data as { values?: unknown[] }).values ?? [];

      return (projects as Array<{ key?: string; name?: string; id?: string }>)
        .filter((p) => p.key && p.name)
        .map((p) => ({ key: p.key!, name: p.name!, id: p.id ?? p.key! }));
    } catch {
      return [];
    }
  }

  async ping(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await jiraFetch(
        this.baseUrl,
        this.apiVersion,
        "/myself",
        this.auth,
        controller.signal
      );
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }
}

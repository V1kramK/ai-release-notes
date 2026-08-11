export const CATEGORIES = [
  "Breaking Changes",
  "Features",
  "Enhancements",
  "Bug Fixes",
  "Other Changes",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_ORDER: readonly Category[] = CATEGORIES;

export function categorizeIssue(
  issueType: string,
  priority: string
): Category {
  const normalizedPriority = priority.toLowerCase();
  if (normalizedPriority === "blocker") {
    return "Breaking Changes";
  }

  const normalizedType = issueType.toLowerCase();

  if (normalizedType === "story" || normalizedType === "new feature") {
    return "Features";
  }
  if (normalizedType === "improvement" || normalizedType === "enhancement") {
    return "Enhancements";
  }
  if (normalizedType === "bug" || normalizedType === "defect") {
    return "Bug Fixes";
  }
  return "Other Changes";
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_ORDER = exports.CATEGORIES = void 0;
exports.categorizeIssue = categorizeIssue;
exports.CATEGORIES = [
    "Breaking Changes",
    "Features",
    "Enhancements",
    "Bug Fixes",
    "Other Changes",
];
exports.CATEGORY_ORDER = exports.CATEGORIES;
function categorizeIssue(issueType, priority) {
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
//# sourceMappingURL=categories.js.map
export declare const CATEGORIES: readonly ["Breaking Changes", "Features", "Enhancements", "Bug Fixes", "Other Changes"];
export type Category = (typeof CATEGORIES)[number];
export declare const CATEGORY_ORDER: readonly Category[];
export declare function categorizeIssue(issueType: string, priority: string): Category;
//# sourceMappingURL=categories.d.ts.map
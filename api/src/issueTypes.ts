export const ISSUE_TYPES = [
  "lighting",
  "electrical",
  "plumbing",
  "exterior",
  "door",
  "grass_management",
  "other"
] as const;

export type IssueType = (typeof ISSUE_TYPES)[number];

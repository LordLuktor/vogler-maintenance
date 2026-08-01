export const ISSUE_TYPES: { value: string; label: string }[] = [
  { value: "lighting", label: "Lighting" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "exterior", label: "Exterior" },
  { value: "door", label: "Door" },
  { value: "grass_management", label: "Grass Management" },
  { value: "other", label: "Other" }
];

export function issueTypeLabel(value: string): string {
  return ISSUE_TYPES.find((t) => t.value === value)?.label || value;
}

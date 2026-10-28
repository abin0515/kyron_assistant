export function formatDraftDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatAssetType(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDuration(seconds: number): string {
  return `${seconds / 60} min`;
}

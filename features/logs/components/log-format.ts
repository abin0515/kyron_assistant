export function formatUsd(value: number | null): string {
  if (value === null) {
    return "rate not set";
  }

  return value < 0.01
    ? `$${value.toFixed(4)}`
    : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

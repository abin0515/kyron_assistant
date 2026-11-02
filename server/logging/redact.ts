// Credentials must never reach stored logs, run timelines or the browser.

const MAX_STRING_LENGTH = 2_000;
const MAX_DATA_BYTES = 16 * 1024;
const SENSITIVE_KEY = /token|secret|password|passwd|authorization|cookie|api[-_]?key|access[-_]?code|signature|credential/i;
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_*-]{6,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bpostgres(?:ql)?:\/\/[^\s"']+/gi,
  /([?&](?:token|key|signature|sig|code|X-Amz-[A-Za-z]+)=)[^&\s"']+/gi,
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) =>
      current.replace(pattern, (_match, prefix: unknown) =>
        typeof prefix === "string" ? `${prefix}[redacted]` : "[redacted]",
      ),
    text,
  );
}

// Returns a JSON-safe copy with sensitive keys removed, secrets scrubbed from
// strings, long strings cut, and the whole object capped in size.
export function scrubData(value: Record<string, unknown>): Record<string, unknown> {
  const scrubbed = scrubValue(value, 0) as Record<string, unknown>;
  const serialized = JSON.stringify(scrubbed);

  return serialized.length <= MAX_DATA_BYTES
    ? scrubbed
    : { truncated: true, preview: serialized.slice(0, MAX_DATA_BYTES - 200) };
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > 6) {
    return "[nested]";
  }

  if (typeof value === "string") {
    const redacted = redactSecrets(value);

    return redacted.length > MAX_STRING_LENGTH
      ? `${redacted.slice(0, MAX_STRING_LENGTH)}… (${redacted.length} chars)`
      : redacted;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => scrubValue(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, item]) => [key, scrubValue(item, depth + 1)]),
    );
  }

  return value;
}

const FALLBACK_PATH = "/drafts";
const PLACEHOLDER_ORIGIN = "https://placeholder.invalid";

// Where to go after sign-in: only a path on this site. The browser strips
// tabs and newlines and treats "\" like "/", so "/\t/evil.example" would
// leave the site; such paths, and ones that parse to another origin or to a
// "//" path ("/..//evil.example"), go to the drafts list instead. The text
// passed in is returned unchanged, never the parsed form.
export function safeRedirectPath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;

  if (!path || !path.startsWith("/") || path.startsWith("//") || /[\u0000-\u001F\u007F\\]/.test(path)) {
    return FALLBACK_PATH;
  }

  try {
    const url = new URL(path, PLACEHOLDER_ORIGIN);

    return url.origin === PLACEHOLDER_ORIGIN && !url.pathname.startsWith("//") ? path : FALLBACK_PATH;
  } catch {
    return FALLBACK_PATH;
  }
}

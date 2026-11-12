import "server-only";

// Uploads need the Vercel Blob store connected to the project: its webhook
// public key (the Blob library refuses every upload without it) and a way to
// reach the store (its ID with the project's OIDC token, or a read-write
// token). Connecting the store adds them; locally `vercel env pull` does.
export const BLOB_SETUP_MESSAGE =
  "File uploads aren't set up: connect the Vercel Blob store to this project (see the deploy guide in README.md). Locally, pull its settings with `npx vercel env pull .env.development.local --environment=development`.";

export function blobUploadsConfigured(): boolean {
  // The .env.example placeholders ("replace_with_…") count as unset.
  const has = (name: string) => {
    const value = process.env[name]?.trim();

    return Boolean(value) && !value?.startsWith("replace_with");
  };

  return has("BLOB_WEBHOOK_PUBLIC_KEY") && (has("BLOB_STORE_ID") || has("BLOB_READ_WRITE_TOKEN"));
}

// The Blob library's own words when it has no way to reach the store.
export function isMissingBlobCredentials(error: unknown): boolean {
  return error instanceof Error && /no blob credentials found|missing webhook public key/i.test(error.message);
}

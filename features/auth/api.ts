import { parseJsonResponse } from "@/features/drafts/shared/api-response";
import type {
  AccessCodeSignInRequest,
  AccessCodeSignInResponse,
} from "@/types/api";

export async function signInWithAccessCode(
  code: string,
): Promise<AccessCodeSignInResponse> {
  const response = await fetch("/api/auth/access-code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code } satisfies AccessCodeSignInRequest),
    cache: "no-store",
    credentials: "same-origin",
  });

  return parseJsonResponse<AccessCodeSignInResponse>(response);
}

export async function signOut(): Promise<void> {
  const response = await fetch("/api/auth/sign-out", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Sign-out failed. Try again.");
  }
}

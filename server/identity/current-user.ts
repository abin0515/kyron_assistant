import "server-only";

import { currentUser } from "@clerk/nextjs/server";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

export async function getCurrentUser(): Promise<CurrentUser> {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    throw new Error("No authenticated user was found.");
  }

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error("The authenticated user does not have an email address.");
  }

  return {
    id: clerkUser.id,
    name: clerkUser.fullName ?? clerkUser.username ?? email,
    email,
  };
}

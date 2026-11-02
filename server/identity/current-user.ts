import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import type { UserRole, WorkspaceAccount } from "@/types/api";

import { ACCESS_IDENTITIES } from "./access-codes";
import { getAuthMode, getSessionSecret } from "./auth-config";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session-token";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("No authenticated user was found.");
    this.name = "AuthenticationRequiredError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Your role does not allow this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const user =
    getAuthMode() === "access-code"
      ? await findAccessCodeUser()
      : await findClerkUser();

  if (!user) {
    throw new AuthenticationRequiredError();
  }

  return user;
}

export async function requireCurrentUserRole(
  ...roles: UserRole[]
): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!roles.includes(user.role)) {
    throw new ForbiddenError();
  }

  return user;
}

export async function getWorkspaceAccount(): Promise<WorkspaceAccount | null> {
  if (getAuthMode() === "clerk") {
    return { mode: "clerk", role: "user" };
  }

  const user = await findAccessCodeUser();

  if (!user || user.role === "user") {
    return null;
  }

  return { mode: "access-code", name: user.name, role: user.role };
}

async function findAccessCodeUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const claims = await verifySessionToken(token, getSessionSecret());
  const identity = claims ? ACCESS_IDENTITIES[claims.role] : null;

  if (!identity || identity.id !== claims?.sub) {
    return null;
  }

  return { ...identity };
}

async function findClerkUser(): Promise<CurrentUser | null> {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    return null;
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
    role: "user",
  };
}

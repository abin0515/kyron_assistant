import "server-only";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

let currentUser: CurrentUser | undefined;

export function getCurrentUser(): CurrentUser {
  if (currentUser) {
    return currentUser;
  }

  const id = process.env.TEST_USER_ID?.trim();
  const name = process.env.TEST_USER_NAME?.trim();
  const email = process.env.TEST_USER_EMAIL?.trim();

  if (!id || !name || !email) {
    throw new Error("The temporary test user is not configured.");
  }

  currentUser = { id, name, email };

  return currentUser;
}

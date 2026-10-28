import {
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/drafts(.*)",
  "/batches(.*)",
  "/sources(.*)",
  "/api/drafts(.*)",
  "/api/draft-workspaces(.*)",
  "/api/organization(.*)",
  "/api/kyron-folders(.*)",
  "/api/source-files(.*)",
  "/api/source-files/complete",
  "/api/uploads(.*)",
]);

export default clerkMiddleware(
  async (auth, request) => {
    if (isProtectedRoute(request)) {
      await auth.protect();
    }
  },
  {
    signInUrl: "/sign-in",
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

import {
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  accessCodesAllowedOn,
  getAuthMode,
  getSessionSecret,
  SHORT_ACCESS_CODES_MESSAGE,
} from "@/server/identity/auth-config";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/server/identity/session-token";

const isProtectedRoute = createRouteMatcher([
  "/drafts(.*)",
  "/batches(.*)",
  "/sources(.*)",
  "/kyron(.*)",
  "/qa(.*)",
  "/logs(.*)",
  "/api/qa(.*)",
  "/api/batches(.*)",
  "/api/production(.*)",
  "/api/logs(.*)",
  "/api/drafts(.*)",
  "/api/draft-workspaces(.*)",
  "/api/organization(.*)",
  "/api/kyron-folders(.*)",
  "/api/kyron-mcp(.*)",
  "/api/kyron-content(.*)",
  "/api/source-files(.*)",
  "/api/source-files/complete",
  "/api/uploads(.*)",
]);

// Authenticated by CRON_SECRET in the route itself, not by a user session.
const isMachineRoute = createRouteMatcher(["/api/qa/driver"]);

const clerkProxy = clerkMiddleware(
  async (auth, request) => {
    if (isProtectedRoute(request) && !isMachineRoute(request)) {
      await auth.protect();
    }
  },
  {
    signInUrl: "/sign-in",
  },
);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (getAuthMode() === "access-code") {
    return accessCodeProxy(request);
  }

  return clerkProxy(request, event);
}

async function accessCodeProxy(request: NextRequest) {
  // Short local codes only work on the developer's own machine; the deployed
  // site needs long codes. A request counts as local only when every host it
  // names is local.
  if (!requestHostnames(request).every((hostname) => accessCodesAllowedOn(hostname))) {
    return new NextResponse(SHORT_ACCESS_CODES_MESSAGE, { status: 403 });
  }

  const { pathname, search } = request.nextUrl;
  const signedIn = await hasValidSession(request);

  if (signedIn && pathname.startsWith("/sign-in")) {
    return NextResponse.redirect(new URL("/drafts", request.url));
  }

  if (signedIn || !isProtectedRoute(request) || isMachineRoute(request)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Sign in to continue.",
          retryable: false,
        },
      },
      { status: 401 },
    );
  }

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("redirect_url", `${pathname}${search}`);

  return NextResponse.redirect(signInUrl);
}

// The URL host plus the Host and forwarded-host headers: on Vercel the URL
// carries the real domain; elsewhere Next.js may report "localhost" for it.
function requestHostnames(request: NextRequest): string[] {
  const headerHosts = [request.headers.get("host"), request.headers.get("x-forwarded-host")]
    .flatMap((value) => (value ? value.split(",") : []))
    .map((value) => hostnameOf(value.trim()))
    .filter((value): value is string => Boolean(value));

  return [request.nextUrl.hostname, ...headerHosts];
}

function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return host || null;
  }
}

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return false;
  }

  return (await verifySessionToken(token, getSessionSecret())) !== null;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

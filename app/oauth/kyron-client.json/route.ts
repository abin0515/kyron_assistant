import { NextResponse } from "next/server";

import { getSelfHostedClientDocument } from "@/server/kyron-mcp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The public client file Kyron reads to identify this app during the admin's
// Kyron sign-in. It holds no secrets, only the app name and the address Kyron
// returns to, so it is served without a session.
export function GET() {
  return NextResponse.json(getSelfHostedClientDocument(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

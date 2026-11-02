import { SignIn } from "@clerk/nextjs";

import { AccessCodeSignInForm } from "@/features/auth/components/access-code-sign-in-form";
import { getAuthMode } from "@/server/identity/auth-config";

type SignInPageProps = {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { redirect_url: redirectUrl } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8 rounded-2xl border border-border/80 bg-card px-5 py-7 shadow-sm sm:px-8 sm:py-9">
        <div className="flex items-center gap-3 self-start">
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-sm font-extrabold tracking-[0.08em] text-primary-foreground shadow-xs">
            CPE
          </span>
          <div>
            <p className="font-heading text-xl font-light text-foreground">Course Studio</p>
            <p className="text-sm text-muted-foreground">Internal workspace</p>
          </div>
        </div>

        {getAuthMode() === "access-code" ? (
          <AccessCodeSignInForm redirectTo={safeRedirectPath(redirectUrl)} />
        ) : (
          <SignIn fallbackRedirectUrl="/drafts" />
        )}
      </div>
    </main>
  );
}

function safeRedirectPath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;

  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/\\")
  ) {
    return "/drafts";
  }

  return path;
}

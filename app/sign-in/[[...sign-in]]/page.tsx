import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
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

        <SignIn fallbackRedirectUrl="/drafts" />
      </div>
    </main>
  );
}

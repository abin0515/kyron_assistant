import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <div className="flex items-center gap-3 self-start">
          <span className="grid size-11 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground">
            CPE
          </span>
          <div>
            <p className="font-semibold text-foreground">Course Studio</p>
            <p className="text-sm text-muted-foreground">Internal workspace</p>
          </div>
        </div>

        <SignIn fallbackRedirectUrl="/drafts" />
      </div>
    </main>
  );
}

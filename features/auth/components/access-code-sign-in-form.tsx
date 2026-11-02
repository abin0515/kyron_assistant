"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { signInWithAccessCode } from "@/features/auth/api";

export function AccessCodeSignInForm({ redirectTo }: { redirectTo: string }) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await signInWithAccessCode(code);
      // A full navigation lets server components read the new session cookie.
      window.location.assign(redirectTo);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Sign-in failed. Try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form className="grid w-full gap-4" onSubmit={(event) => void handleSubmit(event)}>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="access-code">
          Access code
        </label>
        <Input
          aria-describedby="access-code-help"
          aria-invalid={errorMessage ? true : undefined}
          autoComplete="off"
          autoFocus
          disabled={submitting}
          id="access-code"
          onChange={(event) => setCode(event.target.value)}
          type="password"
          value={code}
        />
        <p className="text-xs text-muted-foreground" id="access-code-help">
          Local development sign-in. Ask the project admin for a code.
        </p>
      </div>

      {errorMessage ? <InlineNotice tone="error">{errorMessage}</InlineNotice> : null}

      <Button disabled={submitting || !code.trim()} size="lg" type="submit">
        {submitting ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <KeyRound aria-hidden="true" />
        )}
        Sign in
      </Button>
    </form>
  );
}

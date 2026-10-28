"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createDraftWorkspace } from "@/features/drafts/workspaces/api";

export function NewDraftWorkspace() {
  const router = useRouter();
  const requestStartedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (requestStartedRef.current) {
      return;
    }

    requestStartedRef.current = true;

    void createDraftWorkspace()
      .then((workspace) => {
        router.replace(`/drafts/${workspace.id}`);
      })
      .catch((error: unknown) => {
        requestStartedRef.current = false;
        setErrorMessage(messageFromError(error));
      });
  }, [router]);

  async function handleRetry() {
    if (requestStartedRef.current) {
      return;
    }

    requestStartedRef.current = true;
    setErrorMessage(null);

    try {
      const workspace = await createDraftWorkspace();
      router.replace(`/drafts/${workspace.id}`);
    } catch (error) {
      requestStartedRef.current = false;
      setErrorMessage(messageFromError(error));
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] place-items-center py-8 text-foreground">
      <Card className="w-full max-w-md bg-card shadow-sm">
        <CardContent className="grid justify-items-center gap-5 px-6 py-10 text-center">
          {errorMessage ? (
            <>
              <div className="grid gap-2">
                <h1 className="font-heading text-xl font-light">
                  Workspace not created
                </h1>
                <p
                  className="text-sm leading-relaxed text-muted-foreground"
                  role="alert"
                >
                  {errorMessage}
                </p>
              </div>
              <Button onClick={() => void handleRetry()} type="button">
                Try again
              </Button>
            </>
          ) : (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="size-7 animate-spin text-primary"
              />
              <div className="grid gap-2">
                <h1 className="font-heading text-xl font-light">
                  Creating workspace
                </h1>
                <p className="text-sm text-muted-foreground">
                  Preparing a saved draft that you can continue later.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The draft workspace could not be created.";
}

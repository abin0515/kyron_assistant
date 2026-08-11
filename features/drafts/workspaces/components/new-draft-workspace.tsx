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
    <div className="grid min-h-[calc(100vh-8rem)] place-items-center py-8 text-black">
      <Card className="w-full max-w-md border-[#E4E5E6] bg-white ring-1 ring-[#E4E5E6]">
        <CardContent className="grid justify-items-center gap-5 px-6 py-10 text-center">
          {errorMessage ? (
            <>
              <div className="grid gap-2">
                <h1 className="text-xl font-bold">Workspace not created</h1>
                <p className="text-sm leading-relaxed text-[#60656B]" role="alert">
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
                className="size-7 animate-spin text-[#A32638]"
              />
              <div className="grid gap-2">
                <h1 className="text-xl font-bold">Creating workspace</h1>
                <p className="text-sm text-[#60656B]">
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

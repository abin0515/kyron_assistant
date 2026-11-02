"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JsonBlock } from "@/components/ui/json-block";
import type { KyronClientMetadataSetup } from "@/types/api";

export function KyronClientSetupCard({
  configured,
  setup,
}: {
  configured: boolean;
  setup: KyronClientMetadataSetup;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Client metadata file</CardTitle>
        <CardDescription>
          Kyron identifies this app by a small public JSON file. It holds no
          secrets: only the app name and the address Kyron returns to after
          sign-in. The app itself stays on localhost.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {configured ? (
          <p>
            Client ID: <code className="break-all">{setup.clientId}</code>. The
            hosted file must match the JSON below exactly.
          </p>
        ) : (
          <SetupSteps />
        )}
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">kyron-client.json</p>
            <CopyButton text={setup.documentJson} />
          </div>
          <JsonBlock label="Client metadata JSON" value={setup.documentJson} />
        </div>
        <p className="text-muted-foreground">
          Sign-in returns to <code className="break-all">{setup.redirectUri}</code>.
          Open the app at that same address so the browser keeps its session.
        </p>
      </CardContent>
    </Card>
  );
}

function SetupSteps() {
  return (
    <ol className="grid list-decimal gap-1.5 pl-5">
      <li>
        At gist.github.com, create a <strong>secret</strong> gist with a file
        named <code>kyron-client.json</code> and paste the JSON below.
      </li>
      <li>
        Open the file&apos;s <strong>Raw</strong> view and copy its address.
        Remove the commit ID segment so it reads:
        <code className="mt-1 block break-all">
          https://gist.githubusercontent.com/USER/GIST_ID/raw/kyron-client.json
        </code>
      </li>
      <li>
        Edit the gist and replace the <code>client_id</code> value with that
        address.
      </li>
      <li>
        Add <code>KYRON_OAUTH_CLIENT_ID=&lt;that address&gt;</code> to{" "}
        <code>.env.local</code>, restart <code>npm run dev</code>, then choose{" "}
        <strong>Connect Kyron</strong>.
      </li>
    </ol>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button onClick={() => void handleCopy()} size="xs" type="button" variant="outline">
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

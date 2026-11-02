"use client";

import { LoaderCircle, Plug, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { disconnectKyronConnection } from "@/features/kyron-mcp/api";
import type { KyronMcpConnectionStatus } from "@/types/api";

const START_SIGN_IN_PATH = "/api/kyron-mcp/oauth/start";

export function KyronConnectionCard({
  connection,
  onChanged,
  onRetry,
}: {
  connection: KyronMcpConnectionStatus;
  onChanged: (connection: KyronMcpConnectionStatus) => void;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Kyron MCP
          <ConnectionBadge status={connection.status} />
        </CardTitle>
        <CardDescription>{describeConnection(connection)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {connection.status === "connected" ? (
          <ConnectionDetails connection={connection} />
        ) : null}
        <ConnectionActions
          connection={connection}
          onChanged={onChanged}
          onRetry={onRetry}
        />
      </CardContent>
    </Card>
  );
}

function ConnectionActions({
  connection,
  onChanged,
  onRetry,
}: {
  connection: KyronMcpConnectionStatus;
  onChanged: (connection: KyronMcpConnectionStatus) => void;
  onRetry: () => void;
}) {
  if (connection.status === "not_configured") {
    return (
      <div>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />
          Check again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <a
        className={buttonVariants({
          size: "sm",
          variant: connection.status === "connected" ? "outline" : "default",
        })}
        href={START_SIGN_IN_PATH}
      >
        <Plug aria-hidden="true" />
        {connection.status === "connected" ? "Reconnect" : "Connect Kyron"}
      </a>
      {connection.status === "connected" ? (
        <DisconnectButton onDisconnected={onChanged} />
      ) : null}
    </div>
  );
}

function DisconnectButton({
  onDisconnected,
}: {
  onDisconnected: (connection: KyronMcpConnectionStatus) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDisconnect() {
    setWorking(true);
    setErrorMessage(null);

    try {
      onDisconnected((await disconnectKyronConnection()).connection);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Kyron could not be disconnected.",
      );
      setWorking(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        onClick={() => setConfirming(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Unplug aria-hidden="true" />
        Disconnect
      </Button>
    );
  }

  return (
    <div className="grid gap-1.5">
      <div
        aria-label="Confirm Kyron disconnect"
        className="flex flex-wrap gap-1.5"
        role="group"
      >
        <Button
          disabled={working}
          onClick={() => {
            setConfirming(false);
            setErrorMessage(null);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          disabled={working}
          onClick={() => void handleDisconnect()}
          size="sm"
          type="button"
          variant="destructive"
        >
          {working ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Unplug aria-hidden="true" />
          )}
          Confirm disconnect
        </Button>
      </div>
      <p
        className={
          errorMessage ? "text-xs text-destructive" : "text-xs text-muted-foreground"
        }
        role={errorMessage ? "alert" : undefined}
      >
        {errorMessage ??
          "This revokes the sign-in at Kyron and deletes the saved tokens on this computer."}
      </p>
    </div>
  );
}

function ConnectionDetails({
  connection,
}: {
  connection: Extract<KyronMcpConnectionStatus, { status: "connected" }>;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
      <dt className="text-muted-foreground">Connected by</dt>
      <dd>{connection.connectedBy}</dd>
      <dt className="text-muted-foreground">Connected at</dt>
      <dd>{formatDateTime(connection.connectedAt)}</dd>
      <dt className="text-muted-foreground">Permissions</dt>
      <dd>{connection.scope}</dd>
      <dt className="text-muted-foreground">Access token expires</dt>
      <dd>
        {connection.accessTokenExpiresAt
          ? formatDateTime(connection.accessTokenExpiresAt)
          : "Not reported by Kyron"}
        {connection.canRefresh ? " · renews automatically" : " · no refresh token"}
      </dd>
    </dl>
  );
}

function ConnectionBadge({
  status,
}: {
  status: KyronMcpConnectionStatus["status"];
}) {
  if (status === "connected") {
    return <Badge variant="success">Connected</Badge>;
  }

  if (status === "disconnected") {
    return <Badge variant="neutral">Not connected</Badge>;
  }

  return <Badge variant="warning">Setup needed</Badge>;
}

function describeConnection(connection: KyronMcpConnectionStatus): string {
  if (connection.status === "connected") {
    return "The app can call Kyron's MCP tools with this sign-in.";
  }

  if (connection.status === "disconnected") {
    return "Sign in with the Kyron account the QA agent should use.";
  }

  return "Host the client metadata file and set KYRON_OAUTH_CLIENT_ID before connecting.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

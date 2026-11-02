"use client";

import { useCallback, useEffect, useState } from "react";

import { getKyronConnection } from "@/features/kyron-mcp/api";
import type { KyronMcpConnectionStatus } from "@/types/api";

export type KyronConnectionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; connection: KyronMcpConnectionStatus };

export function useKyronConnection() {
  const [state, setState] = useState<KyronConnectionState>({
    status: "loading",
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadConnection() {
      try {
        const { connection } = await getKyronConnection(controller.signal);

        if (!controller.signal.aborted) {
          setState({ status: "ready", connection });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "The Kyron connection could not be loaded.",
          });
        }
      }
    }

    void loadConnection();

    return () => controller.abort();
  }, [reloadKey]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setReloadKey((key) => key + 1);
  }, []);

  const replaceConnection = useCallback(
    (connection: KyronMcpConnectionStatus) =>
      setState({ status: "ready", connection }),
    [],
  );

  return { state, reload, replaceConnection };
}

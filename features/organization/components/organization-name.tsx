"use client";

import { useEffect, useState } from "react";

import type { ApiErrorResponse, OrganizationResponse } from "@/types/api";

type OrganizationState =
  | { status: "loading" }
  | { status: "success"; name: string }
  | { status: "error"; message: string };

type OrganizationNameProps = {
  fallbackName: string;
};

export function OrganizationName({ fallbackName }: OrganizationNameProps) {
  const [state, setState] = useState<OrganizationState>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrganization() {
      try {
        const response = await fetch("/api/organization", {
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
          signal: controller.signal,
        });
        const responseBody = (await response.json()) as
          | OrganizationResponse
          | ApiErrorResponse;

        if (!response.ok) {
          throw new Error(
            "error" in responseBody
              ? responseBody.error.message
              : "The Kyron organization could not be loaded.",
          );
        }

        const organization = responseBody as OrganizationResponse;
        setState({
          status: "success",
          name: organization.organization.name,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The Kyron organization could not be loaded.",
        });
      }
    }

    void loadOrganization();
    return () => controller.abort();
  }, []);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{state.status === "success" ? state.name : fallbackName}</span>
      {state.status === "loading" ? (
        <span
          className="text-muted-foreground text-[0.6rem] font-bold tracking-normal normal-case"
          role="status"
        >
          Connecting…
        </span>
      ) : null}
      {state.status === "error" ? (
        <span
          className="text-[0.6rem] font-bold tracking-normal text-amber-700 normal-case"
          role="status"
          title={state.message}
        >
          API unavailable
        </span>
      ) : null}
    </span>
  );
}

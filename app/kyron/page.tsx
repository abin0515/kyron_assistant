import type { Metadata } from "next";

import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { KyronConnectionPage } from "@/features/kyron-mcp/components/kyron-connection-page";
import { getCurrentUser } from "@/server/identity/current-user";
import { getKyronClientMetadataSetup } from "@/server/kyron-mcp/service";

export const metadata: Metadata = {
  title: "Kyron connection — CPE Course Studio",
};

const MAX_MESSAGE_LENGTH = 500;

type KyronPageProps = {
  searchParams: Promise<{ connected?: string; error?: string }>;
};

export default async function KyronPage({ searchParams }: KyronPageProps) {
  const user = await getCurrentUser();

  if (user.role !== "admin") {
    return (
      <div className="grid gap-6">
        <PageHeader title="Kyron connection" />
        <InlineNotice tone="warning">
          Only the admin can manage the Kyron connection.
        </InlineNotice>
      </div>
    );
  }

  const { connected, error } = await searchParams;

  return (
    <KyronConnectionPage
      outcome={
        error
          ? { tone: "error", message: error.slice(0, MAX_MESSAGE_LENGTH) }
          : connected
            ? { tone: "success", message: "Kyron is connected." }
            : null
      }
      setup={getKyronClientMetadataSetup()}
    />
  );
}

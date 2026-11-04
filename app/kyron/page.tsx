import type { Metadata } from "next";

import { KyronConnectionPage } from "@/features/kyron-mcp/components/kyron-connection-page";
import { getKyronClientMetadataSetup } from "@/server/kyron-mcp/service";

export const metadata: Metadata = {
  title: "Kyron connection — CPE Course Studio",
};

const MAX_MESSAGE_LENGTH = 500;

type KyronPageProps = {
  searchParams: Promise<{ connected?: string; error?: string }>;
};

// The layout limits this page to the admin.
export default async function KyronPage({ searchParams }: KyronPageProps) {
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

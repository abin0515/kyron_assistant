import type { Metadata } from "next";

import { TemplateReviewPage } from "@/features/template-review/components/template-review-page";

export const metadata: Metadata = {
  title: "Review template",
};

type ReviewPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ReviewTemplatePage({ params }: ReviewPageProps) {
  const { id } = await params;

  return <TemplateReviewPage workspaceId={id} />;
}

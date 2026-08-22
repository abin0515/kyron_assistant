import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  CircleCheck,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Layers3,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  Settings,
  Sparkles,
  TriangleAlert,
  Upload,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SourceLibraryConcept } from "@/features/source-library/components/source-library-concept";

/**
 * Static UI reference used to align layouts before implementing real features.
 * It uses fake data only and must not call application APIs or persist changes.
 */
export const metadata: Metadata = {
  title: "CPE Course Studio — Design preview",
};

type PreviewView = "overview" | "drafts" | "new-draft" | "source-library";

type DesignPreviewPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function DesignPreviewPage({
  searchParams,
}: DesignPreviewPageProps) {
  const { view } = await searchParams;
  const activeView: PreviewView =
    view === "drafts" ||
    view === "new-draft" ||
    view === "source-library"
      ? view
      : "overview";

  return (
    <main className="bg-background text-foreground min-h-screen [--background:#F7F7F7] [--border:#E4E5E6] [--card:#FFFFFF] [--card-foreground:#000000] [--destructive:#A32638] [--foreground:#000000] [--input:#E4E5E6] [--muted:#E4E5E6] [--muted-foreground:#7F7F7F] [--primary:#A32638] [--primary-foreground:#FFFFFF] [--ring:#A32638] [--secondary:#FFFFFF] [--secondary-foreground:#363D45]">
      <div className="flex min-h-screen">
        <Sidebar activeView={activeView} />

        <div className="min-w-0 flex-1">
          <TopBar activeView={activeView} />

          <div className="mx-auto grid min-w-0 max-w-[1440px] gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {activeView === "drafts" ? (
              <DraftsView />
            ) : activeView === "new-draft" ? (
              <NewDraftView />
            ) : activeView === "source-library" ? (
              <SourceLibraryConcept />
            ) : (
              <OverviewView />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function OverviewView() {
  return (
    <>
      <PageHeader />
      <Stats />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <ContinueEditing />
        <GenerationQueue />
      </div>

      <RecentDrafts />
    </>
  );
}

function Sidebar({ activeView }: { activeView: PreviewView }) {
  return (
    <aside className="border-border bg-card sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r lg:flex">
      <div className="border-border flex h-16 items-center gap-3 border-b px-5">
        <span
          aria-hidden="true"
          className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg text-xs font-extrabold tracking-[0.08em]"
        >
          CPE
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">Course Studio</p>
          <p className="text-muted-foreground truncate text-xs">
            Internal workspace
          </p>
        </div>
      </div>

      <div className="p-4">
        <NewDraftLink className="w-full justify-start" />
      </div>

      <nav aria-label="Primary navigation" className="grid gap-1 px-3">
        <SidebarLink
          active={activeView === "overview"}
          href="/design-preview"
          icon={<LayoutDashboard aria-hidden="true" />}
          label="Overview"
        />
        <SidebarLink
          active={activeView === "drafts" || activeView === "new-draft"}
          href="/design-preview?view=drafts"
          icon={<FileText aria-hidden="true" />}
          label="Drafts"
        />
        <SidebarLink
          active={activeView === "source-library"}
          href="/design-preview?view=source-library"
          icon={<FolderOpen aria-hidden="true" />}
          label="Source Library"
        />
        <div
          aria-disabled="true"
          className="text-muted-foreground flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm"
        >
          <Layers3 aria-hidden="true" className="size-4" />
          <span>Batch creation</span>
          <span className="border-border ml-auto rounded-full border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase">
            Soon
          </span>
        </div>
      </nav>

      <div className="mt-auto grid gap-3 p-3">
        <SidebarLink
          href="#"
          icon={<Settings aria-hidden="true" />}
          label="Settings"
        />

        <div className="border-border flex items-center gap-3 border-t px-2 pt-4 pb-1">
          <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-full">
            <UserRound aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Bin X.</p>
            <p className="text-muted-foreground truncate text-xs">
              Stevens CPE
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ activeView }: { activeView: PreviewView }) {
  return (
    <header className="border-border bg-card sticky top-0 z-20 flex h-16 items-center justify-between border-b px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <MobileNavigation activeView={activeView} />
        <div className="lg:hidden">
          <p className="text-sm font-bold">Course Studio</p>
          <p className="text-muted-foreground text-xs">Stevens CPE</p>
        </div>
        <div className="text-muted-foreground hidden items-center gap-2 text-sm lg:flex">
          <span>Stevens CPE</span>
          <ChevronRight aria-hidden="true" className="size-4" />
          <span className="text-foreground font-medium">
            {VIEW_LABELS[activeView]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge
          className="border-border text-muted-foreground hidden h-7 bg-white px-2.5 sm:inline-flex"
          variant="outline"
        >
          Design preview · Fake data
        </Badge>
        <Button aria-label="Notifications" size="icon" type="button" variant="ghost">
          <Bell aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}

function MobileNavigation({ activeView }: { activeView: PreviewView }) {
  return (
    <details className="group relative lg:hidden">
      <summary className="border-border grid size-9 cursor-pointer list-none place-items-center rounded-lg border bg-white [&::-webkit-details-marker]:hidden">
        <Menu aria-hidden="true" className="size-4" />
        <span className="sr-only">Open navigation</span>
      </summary>
      <nav
        aria-label="Mobile navigation"
        className="border-border bg-card absolute top-11 left-0 z-30 grid w-64 gap-1 rounded-xl border p-2 shadow-lg"
      >
        <SidebarLink
          active={activeView === "overview"}
          href="/design-preview"
          icon={<LayoutDashboard aria-hidden="true" />}
          label="Overview"
        />
        <SidebarLink
          active={activeView === "drafts" || activeView === "new-draft"}
          href="/design-preview?view=drafts"
          icon={<FileText aria-hidden="true" />}
          label="Drafts"
        />
        <SidebarLink
          active={activeView === "source-library"}
          href="/design-preview?view=source-library"
          icon={<FolderOpen aria-hidden="true" />}
          label="Source Library"
        />
        <SidebarLink
          href="#"
          icon={<Settings aria-hidden="true" />}
          label="Settings"
        />
      </nav>
    </details>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="grid gap-1.5">
        <h1 className="text-[1.8rem] leading-tight font-bold tracking-[-0.025em]">
          Overview
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Continue active work, monitor generation, and review recent course
          drafts.
        </p>
      </div>
      <NewDraftLink />
    </div>
  );
}

function Stats() {
  return (
    <section aria-label="Draft summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {SUMMARY_ITEMS.map((item) => (
        <Card className="border-border gap-3 rounded-xl py-4 ring-1 ring-border" key={item.label}>
          <CardContent className="flex items-start justify-between px-4">
            <div className="grid gap-2">
              <p className="text-muted-foreground text-xs font-semibold">
                {item.label}
              </p>
              <p className="text-2xl font-bold tracking-[-0.03em]">
                {item.value}
              </p>
            </div>
            <span className={item.iconClassName}>{item.icon}</span>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function ContinueEditing() {
  return (
    <Card
      className="border-border gap-0 rounded-xl py-0 ring-1 ring-border"
      id="continue-editing"
    >
      <CardHeader className="border-border flex flex-row items-center justify-between border-b px-5 py-4">
        <div className="grid gap-1">
          <CardTitle className="text-base font-bold">Continue editing</CardTitle>
          <p className="text-muted-foreground text-xs">
            Recently updated working drafts
          </p>
        </div>
        <Button size="sm" type="button" variant="ghost">
          View all
          <ChevronRight aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="divide-border divide-y px-5">
        {EDITING_DRAFTS.map((draft) => (
          <article
            className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center"
            key={draft.name}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">{draft.name}</h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {draft.type} · Updated {draft.updated}
                </p>
              </div>
            </div>
            <Button className="shrink-0" size="sm" type="button" variant="outline">
              Continue
              <ChevronRight aria-hidden="true" />
            </Button>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}

function GenerationQueue() {
  return (
    <Card className="border-border gap-0 rounded-xl py-0 ring-1 ring-border">
      <CardHeader className="border-border border-b px-5 py-4">
        <CardTitle className="text-base font-bold">Generation activity</CardTitle>
        <p className="text-muted-foreground text-xs">2 drafts currently active</p>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 px-5 py-5">
        {ACTIVE_DRAFTS.map((draft) => (
          <article className="grid min-w-0 gap-3" key={draft.name}>
            <div className="grid min-w-0 gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{draft.name}</h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  Started {draft.started}
                </p>
              </div>
              <StatusBadge status="generating" />
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div className="h-full w-2/3 rounded-full bg-[#363D45]" />
            </div>
          </article>
        ))}
        <Button className="mt-1 w-full" type="button" variant="outline">
          View generation queue
        </Button>
      </CardContent>
    </Card>
  );
}

function NewDraftView() {
  return (
    <>
      <div className="grid gap-5">
        <Link
          className={buttonVariants({
            className: "w-fit",
            size: "sm",
            variant: "outline",
          })}
          href="/design-preview?view=drafts"
        >
          <ArrowLeft aria-hidden="true" />
          Back to drafts
        </Link>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[1.8rem] leading-tight font-bold tracking-[-0.025em]">
                Cybersecurity awareness for new staff
              </h1>
              <StatusBadge status="editing" />
            </div>
            <p className="text-muted-foreground text-sm">
              Working draft · Autosaved just now
            </p>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 gap-6">
          <Card className="border-border gap-0 rounded-xl py-0 ring-1 ring-border">
            <CardHeader className="border-border border-b px-5 py-4">
              <CardTitle className="text-base font-bold">
                1. Add source information
              </CardTitle>
              <p className="text-muted-foreground text-xs">
                Describe the course or paste source material for the AI assistant.
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 px-5 py-5">
              <PreviewField
                helper="Include the topic, intended audience, desired outcome, and any time constraints."
                label="Brief or transcript"
              >
                <Textarea
                  className="min-h-40 rounded-lg bg-white"
                  defaultValue="Create a short cybersecurity awareness lesson for new university staff. Explain how to recognize phishing emails, verify suspicious links, and report possible attacks. The lesson should take approximately 15 minutes."
                />
              </PreviewField>

              <div className="border-border bg-background grid gap-3 rounded-xl border border-dashed p-4">
                <div className="flex items-start gap-3">
                  <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                    <Upload aria-hidden="true" className="size-4" />
                  </span>
                  <div className="grid gap-1">
                    <p className="text-sm font-semibold">Optional source file</p>
                    <p className="text-muted-foreground text-xs">
                      PDF and PPTX upload will be added after the upload flow is finalized.
                    </p>
                  </div>
                </div>
                <Button className="w-fit" disabled type="button" variant="outline">
                  Upload coming later
                </Button>
              </div>

              <Button
                className="hover:bg-primary w-fit min-h-10 px-4 font-semibold"
                type="button"
              >
                <Sparkles aria-hidden="true" />
                Regenerate course setup
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border gap-0 rounded-xl py-0 ring-1 ring-border">
            <CardHeader className="border-border flex flex-row items-start justify-between gap-4 border-b px-5 py-4">
              <div className="grid gap-1">
                <CardTitle className="text-base font-bold">
                  2. Review course setup
                </CardTitle>
                <p className="text-muted-foreground text-xs">
                  Review and edit every generated field before creating the course draft.
                </p>
              </div>
              <Badge className="border-border bg-white text-foreground" variant="outline">
                <Sparkles aria-hidden="true" />
                AI generated
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-2">
              <PreviewField className="sm:col-span-2" label="Title">
                <Input
                  className="h-10 rounded-lg bg-white"
                  defaultValue="Cybersecurity awareness for new staff"
                />
              </PreviewField>
              <PreviewField className="sm:col-span-2" label="Description">
                <Textarea
                  className="min-h-28 rounded-lg bg-white"
                  defaultValue="A practical introduction to identifying phishing attempts, evaluating suspicious messages, and reporting potential cybersecurity incidents."
                />
              </PreviewField>
              <PreviewField className="sm:col-span-2" label="Learning objective">
                <Textarea
                  className="min-h-28 rounded-lg bg-white"
                  defaultValue="By the end of this lesson, learners will be able to identify common phishing indicators, verify suspicious links safely, and follow the university reporting process."
                />
              </PreviewField>
              <PreviewField className="sm:col-span-2" label="Audience">
                <Input
                  className="h-10 rounded-lg bg-white"
                  defaultValue="New university staff with limited cybersecurity training"
                />
              </PreviewField>
              <PreviewField label="Asset type">
                <select className="border-border h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option>Lesson</option>
                  <option>Practice</option>
                  <option>Scenario</option>
                </select>
              </PreviewField>
              <PreviewField label="Duration">
                <select className="border-border h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option>15 minutes</option>
                  <option>10 minutes</option>
                  <option>20 minutes</option>
                </select>
              </PreviewField>
            </CardContent>
          </Card>
        </div>

        <DraftReadiness />
      </div>
    </>
  );
}

function PreviewField({
  children,
  className,
  helper,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  helper?: string;
  label: string;
}) {
  return (
    <label className={`grid gap-1.5 ${className ?? ""}`}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {helper ? (
        <span className="text-muted-foreground text-xs">{helper}</span>
      ) : null}
    </label>
  );
}

function DraftReadiness() {
  return (
    <Card className="border-border gap-0 rounded-xl py-0 ring-1 ring-border xl:sticky xl:top-24">
      <CardHeader className="border-border border-b px-5 py-4">
        <CardTitle className="text-base font-bold">Draft readiness</CardTitle>
        <p className="text-muted-foreground text-xs">
          Check the setup before starting course generation.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 px-5 py-5">
        <div className="grid gap-3">
          <ReadinessItem label="Source information added" />
          <ReadinessItem label="Course setup generated" />
          <ReadinessItem label="Required fields complete" />
        </div>

        <div className="border-border grid gap-3 border-t pt-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">Status</span>
            <StatusBadge status="editing" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">Last saved</span>
            <span className="text-xs font-medium">Just now</span>
          </div>
        </div>

        <Button
          className="hover:bg-primary min-h-10 w-full font-semibold"
          type="button"
        >
          Create course draft
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          This design preview does not submit any data.
        </p>
      </CardContent>
    </Card>
  );
}

function ReadinessItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

function DraftsView() {
  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="grid gap-1.5">
          <h1 className="text-[1.8rem] leading-tight font-bold tracking-[-0.025em]">
            Drafts
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Find, review, and continue every course draft in one workspace.
          </p>
        </div>
        <NewDraftLink />
      </div>

      <nav aria-label="Draft status filters" className="flex gap-2 overflow-x-auto pb-1">
        {DRAFT_FILTERS.map((filter) => (
          <button
            className={
              filter.active
                ? "bg-foreground text-primary-foreground flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold"
                : "border-border bg-card text-secondary-foreground flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
            }
            key={filter.label}
            type="button"
          >
            {filter.label}
            <span
              className={
                filter.active
                  ? "text-primary-foreground/70 text-xs"
                  : "text-muted-foreground text-xs"
              }
            >
              {filter.count}
            </span>
          </button>
        ))}
      </nav>

      <section aria-label="Draft filters" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_180px_180px_180px]">
        <FilterField label="Search">
          <Search aria-hidden="true" className="text-muted-foreground size-4" />
          <input
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder="Search by draft title"
            type="search"
          />
        </FilterField>
        <SelectFilter label="Asset type" options={["All types", "Lesson", "Practice", "Scenario"]} />
        <SelectFilter label="Owner" options={["All owners", "Bin X.", "Mahathi S."]} />
        <SelectFilter label="Updated" options={["Any time", "Today", "This week", "This month"]} />
      </section>

      <AllDrafts />
    </>
  );
}

function FilterField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold">{label}</span>
      <span className="border-border bg-card flex h-10 items-center gap-2 rounded-lg border px-3">
        {children}
      </span>
    </label>
  );
}

function SelectFilter({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold">{label}</span>
      <select className="border-border bg-card h-10 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function AllDrafts() {
  return (
    <Card className="border-border min-w-0 gap-0 rounded-xl py-0 ring-1 ring-border">
      <CardHeader className="border-border flex flex-row items-center justify-between border-b px-5 py-4">
        <div className="grid gap-1">
          <CardTitle className="text-base font-bold">All drafts</CardTitle>
          <p className="text-muted-foreground text-xs">Showing 8 of 25 drafts</p>
        </div>
        <Button size="sm" type="button" variant="outline">
          Updated recently
        </Button>
      </CardHeader>

      <div className="divide-border divide-y md:hidden">
        {ALL_DRAFTS.map((draft) => (
          <article className="grid gap-3 px-5 py-4" key={draft.name}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{draft.name}</h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  {draft.type} · {draft.owner}
                </p>
              </div>
              <Button
                aria-label={`Open actions for ${draft.name}`}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={draft.status} />
              <span className="text-muted-foreground text-xs">{draft.updated}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-border border-b">
              <th className="w-12 px-5 py-3">
                <input aria-label="Select all drafts" className="accent-primary" type="checkbox" />
              </th>
              <th className="px-2 py-3 font-semibold">Draft</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="w-12 px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {ALL_DRAFTS.map((draft) => (
              <tr className="hover:bg-muted/30 h-14" key={draft.name}>
                <td className="px-5 py-3">
                  <input
                    aria-label={`Select ${draft.name}`}
                    className="accent-primary"
                    type="checkbox"
                  />
                </td>
                <td className="max-w-[340px] px-2 py-3 font-medium">
                  <span className="block truncate">{draft.name}</span>
                </td>
                <td className="text-secondary-foreground px-4 py-3">{draft.type}</td>
                <td className="text-secondary-foreground px-4 py-3">{draft.owner}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={draft.status} />
                </td>
                <td className="text-muted-foreground px-4 py-3 text-xs">
                  {draft.updated}
                </td>
                <td className="px-4 py-3">
                  <Button
                    aria-label={`Open actions for ${draft.name}`}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RecentDrafts() {
  return (
    <Card
      className="border-border min-w-0 gap-0 rounded-xl py-0 ring-1 ring-border"
      id="recent-drafts"
    >
      <CardHeader className="border-border flex flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1">
          <CardTitle className="text-base font-bold">Recent drafts</CardTitle>
          <p className="text-muted-foreground text-xs">
            Fake records for layout review
          </p>
        </div>
        <label className="border-border flex h-9 w-full items-center gap-2 rounded-lg border bg-white px-3 sm:w-64">
          <Search aria-hidden="true" className="text-muted-foreground size-4" />
          <span className="sr-only">Search drafts</span>
          <input
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder="Search drafts"
            type="search"
          />
        </label>
      </CardHeader>

      <div className="divide-border divide-y sm:hidden">
        {RECENT_DRAFTS.map((draft) => (
          <article className="grid gap-3 px-5 py-4" key={draft.name}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">
                  {draft.name}
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {draft.type} · {draft.owner}
                </p>
              </div>
              <Button
                aria-label={`Open actions for ${draft.name}`}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={draft.status} />
              <span className="text-muted-foreground text-xs">
                {draft.updated}
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-border border-b">
              <th className="px-5 py-3 font-semibold">Draft</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="w-12 px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {RECENT_DRAFTS.map((draft) => (
              <tr className="hover:bg-muted/30 h-14" key={draft.name}>
                <td className="max-w-[300px] px-5 py-3 font-medium">
                  <span className="block truncate">{draft.name}</span>
                </td>
                <td className="text-secondary-foreground px-4 py-3">
                  {draft.type}
                </td>
                <td className="text-secondary-foreground px-4 py-3">
                  {draft.owner}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={draft.status} />
                </td>
                <td className="text-muted-foreground px-4 py-3 text-xs">
                  {draft.updated}
                </td>
                <td className="px-4 py-3">
                  <Button aria-label={`Open actions for ${draft.name}`} size="icon-sm" type="button" variant="ghost">
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NewDraftLink({ className }: { className?: string }) {
  return (
    <Link
      className={buttonVariants({
        className: `hover:bg-primary min-h-10 rounded-lg px-4 font-semibold hover:shadow-sm ${className ?? ""}`,
        size: "lg",
      })}
      href="/design-preview?view=new-draft"
    >
      <Plus aria-hidden="true" />
      New draft
    </Link>
  );
}

type SidebarLinkProps = {
  active?: boolean;
  href: string;
  icon: React.ReactNode;
  label: string;
};

function SidebarLink({ active, href, icon, label }: SidebarLinkProps) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "bg-foreground text-primary-foreground relative flex min-h-10 items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-semibold"
          : "text-secondary-foreground hover:bg-muted/55 flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium"
      }
      href={href}
    >
      {active ? (
        <span aria-hidden="true" className="bg-primary absolute inset-y-0 left-0 w-1" />
      ) : null}
      <span className="[&>svg]:size-4">{icon}</span>
      {label}
    </Link>
  );
}

type DraftStatus = "editing" | "generating" | "complete" | "attention";

type DraftRecord = {
  name: string;
  owner: string;
  status: DraftStatus;
  type: string;
  updated: string;
};

const VIEW_LABELS: Record<PreviewView, string> = {
  overview: "Overview",
  drafts: "Drafts",
  "new-draft": "New draft",
  "source-library": "Source Library",
};

function StatusBadge({ status }: { status: DraftStatus }) {
  const details = STATUS_DETAILS[status];

  return (
    <Badge className={`${details.className} shrink-0`} variant="outline">
      {details.icon}
      {details.label}
    </Badge>
  );
}

const SUMMARY_ITEMS = [
  {
    label: "Editing",
    value: 4,
    icon: <PencilLine aria-hidden="true" className="size-4" />,
    iconClassName: "bg-muted grid size-8 place-items-center rounded-lg",
  },
  {
    label: "Generating",
    value: 2,
    icon: <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />,
    iconClassName:
      "grid size-8 place-items-center rounded-lg bg-[#363D45] text-white",
  },
  {
    label: "Complete",
    value: 18,
    icon: <CircleCheck aria-hidden="true" className="size-4" />,
    iconClassName:
      "border-foreground grid size-8 place-items-center rounded-lg border bg-white",
  },
  {
    label: "Needs attention",
    value: 1,
    icon: <TriangleAlert aria-hidden="true" className="size-4" />,
    iconClassName:
      "border-primary text-primary grid size-8 place-items-center rounded-lg border bg-white",
  },
] as const;

const DRAFT_FILTERS = [
  { label: "All", count: 25, active: true },
  { label: "Editing", count: 4, active: false },
  { label: "Generating", count: 2, active: false },
  { label: "Complete", count: 18, active: false },
  { label: "Needs attention", count: 1, active: false },
] as const;

const EDITING_DRAFTS = [
  {
    name: "Cybersecurity awareness for new staff",
    type: "Lesson",
    updated: "12 minutes ago",
  },
  {
    name: "Handling difficult student conversations",
    type: "Scenario",
    updated: "yesterday",
  },
] as const;

const ACTIVE_DRAFTS = [
  {
    name: "Data visualization fundamentals",
    started: "8 minutes ago",
  },
  {
    name: "Project management essentials",
    started: "14 minutes ago",
  },
] as const;

const ALL_DRAFTS: DraftRecord[] = [
  {
    name: "Cybersecurity awareness for new staff",
    type: "Lesson",
    owner: "Bin X.",
    status: "editing",
    updated: "12 min ago",
  },
  {
    name: "Data visualization fundamentals",
    type: "Practice",
    owner: "Mahathi S.",
    status: "generating",
    updated: "8 min ago",
  },
  {
    name: "Responsible use of generative AI",
    type: "Lesson",
    owner: "Bin X.",
    status: "complete",
    updated: "Yesterday",
  },
  {
    name: "Faculty project review workshop",
    type: "Scenario",
    owner: "Mahathi S.",
    status: "attention",
    updated: "2 days ago",
  },
  {
    name: "Handling difficult student conversations",
    type: "Scenario",
    owner: "Bin X.",
    status: "editing",
    updated: "3 days ago",
  },
  {
    name: "Project management essentials",
    type: "Lesson",
    owner: "Mahathi S.",
    status: "generating",
    updated: "4 days ago",
  },
  {
    name: "Accessibility in online courses",
    type: "Practice",
    owner: "Bin X.",
    status: "complete",
    updated: "Aug 3",
  },
  {
    name: "Protecting student data",
    type: "Lesson",
    owner: "Mahathi S.",
    status: "complete",
    updated: "Aug 1",
  },
];

const RECENT_DRAFTS: DraftRecord[] = [
  {
    name: "Cybersecurity awareness for new staff",
    type: "Lesson",
    owner: "Bin X.",
    status: "editing",
    updated: "12 min ago",
  },
  {
    name: "Data visualization fundamentals",
    type: "Practice",
    owner: "Mahathi S.",
    status: "generating",
    updated: "8 min ago",
  },
  {
    name: "Responsible use of generative AI",
    type: "Lesson",
    owner: "Bin X.",
    status: "complete",
    updated: "Yesterday",
  },
  {
    name: "Faculty project review workshop",
    type: "Scenario",
    owner: "Mahathi S.",
    status: "attention",
    updated: "2 days ago",
  },
];

const STATUS_DETAILS: Record<
  DraftStatus,
  { className: string; icon: React.ReactNode; label: string }
> = {
  editing: {
    label: "Editing",
    icon: <PencilLine aria-hidden="true" />,
    className: "border-transparent bg-muted text-secondary-foreground",
  },
  generating: {
    label: "Generating",
    icon: <LoaderCircle aria-hidden="true" className="animate-spin" />,
    className: "border-transparent bg-[#363D45] text-white",
  },
  complete: {
    label: "Complete",
    icon: <CircleCheck aria-hidden="true" />,
    className: "border-foreground bg-white text-foreground",
  },
  attention: {
    label: "Needs attention",
    icon: <TriangleAlert aria-hidden="true" />,
    className: "border-primary bg-white text-primary",
  },
};

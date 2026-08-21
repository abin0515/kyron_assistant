"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import { FileText, Layers3, Menu, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WorkspaceShellProps = {
  children: ReactNode;
};

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <DesktopNavigation pathname={pathname} />

        <div className="min-w-0 flex-1">
          <TopBar pathname={pathname} />
          <div className="mx-auto min-w-0 max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

function DesktopNavigation({ pathname }: { pathname: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <Brand />

      <div className="p-4">
        <NewDraftLink className="w-full justify-start" />
      </div>

      <nav aria-label="Primary navigation" className="grid gap-1 px-3">
        <DraftsLink active={pathname.startsWith("/drafts")} />
        <BatchDraftsLink active={pathname.startsWith("/batches")} />
      </nav>

      <div className="mt-auto border-t border-border p-4">
        <CurrentUserMenu />
      </div>
    </aside>
  );
}

function TopBar({ pathname }: { pathname: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <MobileNavigation pathname={pathname} />
        <div className="lg:hidden">
          <p className="text-sm font-bold">Course Studio</p>
          <p className="text-xs text-muted-foreground">Internal workspace</p>
        </div>
        <p className="hidden text-sm font-medium lg:block">
          {getPageLabel(pathname)}
        </p>
      </div>

      <div className="lg:hidden">
        <CurrentUserMenu compact />
      </div>
    </header>
  );
}

function MobileNavigation({ pathname }: { pathname: string }) {
  return (
    <details className="group relative lg:hidden">
      <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border border-border bg-card [&::-webkit-details-marker]:hidden">
        <Menu aria-hidden="true" className="size-4" />
        <span className="sr-only">Open navigation</span>
      </summary>
      <nav
        aria-label="Mobile navigation"
        className="absolute top-11 left-0 z-30 grid w-64 gap-1 rounded-xl border border-border bg-card p-2 shadow-lg"
      >
        <NewDraftLink className="mb-1 w-full justify-start" />
        <DraftsLink active={pathname.startsWith("/drafts")} />
        <BatchDraftsLink active={pathname.startsWith("/batches")} />
      </nav>
    </details>
  );
}

function Brand() {
  return (
    <div className="flex h-16 items-center gap-3 border-b border-border px-5">
      <span
        aria-hidden="true"
        className="grid size-9 place-items-center rounded-lg bg-primary text-xs font-extrabold tracking-[0.08em] text-primary-foreground"
      >
        CPE
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">Course Studio</p>
        <p className="truncate text-xs text-muted-foreground">
          Internal workspace
        </p>
      </div>
    </div>
  );
}

function CurrentUserMenu({ compact = false }: { compact?: boolean }) {
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return (
      <div
        aria-label="Loading user"
        className="h-9 w-full animate-pulse rounded-lg bg-muted"
      />
    );
  }

  if (!user) {
    return null;
  }

  if (compact) {
    return <UserButton />;
  }

  const name = user.fullName ?? user.username ?? "Signed-in user";
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserButton />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
    </div>
  );
}

function NewDraftLink({ className }: { className?: string }) {
  return (
    <Link
      className={buttonVariants({
        className,
        size: "lg",
      })}
      href="/drafts/new"
    >
      <Plus aria-hidden="true" />
      New draft
    </Link>
  );
}

function DraftsLink({ active }: { active: boolean }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium",
        active
          ? "bg-foreground text-primary-foreground before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-1 before:rounded-r before:bg-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      href="/drafts"
    >
      <FileText aria-hidden="true" className="size-4" />
      Drafts
    </Link>
  );
}

function BatchDraftsLink({ active }: { active: boolean }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium",
        active
          ? "bg-foreground text-primary-foreground before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-1 before:rounded-r before:bg-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      href="/batches"
    >
      <Layers3 aria-hidden="true" className="size-4" />
      <span>Batch drafts</span>
      <span
        className={cn(
          "ml-auto rounded-full border px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide uppercase",
          active
            ? "border-primary-foreground/30 text-primary-foreground/80"
            : "border-border text-muted-foreground",
        )}
      >
        Concept
      </span>
    </Link>
  );
}

function getPageLabel(pathname: string): string {
  if (pathname.startsWith("/batches")) {
    return "Batch drafts · Concept";
  }

  if (pathname === "/drafts/new") {
    return "New draft";
  }

  if (pathname.startsWith("/drafts/")) {
    return "Draft workspace";
  }

  return "Drafts";
}

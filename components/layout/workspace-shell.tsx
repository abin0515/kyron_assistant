"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import {
  FileText,
  FolderOpen,
  Layers3,
  LoaderCircle,
  LogOut,
  Menu,
  Plug,
  Plus,
  ScrollText,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { signOut } from "@/features/auth/api";
import { cn } from "@/lib/utils";
import type { WorkspaceAccount } from "@/types/api";

type WorkspaceShellProps = {
  account: WorkspaceAccount;
  children: ReactNode;
};

const AccountContext = createContext<WorkspaceAccount>({
  mode: "clerk",
  role: "user",
});

export function WorkspaceShell({ account, children }: WorkspaceShellProps) {
  return (
    <AccountContext.Provider value={account}>
      <WorkspaceFrame>{children}</WorkspaceFrame>
    </AccountContext.Provider>
  );
}

function WorkspaceFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <a
        className="fixed top-3 left-3 z-[70] -translate-y-20 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background shadow-lg focus:translate-y-0"
        href="#workspace-content"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <DesktopNavigation pathname={pathname} />

        <div className="min-w-0 flex-1">
          <TopBar pathname={pathname} />
          <div
            className="mx-auto min-w-0 max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9"
            id="workspace-content"
          >
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

function DesktopNavigation({ pathname }: { pathname: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/90 bg-card lg:flex">
      <Brand />

      <div className="px-4 pt-5 pb-4">
        <NewDraftLink className="w-full justify-start" />
      </div>

      <nav aria-label="Primary navigation" className="grid gap-1.5 px-3">
        <PrimaryNavigationLinks pathname={pathname} />
      </nav>

      <div className="mt-auto border-t border-border/80 bg-surface-subtle p-4">
        <CurrentUserMenu />
      </div>
    </aside>
  );
}

function TopBar({ pathname }: { pathname: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/80 bg-card/95 px-4 backdrop-blur-sm sm:px-6 lg:px-10">
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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        aria-controls="mobile-navigation"
        aria-expanded={open}
        aria-label="Open navigation"
        className="grid size-10 place-items-center rounded-lg border border-border bg-card shadow-xs hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Menu aria-hidden="true" className="size-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="presentation">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/35"
            onClick={() => setOpen(false)}
            type="button"
          />
          <aside
            aria-label="Mobile navigation"
            className="relative flex h-full w-[min(88vw,320px)] flex-col border-r border-border bg-card shadow-2xl"
            id="mobile-navigation"
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <BrandContent />
              <button
                aria-label="Close navigation"
                className="grid size-10 place-items-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <div className="px-4 pt-5 pb-4">
              <NewDraftLink className="w-full justify-start" />
            </div>
            <nav
              className="grid gap-1.5 px-3"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a")) {
                  setOpen(false);
                }
              }}
            >
              <PrimaryNavigationLinks pathname={pathname} />
            </nav>
            <div className="mt-auto border-t border-border bg-surface-subtle p-4">
              <CurrentUserMenu />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex h-16 items-center gap-3 border-b border-border px-5">
      <BrandContent />
    </div>
  );
}

function BrandContent() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-xs font-extrabold tracking-[0.08em] text-primary-foreground shadow-xs"
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
  const account = useContext(AccountContext);

  if (account.mode === "access-code") {
    return (
      <AccessCodeUserMenu
        compact={compact}
        name={account.name}
        role={account.role}
      />
    );
  }

  return <ClerkUserMenu compact={compact} />;
}

function AccessCodeUserMenu({
  compact,
  name,
  role,
}: {
  compact: boolean;
  name: string;
  role: "admin" | "developer";
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await signOut();
      window.location.assign("/sign-in");
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      {compact ? null : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <Badge variant={role === "admin" ? "info" : "neutral"}>
            {role === "admin" ? "Admin" : "Developer"}
          </Badge>
        </div>
      )}
      <Button
        aria-label="Sign out"
        disabled={signingOut}
        onClick={() => void handleSignOut()}
        size="icon-sm"
        title="Sign out"
        type="button"
        variant="ghost"
      >
        {signingOut ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <LogOut aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

function ClerkUserMenu({ compact }: { compact: boolean }) {
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

function PrimaryNavigationLinks({ pathname }: { pathname: string }) {
  const account = useContext(AccountContext);

  return (
    <>
      <NavigationLink
        active={pathname.startsWith("/drafts")}
        href="/drafts"
        icon={FileText}
        label="Drafts"
      />
      <NavigationLink
        active={pathname.startsWith("/sources")}
        href="/sources"
        icon={FolderOpen}
        label="Source Library"
      />
      <NavigationLink
        active={pathname.startsWith("/batches")}
        href="/batches"
        icon={Layers3}
        label="Batch drafts"
      />
      <NavigationLink
        active={pathname.startsWith("/qa")}
        href="/qa"
        icon={ShieldCheck}
        label="QA agent"
      />
      {account.role === "admin" || account.role === "developer" ? (
        <NavigationLink
          active={pathname.startsWith("/logs")}
          href="/logs"
          icon={ScrollText}
          label="Logs"
        />
      ) : null}
      {account.role === "admin" ? (
        <NavigationLink
          active={pathname.startsWith("/kyron")}
          href="/kyron"
          icon={Plug}
          label="Kyron"
        />
      ) : null}
    </>
  );
}

function NavigationLink({
  active,
  href,
  icon: Icon,
  label,
}: {
  active: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium",
        active
          ? "bg-accent text-foreground before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
      href={href}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span>{label}</span>
    </Link>
  );
}

function getPageLabel(pathname: string): string {
  if (pathname.startsWith("/kyron")) {
    return "Kyron";
  }

  if (pathname.startsWith("/qa")) {
    return "QA agent";
  }

  if (pathname.startsWith("/logs")) {
    return "Logs";
  }

  if (pathname.startsWith("/sources")) {
    return "Source Library";
  }

  if (pathname.startsWith("/batches")) {
    return "Batch drafts";
  }

  if (pathname === "/drafts/new") {
    return "New draft";
  }

  if (pathname.startsWith("/drafts/")) {
    return "Draft workspace";
  }

  return "Drafts";
}

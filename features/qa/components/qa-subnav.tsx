"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function QaSubnav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: "/qa", label: "Checks", active: pathname === "/qa" || pathname.startsWith("/qa/runs") },
    ...(isAdmin
      ? [{ href: "/qa/escalations", label: "Escalations", active: pathname.startsWith("/qa/escalations") }]
      : []),
    { href: "/qa/rubrics", label: "Rubrics", active: pathname.startsWith("/qa/rubrics") },
  ];

  return (
    <nav aria-label="QA sections" className="flex flex-wrap gap-1 border-b border-border/80 pb-px">
      {links.map((link) => (
        <Link
          aria-current={link.active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            link.active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

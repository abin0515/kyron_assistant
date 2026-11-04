"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function KyronSubnav() {
  const pathname = usePathname();
  const links = [
    { href: "/kyron", label: "Connection", active: pathname === "/kyron" },
    { href: "/kyron/content", label: "Course content", active: pathname.startsWith("/kyron/content") },
    { href: "/kyron/tools", label: "Tools", active: pathname.startsWith("/kyron/tools") },
  ];

  return (
    <nav aria-label="Kyron sections" className="flex flex-wrap gap-1 border-b border-border/80 pb-px">
      {links.map((link) => (
        <Link
          aria-current={link.active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            link.active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
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

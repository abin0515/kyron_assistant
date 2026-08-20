import type { Metadata } from "next";
import { IBM_Plex_Sans, Saira } from "next/font/google";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./globals.css";

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-cpe-body",
  weight: ["400", "500", "600"],
});

const headingFont = Saira({
  subsets: ["latin"],
  variable: "--font-cpe-heading",
  weight: ["300", "400"],
});

export const metadata: Metadata = {
  title: "CPE Course Studio",
  description: "Internal course draft workspace for the Stevens CPE team.",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      className={cn(
        "scroll-smooth motion-reduce:scroll-auto",
        "font-sans",
        bodyFont.variable,
        headingFont.variable,
      )}
      data-scroll-behavior="smooth"
      lang="en"
    >
      <body className="m-0 bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}

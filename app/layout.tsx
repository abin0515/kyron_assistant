import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
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
        geist.variable,
      )}
      data-scroll-behavior="smooth"
      lang="en"
    >
      <body className="bg-paper text-ink m-0 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

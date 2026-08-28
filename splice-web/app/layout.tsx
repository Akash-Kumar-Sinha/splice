import type { Metadata } from "next";
import { Geist, Geist_Mono, Figtree } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Splice Studio",
  description: "Version-controlled video editing. Branch. Commit. Compare.",
};

import { TooltipProvider } from "@/components/ui/tooltip";
import { RepositoryProvider } from "@/lib/repo-context";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("dark h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", figtree.variable)}
    >
      <body className="min-h-full flex flex-col">
        <RepositoryProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </RepositoryProvider>
      </body>
    </html>
  );
}



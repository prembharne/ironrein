import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { VaultBar } from "@/components/VaultBar";
import { OwnerProvider } from "@/lib/OwnerProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warden",
  description: "Spending limits an AI agent can't talk its way past, enforced on NEAR.",
};

const NAV = [
  ["/activity", "Activity"],
  ["/policy", "Policy"],
  ["/redteam", "Red Team"],
  ["/setup", "Setup"],
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OwnerProvider>
          <header className="border-b border-zinc-800 bg-zinc-950">
            <div className="mx-auto max-w-4xl space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Link href="/" className="font-semibold">Warden</Link>
                <nav className="flex flex-1 flex-wrap gap-4 text-sm text-zinc-300">
                  {NAV.map(([href, label]) => (
                    <Link key={href} href={href} className="hover:text-white">{label}</Link>
                  ))}
                </nav>
                <Link href="/kill" className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500">
                  Kill switch
                </Link>
              </div>
              <VaultBar />
            </div>
          </header>
          <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">{children}</main>
        </OwnerProvider>
      </body>
    </html>
  );
}

"use client";
// The dashboard frame: the landing page's floating white pill navbar, a page heading in the
// landing's headline style, and the live vault strip. Pages render inside it.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DotArrow } from "./ui";
import { VaultBar } from "./VaultBar";

const NAV = [
  ["/activity", "Activity"],
  ["/policy", "Policy"],
  ["/redteam", "Red Team"],
  ["/setup", "Setup"],
] as const;

const HEADINGS: Array<[string, string, string]> = [
  ["/activity", "Activity", "Every payment and every blocked attempt, read from the vault."],
  ["/policy", "Spending policy", "The limits the vault enforces on-chain. The agent can't change them."],
  ["/redteam", "Red Team", "Three live attacks. Watch each one fail on-chain."],
  ["/setup", "Setup", "Your post-quantum owner key, the vault's funds and the backup key."],
  ["/kill", "Kill switch", "Stop the agent now, signed with your ML-DSA key."],
  ["/receipt", "Receipt", "Why the agent paid, and whether the proof holds up."],
];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const heading = HEADINGS.find(([p]) => pathname.startsWith(p));

  return (
    <div className="relative min-h-screen font-sans text-white">
      <div className="console-bg" aria-hidden />

      <header className="fixed inset-x-[clamp(12px,5.7vw,82px)] top-3 z-50 flex h-[54px] items-center rounded-full bg-white pr-2 pl-4 text-[#0b1d3a] shadow-[0_1px_0_rgba(11,29,58,0.04),0_10px_30px_-18px_rgba(11,29,58,0.25)] md:top-5 md:h-[60px] md:pl-[22px]">
        <Link href="/" className="flex items-center gap-[9px]" aria-label="Ironrein home">
          <BrandMark />
          <span className="text-[17px] font-medium tracking-[-0.02em]">Ironrein</span>
        </Link>

        <nav aria-label="Console" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-[31px] md:flex">
          {NAV.map(([href, label]) => (
            <NavLink key={href} href={href} active={pathname.startsWith(href)}>
              {label}
            </NavLink>
          ))}
        </nav>

        <Link href="/kill" className="wd-btn danger ml-auto">
          <span>Kill switch</span>
          <DotArrow tone="danger" />
        </Link>
      </header>

      {/* Below md the links move to a row under the pill. */}
      <nav
        aria-label="Console"
        className="fixed inset-x-[clamp(12px,5.7vw,82px)] top-[74px] z-40 flex gap-1 overflow-x-auto rounded-full border border-white/10 bg-[rgba(14,18,28,0.8)] p-1 backdrop-blur-[16px] md:hidden"
      >
        {NAV.map(([href, label]) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium ${active ? "bg-white text-[#0b1d3a]" : "text-white/75"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="relative z-10 mx-auto max-w-5xl px-[clamp(16px,4vw,32px)] pt-[136px] pb-16 md:pt-[124px]">
        {heading && (
          <div className="wd-fade mb-6">
            <h1 className="text-[clamp(32px,4.2vw,56px)] leading-[1.03] font-normal tracking-[-0.035em] text-white">
              {heading[1]}
            </h1>
            <p className="mt-3 text-[clamp(15px,1.2vw,18px)] tracking-[-0.015em] text-white/60">{heading[2]}</p>
          </div>
        )}
        <div className="wd-fade mb-5" style={{ ["--d" as string]: "0.08s" }}>
          <VaultBar />
        </div>
        <main className="space-y-5">{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative text-sm font-medium tracking-[-0.005em] transition-opacity hover:opacity-55 ${active ? "opacity-100" : "opacity-80"}`}
    >
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute -bottom-2 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]"
        />
      )}
    </Link>
  );
}

/** Same mark as the landing navbar. */
function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="console-brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <circle cx="11" cy="11" r="11" fill="url(#console-brand-grad)" />
      <path d="M5 10.2c2.3-1.6 4.7-1.6 7 0s4.7 1.6 7 0" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 14.2c2.3-1.6 4.7-1.6 7 0s4.7 1.6 7 0" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

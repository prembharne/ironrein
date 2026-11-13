"use client";
// All the visual primitives live here. They follow the landing page's theme: dark navy glass
// cards, glacier-cyan accent, pill buttons with the glowing dot. Pages hold no chain logic
// beyond calling lib/, so the look can change without touching signing code.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="wd-fade rounded-2xl border border-sky-400/20 bg-[rgba(14,18,28,0.78)] p-5 shadow-[0_16px_36px_-12px_rgba(0,0,0,0.6),0_0_20px_rgba(56,189,248,0.06)] backdrop-blur-[16px] md:p-6">
      {title && (
        <h2 className="mb-4 flex items-center gap-2.5 text-lg font-medium tracking-[-0.02em] text-white">
          <span aria-hidden className="size-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
          {title}
        </h2>
      )}
      <div className="space-y-3 text-sm leading-relaxed text-white/75">{children}</div>
    </section>
  );
}

type Tone = "default" | "danger" | "ghost" | "ink";

export function Button({
  tone = "default",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "md" | "lg" }) {
  const tones: Record<Tone, string> = { default: "primary", danger: "danger", ghost: "ghost", ink: "ink" };
  return (
    <button type="button" {...props} className={`wd-btn ${tones[tone]} ${size === "lg" ? "lg" : ""} ${className}`}>
      <span>{children}</span>
      <DotArrow tone={tone} large={size === "lg"} />
    </button>
  );
}

/** The dot that sits inside every pill button. Exported for link-styled buttons. */
export function DotArrow({ tone = "default", large = false }: { tone?: Tone; large?: boolean }) {
  const stroke = tone === "danger" ? "#dc2626" : "#0b1d3a";
  return (
    <span className="wd-dot" aria-hidden="true">
      <svg width={large ? 16 : 12} height={large ? 16 : 12} viewBox="0 0 12 12" fill="none">
        <path d="M4.5 2.5 8 6l-3.5 3.5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-[0.02em] text-white/60">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 transition-colors focus:border-sky-400 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      />
      {hint && <span className="mt-1.5 block text-xs text-white/45">{hint}</span>}
    </label>
  );
}

export function Badge({ tone, children }: { tone: "good" | "bad" | "neutral"; children: ReactNode }) {
  const tones = {
    good: "border-[rgba(0,255,170,0.35)] bg-[rgba(0,255,170,0.10)] text-[#a7f3d0]",
    bad: "border-red-400/40 bg-red-500/15 text-red-200",
    neutral: "border-sky-400/40 bg-sky-400/15 text-sky-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "error" | "good"; children: ReactNode }) {
  const tones = {
    neutral: "border-sky-400/20 bg-sky-400/[0.06] text-white/80",
    error: "border-red-400/40 bg-red-500/10 text-red-100",
    good: "border-[rgba(0,255,170,0.3)] bg-[rgba(0,255,170,0.07)] text-[#d1fae5]",
  };
  return (
    <p role={tone === "error" ? "alert" : undefined} className={`rounded-xl border p-3.5 text-sm break-words ${tones[tone]}`}>
      {children}
    </p>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="font-mono text-xs break-all text-sky-100">{children}</code>;
}

export function Steps({ steps }: { steps: Array<{ t: string; kind: string; summary: string }> }) {
  if (!steps.length) return null;
  return (
    <ol className="space-y-1.5 rounded-xl border border-white/8 bg-black/30 p-3.5 font-mono text-xs">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-10 shrink-0 text-sky-400/70">{s.kind}</span>
          <span
            className={
              /REJECTED|REFUSED/.test(s.summary)
                ? "break-words text-red-300"
                : /SPENT|ACCEPTED/.test(s.summary)
                  ? "break-words text-amber-200"
                  : "break-words text-white/75"
            }
          >
            {s.summary}
          </span>
        </li>
      ))}
    </ol>
  );
}

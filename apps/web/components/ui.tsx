"use client";
// All the visual primitives live here, deliberately plain. To apply a design
// template, restyle these and the shell in app/layout.tsx. Pages hold no chain logic
// beyond calling lib/, so the look can change without touching signing code.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:p-5">
      {title && <h2 className="mb-3 text-base font-semibold text-zinc-100">{title}</h2>}
      <div className="space-y-3 text-sm text-zinc-300">{children}</div>
    </section>
  );
}

type Tone = "default" | "danger" | "ghost";

export function Button({ tone = "default", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  const tones: Record<Tone, string> = {
    default: "bg-emerald-600 text-white hover:bg-emerald-500",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "border border-zinc-700 text-zinc-200 hover:bg-zinc-800",
  };
  return (
    <button
      type="button"
      {...props}
      className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    />
  );
}

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        {...props}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Badge({ tone, children }: { tone: "good" | "bad" | "neutral"; children: ReactNode }) {
  const tones = {
    good: "bg-emerald-950 text-emerald-300 border-emerald-800",
    bad: "bg-red-950 text-red-300 border-red-800",
    neutral: "bg-zinc-800 text-zinc-300 border-zinc-700",
  };
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "error" | "good"; children: ReactNode }) {
  const tones = {
    neutral: "border-zinc-700 bg-zinc-950 text-zinc-300",
    error: "border-red-800 bg-red-950 text-red-200",
    good: "border-emerald-800 bg-emerald-950 text-emerald-200",
  };
  return (
    <p role={tone === "error" ? "alert" : undefined} className={`rounded-md border p-3 text-sm break-words ${tones[tone]}`}>
      {children}
    </p>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="font-mono text-xs break-all text-zinc-200">{children}</code>;
}

export function Steps({ steps }: { steps: Array<{ t: string; kind: string; summary: string }> }) {
  if (!steps.length) return null;
  return (
    <ol className="space-y-1 font-mono text-xs">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-10 shrink-0 text-zinc-500">{s.kind}</span>
          <span
            className={
              /REJECTED|REFUSED/.test(s.summary)
                ? "break-words text-red-300"
                : /SPENT|ACCEPTED/.test(s.summary)
                  ? "break-words text-amber-200"
                  : "break-words text-zinc-300"
            }
          >
            {s.summary}
          </span>
        </li>
      ))}
    </ol>
  );
}

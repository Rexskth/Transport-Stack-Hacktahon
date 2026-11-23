"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Segmented control with a sliding pill. */
export function Segmented<T extends string>({
  value, onChange, options, label, className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; hint?: string }[];
  label: string;
  className?: string;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <div role="radiogroup" aria-label={label} className={cn("relative flex rounded-xl border border-line bg-bg/60 p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn("relative z-10 flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", active ? "text-on-accent" : "text-muted hover:text-ink")}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 36 }}
                className="absolute inset-0 -z-10 rounded-lg bg-accent shadow-sm"
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-line/60", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent dark:via-white/10" />
    </div>
  );
}

export function Chip({ children, className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...p} className={cn("inline-flex items-center gap-1 rounded-md border border-line bg-bg/70 px-2 py-0.5 text-[13px] font-semibold", className)}>
      {children}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-xl border px-3 py-2.5 text-sm", tone === "error" ? "border-crowded/40 bg-crowded/10 text-crowded" : "border-line bg-bg/70 text-muted")}
    >
      {children}
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

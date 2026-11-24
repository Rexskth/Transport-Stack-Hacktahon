"use client";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { Info, Moon, Sun, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Segmented } from "./ui";

export type Tab = "plan" | "network";

function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
      <rect width="32" height="32" rx="9" fill="rgb(var(--accent))" />
      <path d="M8 21V12a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9" fill="none" stroke="rgb(var(--on-accent))" strokeWidth="2" strokeLinecap="round" />
      <rect x="8" y="14" width="16" height="3" fill="rgb(var(--on-accent))" opacity=".9" />
      <circle cx="12" cy="22" r="1.8" fill="rgb(var(--on-accent))" /><circle cx="20" cy="22" r="1.8" fill="rgb(var(--on-accent))" />
      <g><rect x="9" y="25.5" width="4.6" height="2" rx="1" fill="rgb(var(--seats))" /><rect x="13.7" y="25.5" width="4.6" height="2" rx="1" fill="rgb(var(--standing))" /><rect x="18.4" y="25.5" width="4.6" height="2" rx="1" fill="rgb(var(--crowded))" /></g>
    </svg>
  );
}

export function Header({ tab, onTab, theme, onTheme, onAbout }: { tab: Tab; onTab: (t: Tab) => void; theme: "light" | "dark"; onTheme: () => void; onAbout: () => void }) {
  return (
    <header className="glass fixed inset-x-0 top-0 z-[1000] flex h-14 items-center gap-3 px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo />
        <div className="hidden min-w-0 leading-tight sm:block">
          <div className="truncate text-[15px] font-semibold tracking-tight">Delhi Bus Crowding</div>
          <div className="truncate text-[11px] text-muted">Know how full the bus is before you board</div>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Segmented
          label="View"
          value={tab}
          onChange={onTab}
          options={[{ value: "plan", label: "Plan a trip" }, { value: "network", label: "Network" }]}
          className="w-52 sm:w-60"
        />
        <button onClick={onAbout} aria-label="About this data" className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition hover:text-ink"><Info size={17} /></button>
        <button onClick={onTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition hover:text-ink">
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
}

/** Desktop: floating panel on the left. Mobile: bottom sheet with three snap heights (drag the handle or tap it). */
export function Panel({ children, snap, onSnap, isMobile, vh }: { children: React.ReactNode; snap: 0 | 1 | 2; onSnap: (s: 0 | 1 | 2) => void; isMobile: boolean; vh: number }) {
  const reduce = useReducedMotion();
  if (!isMobile) {
    return (
      <aside className="glass absolute bottom-4 left-4 top-[68px] z-[900] w-[440px] overflow-y-auto rounded-3xl p-4 shadow-float scroll-thin">
        {children}
      </aside>
    );
  }
  const heights = [150, Math.round(vh * 0.52), vh - 70];
  const end = (_: unknown, i: PanInfo) => {
    const dir = i.offset.y < -40 || i.velocity.y < -400 ? 1 : i.offset.y > 40 || i.velocity.y > 400 ? -1 : 0;
    onSnap(Math.max(0, Math.min(2, snap + dir)) as 0 | 1 | 2);
  };
  return (
    <motion.aside
      animate={{ height: heights[snap] }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 34 }}
      className="glass absolute inset-x-0 bottom-0 z-[900] flex flex-col rounded-t-3xl shadow-float"
    >
      <motion.div
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.25} onDragEnd={end}
        onClick={() => onSnap(snap === 2 ? 1 : (snap + 1) as 1 | 2)}
        role="button" aria-label="Resize panel" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSnap(snap === 2 ? 1 : (snap + 1) as 1 | 2); }}
        className="grid shrink-0 cursor-grab touch-none place-items-center pb-1 pt-2.5 active:cursor-grabbing"
      >
        <span className="h-1.5 w-11 rounded-full bg-muted/40" />
      </motion.div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 scroll-thin">{children}</div>
    </motion.aside>
  );
}

export function About({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2000] grid place-items-center bg-black/50 p-4" onClick={onClose}>
          <motion.div
            ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="About this data"
            initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className={cn("glass max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-panel p-6 shadow-float scroll-thin")}
          >
            <div className="mb-3 flex items-start justify-between">
              <h2 className="text-lg font-semibold tracking-tight">How to read this</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted">
              <p><b className="text-ink">Levels are relative.</b> Seats, standing and crowded rank each route stretch and hour against the rest of the network on the same type of day. They are not a headcount.</p>
              <p><b className="text-ink">Where it comes from.</b> About 2.5 million October 2026 bus tickets, placed on the Delhi GTFS routes and divided by the buses scheduled to run.</p>
              <p><b className="text-ink">Check the data quality.</b> Most stretches have few tickets. Every result shows <em>Solid</em>, <em>Some</em> or <em>Limited</em> data. Treat limited data as a rough guess.</p>
              <p><b className="text-ink">Times follow the schedule</b>, not live traffic or delays. Trips are direct or with one change.</p>
              <p>Technical note: <code className="rounded bg-bg px-1">NOTE.md</code> in the repository.</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

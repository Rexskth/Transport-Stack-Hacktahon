"use client";
import { motion, useReducedMotion } from "framer-motion";
import { BANDS, CONFIDENCE, LEVELS } from "@/lib/levels";
import type { Confidence, Leg, Level } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Level pill. Icon + text, so colour is never the only signal. */
export function CrowdBadge({ level, size = "md" }: { level: Level; size?: "sm" | "md" }) {
  const l = LEVELS[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold", l.bg, l.text, size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-[13px]")}>
      <span aria-hidden>{l.icon}</span>
      {l.label}
    </span>
  );
}

/** Three bands (seats / standing / crowded) sized like the model's percentile bands, with a marker at the value. */
export function CrowdMeter({ index, className }: { index: number | null; className?: string }) {
  const reduce = useReducedMotion();
  const w = [BANDS[0], BANDS[1] - BANDS[0], 1 - BANDS[1]].map((x) => `${x * 100}%`);
  return (
    <div className={cn("relative h-2 w-full", className)} role="img" aria-label={index == null ? "No crowding data" : `Crowding ${Math.round(index * 100)} on a 0 to 100 scale`}>
      <div className="flex h-full overflow-hidden rounded-full opacity-90">
        <div style={{ width: w[0] }} className="bg-seats" />
        <div style={{ width: w[1] }} className="bg-standing" />
        <div style={{ width: w[2] }} className="bg-crowded" />
      </div>
      {index != null && (
        <motion.div
          initial={reduce ? false : { left: "0%" }}
          animate={{ left: `${Math.min(1, Math.max(0, index)) * 100}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 20 }}
          className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow ring-2 ring-panel"
        />
      )}
    </div>
  );
}

/** One coloured cell per stretch the bus rides, so a rider sees where it fills up. */
export function RideStrip({ legs, className }: { legs: Leg[]; className?: string }) {
  return (
    <div className={cn("flex items-end gap-1.5", className)} aria-label="Crowding along the ride">
      {legs.map((leg, i) => (
        <div key={i} className="min-w-0" style={{ flexGrow: Math.max(leg.stretch_levels.length, 1) }}>
          <div className="mb-0.5 truncate text-[11px] font-semibold text-muted">{leg.route}</div>
          <div className="flex h-3 gap-px overflow-hidden rounded">
            {leg.stretch_levels.map((lv, k) => (
              <div
                key={k}
                title={`${LEVELS[lv].label}`}
                className="h-full min-w-[2px] flex-1"
                style={{ background: LEVELS[lv].color, opacity: lv === "unknown" ? 0.35 : 1 }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Three dots + words. Hover or focus for what it means. */
export function ConfidencePill({ confidence, className }: { confidence: Confidence; className?: string }) {
  const c = CONFIDENCE[confidence];
  return (
    <span title={c.hint} tabIndex={0} className={cn("inline-flex items-center gap-1.5 text-xs text-muted", className)}>
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i < c.dots ? "bg-ink/70" : "bg-line")} />
        ))}
      </span>
      {c.label}
      {confidence === "low" && <span className="sr-only">. {c.hint}</span>}
    </span>
  );
}

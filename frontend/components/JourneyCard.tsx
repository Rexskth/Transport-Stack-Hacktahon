"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Footprints, Repeat2, Clock } from "lucide-react";
import { useState } from "react";
import type { JourneyOption } from "@/lib/types";
import { cn, minutes } from "@/lib/utils";
import { ConfidencePill, CrowdBadge, CrowdMeter, RideStrip } from "./crowd";
import { Chip } from "./ui";

export function JourneyCard({
  o, index, selected, best, onSelect, onHover,
}: {
  o: JourneyOption;
  index: number;
  selected: boolean;
  best: boolean;
  onSelect: () => void;
  onHover: (h: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const cr = o.crowding;
  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.05, type: "spring", stiffness: 260, damping: 26 }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      aria-current={selected}
      className={cn("rounded-2xl border bg-panel/70 p-3.5 transition-shadow", selected ? "border-accent shadow-float ring-1 ring-accent" : "border-line hover:shadow-float")}
    >
      <button onClick={onSelect} className="block w-full text-left" aria-label={`Show option ${index + 1} on the map`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="tabular flex items-baseline gap-2 text-xl font-semibold tracking-tight">
              {o.leave_at}
              <span className="text-muted">→</span>
              {o.arrive_at}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span className="font-semibold text-ink">{minutes(o.total_minutes)}</span>
              <span>·</span>
              <span>{o.transfers === 0 ? "Direct" : `${o.transfers} change`}</span>
              {best && <Chip className="border-accent/40 bg-accent/10 text-accent">Best match</Chip>}
            </div>
          </div>
          <CrowdBadge level={cr.level} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {o.legs.map((l, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <Repeat2 size={14} className="text-muted" aria-label="change" />}
              <Chip>{l.route}</Chip>
            </span>
          ))}
        </div>

        <div className="mt-3 space-y-2.5">
          <CrowdMeter index={cr.avg_index} />
          <RideStrip legs={o.legs} />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <ConfidencePill confidence={cr.confidence} />
          {cr.crowded_share > 0 ? (
            <span className="text-xs text-muted">{Math.round(cr.crowded_share * 100)}% of the ride is crowded</span>
          ) : (
            <span className="text-xs text-muted">No crowded stretches</span>
          )}
        </div>

        {o.leave_after_min > 0 && (
          <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent">
            <Clock size={14} /> Leave {o.leave_after_min} min later ({o.leave_at}) for a less crowded bus
          </div>
        )}
      </button>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 flex w-full items-center justify-between border-t border-line pt-2.5 text-xs font-medium text-muted hover:text-ink"
      >
        <span className="flex items-center gap-1.5">
          <Footprints size={14} /> Walk {Math.round(o.walk_to_first_min)} min · {Math.round(o.walk_from_last_min)} min at the end
        </span>
        <span className="flex items-center gap-1">Details <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} /></span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {o.legs.map((l, i) => (
              <li key={i} className="relative mt-3 border-l-2 border-accent/50 pl-3 text-sm">
                <div className="flex items-center gap-2"><Chip>{l.route}</Chip><span className="text-muted">{l.stops} stops · {minutes(l.minutes_on_bus)}</span></div>
                <div className="mt-1.5"><span className="tabular font-semibold">{l.board_time}</span> <span>Board at {l.board.name}</span></div>
                <div><span className="tabular font-semibold">{l.alight_time}</span> <span>Get off at {l.alight.name}</span></div>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

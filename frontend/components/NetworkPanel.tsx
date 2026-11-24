"use client";
import { motion, useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import type { CrowdingStretch, HeatRoute, NetworkHour, ProfileHour } from "@/lib/types";
import { LEVELS } from "@/lib/levels";
import { cn, hourLabel } from "@/lib/utils";
import { NetworkHourChart, RouteProfileChart } from "./charts";
import { ConfidencePill, CrowdBadge } from "./crowd";
import { Notice, Segmented, Skeleton } from "./ui";

export interface NetworkState {
  hour: number; weekend: boolean; conf: "low" | "medium" | "high";
  playing: boolean; selected: string | null;
  hourly: NetworkHour[] | null; routes: HeatRoute[] | null;
  profile: ProfileHour[] | null; stretches: CrowdingStretch[] | null;
  loading: boolean; error: string | null;
}

export function NetworkPanel({ s, set }: { s: NetworkState; set: (p: Partial<NetworkState>) => void }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...(s.routes ?? []).map((r) => r.riders_per_bus));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Segmented label="Day type" value={s.weekend ? "we" : "wd"} onChange={(v) => set({ weekend: v === "we" })} options={[{ value: "wd", label: "Weekday" }, { value: "we", label: "Weekend" }]} />
        <Segmented
          label="Minimum data quality"
          value={s.conf}
          onChange={(v) => set({ conf: v })}
          options={[{ value: "low", label: "All", hint: "Include thin-data cells" }, { value: "medium", label: "Good", hint: "Medium confidence or better" }, { value: "high", label: "Solid", hint: "High confidence only" }]}
        />
      </div>

      <section className="rounded-2xl border border-line bg-panel/60 p-3.5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold">When is Delhi crowded?</h2>
          <span className="tabular rounded-md bg-accent/12 px-2 py-0.5 text-xs font-semibold text-accent">{hourLabel(s.hour)}</span>
        </div>
        <p className="mb-2 text-xs text-muted">Share of bus route stretches at each level, by hour. Click a bar or use the slider.</p>
        {s.hourly ? <NetworkHourChart data={s.hourly} hour={s.hour} onHour={(h) => set({ hour: h, playing: false })} /> : <Skeleton className="h-40" />}
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => set({ playing: !s.playing })}
            aria-label={s.playing ? "Pause the day" : "Play through the day"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-sm transition active:scale-95"
          >
            {s.playing ? <Pause size={16} /> : <Play size={16} className="translate-x-px" />}
          </button>
          <input
            type="range" min={0} max={23} value={s.hour}
            onChange={(e) => set({ hour: +e.target.value, playing: false })}
            aria-label="Hour of day" aria-valuetext={hourLabel(s.hour)}
            className="h-2 w-full cursor-pointer accent-[rgb(var(--accent))]"
          />
        </div>
        <div className="mt-2 flex gap-3 text-[11px] text-muted">
          {(["seats", "standing", "crowded"] as const).map((l) => (
            <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: LEVELS[l].color }} />{LEVELS[l].short}</span>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Most overloaded routes at {hourLabel(s.hour)}</h2>
          <span className="text-xs text-muted">riders per bus*</span>
        </div>
        {s.error && <Notice tone="error">{s.error}</Notice>}
        {!s.routes && !s.error && <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
        {s.routes && s.routes.length === 0 && <Notice>No routes have enough data at this hour and quality. Try &ldquo;All&rdquo;.</Notice>}
        <ol className={cn("space-y-1.5 transition-opacity", s.loading && "opacity-50")}>
          {s.routes?.map((r, i) => {
            const sel = s.selected === r.route;
            return (
              <li key={r.route}>
                <button
                  onClick={() => set({ selected: sel ? null : r.route })}
                  aria-expanded={sel}
                  className={cn("w-full rounded-xl border p-2.5 text-left transition", sel ? "border-accent bg-accent/8" : "border-line bg-panel/50 hover:border-accent/40")}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="tabular w-5 text-center text-xs font-semibold text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{r.route}</span>
                        <CrowdBadge level={r.level} size="sm" />
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
                          <motion.span
                            initial={reduce ? false : { width: 0 }}
                            animate={{ width: `${(r.riders_per_bus / max) * 100}%` }}
                            className="block h-full rounded-full"
                            style={{ background: LEVELS[r.level].color }}
                          />
                        </span>
                        <span className="tabular w-9 text-right text-xs font-semibold">{r.riders_per_bus.toFixed(1)}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted">Worst: {r.worst_from} → {r.worst_to}</span>
                    </span>
                  </div>
                </button>
                {sel && (
                  <motion.div initial={reduce ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mx-1 mt-1.5 rounded-xl border border-line bg-panel/60 p-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted">
                      <span>{r.route} across the day</span>
                      <span>{Math.round(r.crowded_share * 100)}% of stretches crowded now</span>
                    </div>
                    {s.profile ? <RouteProfileChart data={s.profile} hour={s.hour} /> : <Skeleton className="h-36" />}
                    {s.stretches && s.stretches.length > 0 && (
                      <>
                        <div className="mb-1 mt-2 text-xs text-muted">Stretches in order, at {hourLabel(s.hour)}</div>
                        <div className="flex h-3 gap-px overflow-hidden rounded">
                          {s.stretches.map((x) => (
                            <div key={x.stretch} className="h-full flex-1" title={`${x.from_stop} → ${x.to_stop}: ${LEVELS[x.level].label}`} style={{ background: LEVELS[x.level].color }} />
                          ))}
                        </div>
                        <div className="mt-2"><ConfidencePill confidence={s.stretches.some((x) => x.confidence === "high") ? "high" : s.stretches.some((x) => x.confidence === "medium") ? "medium" : "low"} /></div>
                      </>
                    )}
                  </motion.div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 px-1 text-[11px] leading-snug text-muted">*Riders per bus in the ticket sample, not a headcount. Levels are relative to the rest of the network at the same day type.</p>
      </section>
    </div>
  );
}

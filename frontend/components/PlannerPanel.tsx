"use client";
import { ArrowDownUp, Loader2, Search, Sparkles } from "lucide-react";
import type { JourneysResponse, Place, Prefer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { JourneyCard } from "./JourneyCard";
import { PlaceInput } from "./PlaceInput";
import { Field, Notice, Segmented, Skeleton } from "./ui";

export const EXAMPLES: { label: string; from: Place; to: Place; depart: string }[] = [
  { label: "Anand Vihar → Connaught Place, 6 pm", from: { label: "Anand Vihar ISBT Main Road", value: "7699" }, to: { label: "Shivaji Stadium Terminal (Connaught Place)", value: "365" }, depart: "18:00" },
  { label: "Badarpur → Vasant Kunj, 8:30 am", from: { label: "Badarpur Border (T)", value: "2640" }, to: { label: "Vasant Kunj C8 (Vasant Kunj Road)", value: "7930" }, depart: "08:30" },
  { label: "Kashmere Gate → Nehru Place, 8:30 am", from: { label: "ISBT Kashmere Gate", value: "267" }, to: { label: "Nehru Place (map point)", value: "28.5491,77.2518", lat: 28.5491, lon: 77.2518 }, depart: "08:30" },
];

const QUICK_TIMES = [["Morning peak", "08:30"], ["Midday", "13:00"], ["Evening peak", "18:00"], ["Late", "22:00"]] as const;

export interface PlannerState {
  from: Place | null; to: Place | null;
  depart: string; weekend: boolean; prefer: Prefer;
  loading: boolean; error: string | null; data: JourneysResponse | null;
  selected: number;
}

export function PlannerPanel({
  s, set, onSearch, onSwap, onExample, onHover,
}: {
  s: PlannerState;
  set: (p: Partial<PlannerState>) => void;
  onSearch: () => void;
  onSwap: () => void;
  onExample: (i: number) => void;
  onHover: (i: number | null) => void;
}) {
  const ready = !!s.from && !!s.to && !s.loading;
  return (
    <div className="space-y-4">
      <div className="relative space-y-2">
        <PlaceInput label="From" dot="rgb(var(--accent))" value={s.from} onChange={(p) => set({ from: p })} placeholder="From: stop name, or click the map" />
        <PlaceInput label="To" dot="rgb(var(--crowded))" value={s.to} onChange={(p) => set({ to: p })} placeholder="To: stop name, or click the map" />
        <button
          onClick={onSwap}
          aria-label="Swap origin and destination"
          className="absolute right-12 top-1/2 z-10 -translate-y-1/2 rounded-full border border-line bg-panel p-1.5 text-muted shadow-sm transition hover:rotate-180 hover:text-ink"
        >
          <ArrowDownUp size={15} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Leave at">
          <input
            type="time"
            value={s.depart}
            onChange={(e) => set({ depart: e.target.value })}
            className="tabular h-10 w-full rounded-xl border border-line bg-bg/60 px-3 text-[15px]"
          />
        </Field>
        <Field label="Day">
          <Segmented
            label="Day type"
            value={s.weekend ? "we" : "wd"}
            onChange={(v) => set({ weekend: v === "we" })}
            options={[{ value: "wd", label: "Weekday" }, { value: "we", label: "Weekend" }]}
            className="h-10 [&_button]:py-1"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_TIMES.map(([l, t]) => (
          <button
            key={t}
            onClick={() => set({ depart: t })}
            className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", s.depart === t ? "border-accent bg-accent/12 text-accent" : "border-line text-muted hover:text-ink")}
          >
            {l} · {t}
          </button>
        ))}
      </div>

      <Segmented
        label="Prefer"
        value={s.prefer}
        onChange={(v) => set({ prefer: v })}
        options={[
          { value: "fast", label: "Faster", hint: "Shortest total time first" },
          { value: "comfort", label: "More comfortable", hint: "Least crowded first, then time" },
        ]}
      />

      <button
        onClick={onSearch}
        disabled={!ready}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-semibold text-on-accent shadow-sm transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {s.loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        {s.loading ? "Finding buses…" : "Find buses"}
      </button>

      {!s.data && !s.loading && (
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"><Sparkles size={12} /> Try an example</div>
        <div className="flex flex-col gap-1">
          {EXAMPLES.map((e, i) => (
            <button key={e.label} onClick={() => onExample(i)} className="rounded-lg px-2 py-1.5 text-left text-sm text-accent transition-colors hover:bg-accent/10">
              {e.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* results */}
      <div aria-live="polite" className="space-y-3">
        {s.loading && !s.data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        {s.error && <Notice tone="error">{s.error}</Notice>}
        {s.data && !s.error && s.data.options.length === 0 && (
          <Notice>{s.data.note ?? "No journeys found."} Try another time or a different stop.</Notice>
        )}
        {s.data && !s.error && s.data.options.length > 0 && (
          <>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">{s.data.options.length} option{s.data.options.length === 1 ? "" : "s"}</h2>
              <span className="text-xs text-muted">{s.prefer === "fast" ? "Fastest first" : "Least crowded first"}</span>
            </div>
            <div className={cn("space-y-3 transition-opacity", s.loading && "opacity-50")}>
              {s.data.options.map((o, i) => (
                <JourneyCard
                  key={`${o.routes.join("+")}-${o.leave_after_min}`}
                  o={o}
                  index={i}
                  best={i === 0}
                  selected={s.selected === i}
                  onSelect={() => set({ selected: i })}
                  onHover={(h) => onHover(h ? i : null)}
                />
              ))}
            </div>
            <p className="px-1 text-[11px] leading-snug text-muted">{s.data.disclaimer}</p>
          </>
        )}
      </div>
    </div>
  );
}

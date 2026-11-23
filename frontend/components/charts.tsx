"use client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { NetworkHour, ProfileHour } from "@/lib/types";
import { BANDS } from "@/lib/levels";

const AXIS = { fontSize: 10, fill: "rgb(var(--muted))" } as const;
const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);

function TipBox({ children }: { children: React.ReactNode }) {
  return <div className="glass rounded-lg px-2.5 py-1.5 text-xs shadow-float">{children}</div>;
}

/** Stacked bars: how every hour's route-stretches split into seats / standing / crowded. Click a bar to pick the hour. */
export function NetworkHourChart({ data, hour, onHour }: { data: NetworkHour[]; hour: number; onHour: (h: number) => void }) {
  const rows = data.map((d) => ({ ...d, s: d.seats_share ?? 0, st: d.standing_share ?? 0, c: d.crowded_share ?? 0 }));
  const cells = (key: string, color: string) =>
    rows.map((r) => <Cell key={`${key}${r.hour}`} fill={color} fillOpacity={r.hour === hour ? 1 : 0.38} />);
  return (
    <div className="h-40 w-full" role="img" aria-label="Share of route stretches by crowding level for each hour of the day">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={rows} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="3 3" />
          <XAxis dataKey="hour" tick={AXIS} tickLine={false} axisLine={false} interval={2} tickFormatter={(h) => String(h).padStart(2, "0")} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} ticks={[0, 0.5, 1]} />
          <Tooltip
            cursor={{ fill: "rgb(var(--accent) / 0.08)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as NetworkHour;
              return (
                <TipBox>
                  <div className="font-semibold">{String(r.hour).padStart(2, "0")}:00</div>
                  {r.cells ? (
                    <>
                      <div className="text-crowded">Crowded {pct(r.crowded_share)}</div>
                      <div className="text-standing">Standing {pct(r.standing_share)}</div>
                      <div className="text-seats">Seats {pct(r.seats_share)}</div>
                    </>
                  ) : <div className="text-muted">Not enough data</div>}
                </TipBox>
              );
            }}
          />
          <Bar dataKey="s" stackId="a" cursor="pointer" onClick={(_, i) => onHour(i)} isAnimationActive={false}>{cells("s", "rgb(var(--seats))")}</Bar>
          <Bar dataKey="st" stackId="a" cursor="pointer" onClick={(_, i) => onHour(i)} isAnimationActive={false}>{cells("st", "rgb(var(--standing))")}</Bar>
          <Bar dataKey="c" stackId="a" cursor="pointer" onClick={(_, i) => onHour(i)} radius={[3, 3, 0, 0]} isAnimationActive={false}>{cells("c", "rgb(var(--crowded))")}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One route across the day: relative crowding (0 to 100) with the model's level bands drawn in. */
export function RouteProfileChart({ data, hour }: { data: ProfileHour[]; hour: number }) {
  const byHour = new Map(data.map((d) => [d.hour, d]));
  const rows = Array.from({ length: 24 }, (_, h) => ({ hour: h, index: byHour.get(h)?.index ?? null }));
  return (
    <div className="h-36 w-full" role="img" aria-label="Crowding of this route by hour of day">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={rows} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="fillIdx" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--crowded))" stopOpacity={0.55} />
              <stop offset="45%" stopColor="rgb(var(--standing))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="rgb(var(--seats))" stopOpacity={0.12} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="3 3" />
          <XAxis dataKey="hour" tick={AXIS} tickLine={false} axisLine={false} interval={3} tickFormatter={(h) => String(h).padStart(2, "0")} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, 1]} ticks={[0, BANDS[0], BANDS[1], 1]} tickFormatter={(v) => String(Math.round(v * 100))} />
          <ReferenceLine y={BANDS[0]} stroke="rgb(var(--standing))" strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine y={BANDS[1]} stroke="rgb(var(--crowded))" strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine x={hour} stroke="rgb(var(--accent))" strokeWidth={2} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as { hour: number; index: number | null };
              return <TipBox><div className="font-semibold">{String(r.hour).padStart(2, "0")}:00</div><div>{r.index == null ? "No service or data" : `Crowding ${Math.round(r.index * 100)} / 100`}</div></TipBox>;
            }}
          />
          <Area type="monotone" dataKey="index" stroke="rgb(var(--ink))" strokeWidth={2} fill="url(#fillIdx)" connectNulls={false} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

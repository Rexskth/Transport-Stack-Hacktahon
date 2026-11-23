import type { Confidence, Level } from "./types";

export const LEVELS: Record<Level, { label: string; short: string; icon: string; color: string; bg: string; text: string }> = {
  seats: { label: "Seats available", short: "Seats", icon: "●", color: "rgb(var(--seats))", bg: "bg-seats/15", text: "text-seats" },
  standing: { label: "Standing room", short: "Standing", icon: "◐", color: "rgb(var(--standing))", bg: "bg-standing/15", text: "text-standing" },
  crowded: { label: "Crowded", short: "Crowded", icon: "▲", color: "rgb(var(--crowded))", bg: "bg-crowded/15", text: "text-crowded" },
  unknown: { label: "No data", short: "No data", icon: "?", color: "rgb(var(--unknown))", bg: "bg-unknown/15", text: "text-unknown" },
};

/** Percentile bands used by the model (see /meta). */
export const BANDS = [0.5, 0.85] as const;

export const levelOf = (index: number | null | undefined): Level =>
  index == null || !Number.isFinite(index) ? "unknown" : index <= BANDS[0] ? "seats" : index <= BANDS[1] ? "standing" : "crowded";

export const CONFIDENCE: Record<Confidence, { label: string; hint: string; dots: number }> = {
  high: { label: "Solid data", hint: "Most of this ride is backed by plenty of tickets.", dots: 3 },
  medium: { label: "Some data", hint: "Reasonable ticket coverage. Treat the level as a good estimate.", dots: 2 },
  low: { label: "Limited data", hint: "Little ticket data behind this. Treat the level as a rough guess.", dots: 1 },
};

/** Leaflet cannot read CSS variables, so resolve them to real colours at draw time. */
export function resolvedColors(): Record<Level, string> {
  if (typeof window === "undefined") return { seats: "#16a34a", standing: "#d97706", crowded: "#dc2626", unknown: "#64748b" };
  const s = getComputedStyle(document.documentElement);
  const rgb = (n: string) => `rgb(${s.getPropertyValue(n).trim().split(/\s+/).join(",")})`;
  return { seats: rgb("--seats"), standing: rgb("--standing"), crowded: rgb("--crowded"), unknown: rgb("--unknown") };
}

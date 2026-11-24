import type {
  CrowdingStretch, HeatRoute, HeatStretch, JourneysResponse, NetworkHour, Prefer, ProfileHour, Stop,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API ?? "";

export class ApiError extends Error {}

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${q.size ? "?" + q : ""}`, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Cannot reach the server. Is the API running on port 8000?");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  stops: (q: string, signal?: AbortSignal) => get<{ stops: Stop[] }>("/stops", { q, limit: 8 }, signal).then((r) => r.stops),
  journeys: (p: { from: string; to: string; depart: string; weekend: boolean; prefer: Prefer }, signal?: AbortSignal) =>
    get<JourneysResponse>("/journeys", { ...p, limit: 5 }, signal),
  heatRoutes: (p: { hour: number; weekend: boolean; min_confidence: string }, signal?: AbortSignal) =>
    get<{ items: HeatRoute[] }>("/heatmap", { ...p, by: "route", limit: 25 }, signal).then((r) => r.items),
  heatStretches: (p: { hour: number; weekend: boolean; min_confidence: string }, signal?: AbortSignal) =>
    get<{ items: HeatStretch[] }>("/heatmap", { ...p, by: "stretch", limit: 40 }, signal).then((r) => r.items),
  crowding: (p: { route: string; hour: number; weekend: boolean }, signal?: AbortSignal) =>
    get<{ stretches: CrowdingStretch[] }>("/crowding", p, signal).then((r) => r.stretches),
  profile: (route: string, weekend: boolean, signal?: AbortSignal) =>
    get<{ hours: ProfileHour[] }>(`/routes/${encodeURIComponent(route)}/profile`, { weekend }, signal).then((r) => r.hours),
  networkHourly: (weekend: boolean, min_confidence: string, signal?: AbortSignal) =>
    get<{ hours: NetworkHour[] }>("/network/hourly", { weekend, min_confidence }, signal).then((r) => r.hours),
};

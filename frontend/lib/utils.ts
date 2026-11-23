import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...a: ClassValue[]) => twMerge(clsx(a));

export const minutes = (m: number) => {
  const r = Math.round(m);
  return r >= 60 ? `${Math.floor(r / 60)} h ${r % 60} min` : `${r} min`;
};

export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Read the legacy and shareable URL parameters. */
export function readUrl() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

export function writeUrl(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  window.history.replaceState(null, "", q.size ? `?${q}` : window.location.pathname);
}

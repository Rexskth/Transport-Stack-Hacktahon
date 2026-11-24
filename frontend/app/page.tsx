"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { MousePointerClick } from "lucide-react";
import { About, Header, Panel, type Tab } from "@/components/Shell";
import { NetworkPanel, type NetworkState } from "@/components/NetworkPanel";
import { EXAMPLES, PlannerPanel, type PlannerState } from "@/components/PlannerPanel";
import { api } from "@/lib/api";
import type { Place } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { readUrl, writeUrl } from "@/lib/utils";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="h-full w-full bg-bg" /> });

const placeFromParam = (v?: string): Place | null => {
  if (!v) return null;
  const m = v.match(/^(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)$/);
  return m ? { label: `${(+m[1]).toFixed(4)}, ${(+m[3]).toFixed(4)}`, value: v, lat: +m[1], lon: +m[3] } : { label: v, value: v };
};

export default function Page() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [tab, setTab] = useState<Tab>("plan");
  const [about, setAbout] = useState(false);
  const [ready, setReady] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [vh, setVh] = useState(800);
  const [snap, setSnap] = useState<0 | 1 | 2>(1);
  const [hover, setHover] = useState<number | null>(null);

  const [p, setPs] = useState<PlannerState>({ from: null, to: null, depart: "08:30", weekend: false, prefer: "fast", loading: false, error: null, data: null, selected: 0 });
  const setP = useCallback((x: Partial<PlannerState>) => setPs((s) => ({ ...s, ...x })), []);
  const pRef = useRef(p);
  pRef.current = p;

  const [nv, setNv] = useState({ hour: 18, weekend: false, conf: "medium" as NetworkState["conf"], playing: false, selected: null as string | null });
  const setN = useCallback((x: Partial<NetworkState>) => {
    const { hour, weekend, conf, playing, selected } = x;
    setNv((s) => ({ ...s, ...(hour !== undefined && { hour }), ...(weekend !== undefined && { weekend }), ...(conf !== undefined && { conf }), ...(playing !== undefined && { playing }), ...(selected !== undefined && { selected }) }));
  }, []);

  /* ---------- environment ---------- */
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    const onResize = () => { setMobile(window.innerWidth < 1024); setVh(window.innerHeight); };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("theme", next); } catch { /* private mode */ }
    setTheme(next);
  };

  /* ---------- shareable links (also understands the old page's ?tab=ops) ---------- */
  useEffect(() => {
    const q = readUrl();
    if (q.tab === "ops" || q.tab === "network") setTab("network");
    if (q.hour) setNv((s) => ({ ...s, hour: Math.min(23, Math.max(0, +q.hour || 18)) }));
    if (q.weekend) { setPs((s) => ({ ...s, weekend: q.weekend === "true" })); setNv((s) => ({ ...s, weekend: q.weekend === "true" })); }
    setPs((s) => ({ ...s, from: placeFromParam(q.from), to: placeFromParam(q.to), depart: q.depart || s.depart, prefer: q.prefer === "comfort" ? "comfort" : "fast" }));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (tab === "plan") writeUrl({ from: p.from?.value, to: p.to?.value, depart: p.from && p.to ? p.depart : undefined, weekend: p.weekend ? "true" : undefined, prefer: p.prefer === "comfort" ? "comfort" : undefined });
    else writeUrl({ tab: "network", hour: String(nv.hour), weekend: nv.weekend ? "true" : undefined });
  }, [ready, tab, p.from, p.to, p.depart, p.weekend, p.prefer, nv.hour, nv.weekend]);

  /* ---------- planner ---------- */
  const abort = useRef<AbortController | null>(null);
  const search = useCallback(async () => {
    const s = pRef.current;
    if (!s.from || !s.to) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setP({ loading: true, error: null });
    try {
      const r = await api.journeys({ from: s.from.value, to: s.to.value, depart: s.depart || "08:30", weekend: s.weekend, prefer: s.prefer }, ctl.signal);
      const named = (pl: Place | null, o?: { name: string }) => (pl && o && pl.label === pl.value ? { ...pl, label: o.name } : pl);
      setPs((x) => ({ ...x, data: r, selected: 0, loading: false, from: named(x.from, r.origin[0]), to: named(x.to, r.destination[0]) }));
      setSnap((v) => (v === 0 ? 1 : v));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setP({ loading: false, error: (e as Error).message, data: null });
    }
  }, [setP]);

  // Search as soon as both places are set, and again when time, day or preference change.
  useEffect(() => {
    if (!ready || tab !== "plan" || !p.from || !p.to) return;
    const t = setTimeout(search, 250);
    return () => clearTimeout(t);
  }, [ready, tab, p.from?.value, p.to?.value, p.depart, p.weekend, p.prefer, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMapClick = (lat: number, lon: number) => {
    if (tab !== "plan") return;
    const pl: Place = { label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, value: `${lat.toFixed(5)},${lon.toFixed(5)}`, lat, lon };
    const s = pRef.current;
    if (!s.from || (s.from && s.to)) setP({ from: pl, to: null, data: null, error: null });
    else setP({ to: pl });
  };

  /* ---------- network ---------- */
  const netOn = tab === "network";
  const hourly = useAsync((sig) => api.networkHourly(nv.weekend, nv.conf, sig), [nv.weekend, nv.conf], netOn);
  const routes = useAsync((sig) => api.heatRoutes({ hour: nv.hour, weekend: nv.weekend, min_confidence: nv.conf }, sig), [nv.hour, nv.weekend, nv.conf], netOn);
  const hot = useAsync((sig) => api.heatStretches({ hour: nv.hour, weekend: nv.weekend, min_confidence: nv.conf }, sig), [nv.hour, nv.weekend, nv.conf], netOn);
  const profile = useAsync((sig) => api.profile(nv.selected!, nv.weekend, sig), [nv.selected, nv.weekend], netOn && !!nv.selected);
  const stretches = useAsync((sig) => api.crowding({ route: nv.selected!, hour: nv.hour, weekend: nv.weekend }, sig), [nv.selected, nv.hour, nv.weekend], netOn && !!nv.selected);

  useEffect(() => {
    if (!netOn || !nv.playing) return;
    const t = setInterval(() => setNv((s) => ({ ...s, hour: (s.hour + 1) % 24 })), 1100);
    return () => clearInterval(t);
  }, [netOn, nv.playing]);

  const netState: NetworkState = {
    ...nv,
    hourly: hourly.data,
    routes: routes.data,
    profile: nv.selected ? profile.data : null,
    stretches: nv.selected ? stretches.data : null,
    loading: routes.loading,
    error: routes.error ?? hourly.error,
  };

  /* ---------- map ---------- */
  const opt = p.data?.options[p.selected] ?? null;
  const hov = hover != null ? p.data?.options[hover] ?? null : null;
  const inset = mobile ? { left: 0, bottom: [150, Math.round(vh * 0.52), vh - 70][snap] } : { left: 460, bottom: 0 };

  return (
    <div className="fixed inset-0">
      <div className="absolute inset-0">
        <MapView
          theme={theme}
          mode={tab}
          option={opt}
          hover={hov}
          fromPin={p.from?.lat != null ? [p.from.lat, p.from.lon!] : opt ? [opt.legs[0].board.lat, opt.legs[0].board.lon] : null}
          toPin={p.to?.lat != null ? [p.to.lat, p.to.lon!] : opt ? [opt.legs.at(-1)!.alight.lat, opt.legs.at(-1)!.alight.lon] : null}
          hotspots={hot.data}
          routeStretches={nv.selected ? stretches.data : null}
          onMapClick={onMapClick}
          inset={inset}
        />
      </div>

      <Header tab={tab} onTab={(t) => { setTab(t); setHover(null); }} theme={theme} onTheme={toggleTheme} onAbout={() => setAbout(true)} />

      <Panel snap={snap} onSnap={setSnap} isMobile={mobile} vh={vh}>
        {tab === "plan" ? (
          <PlannerPanel
            s={p}
            set={setP}
            onSearch={search}
            onSwap={() => setP({ from: p.to, to: p.from })}
            onExample={(i) => setP({ from: EXAMPLES[i].from, to: EXAMPLES[i].to, depart: EXAMPLES[i].depart })}
            onHover={setHover}
          />
        ) : (
          <NetworkPanel s={netState} set={setN} />
        )}
      </Panel>

      {tab === "plan" && !p.from && !p.to && !mobile && (
        <div className="glass pointer-events-none absolute bottom-6 left-1/2 z-[800] -translate-x-1/2 translate-x-[220px] rounded-full px-4 py-2 text-sm text-muted shadow-float">
          <span className="flex items-center gap-2"><MousePointerClick size={16} /> Click the map to set A, then B</span>
        </div>
      )}

      <About open={about} onClose={() => setAbout(false)} />
    </div>
  );
}

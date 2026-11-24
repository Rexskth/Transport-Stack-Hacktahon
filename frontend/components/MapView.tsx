"use client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import { LEVELS, resolvedColors } from "@/lib/levels";
import type { CrowdingStretch, HeatStretch, JourneyOption, Level } from "@/lib/types";

// OpenStreetMap tiles; dark mode is a CSS filter on the tile pane (see globals.css). Needs no API key.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface MapProps {
  theme: "light" | "dark";
  mode: "plan" | "network";
  option: JourneyOption | null;
  hover: JourneyOption | null;
  fromPin: [number, number] | null;
  toPin: [number, number] | null;
  hotspots: HeatStretch[] | null;
  routeStretches: CrowdingStretch[] | null;
  onMapClick: (lat: number, lon: number) => void;
  /** pixels the floating panel covers, so fitted routes stay visible */
  inset: { left: number; bottom: number };
}

const pin = (color: string, label: string) =>
  L.divIcon({
    className: "",
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    html: `<div style="position:relative;width:30px;height:38px">
      <svg viewBox="0 0 30 38" width="30" height="38" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))"><path d="M15 1C7.8 1 2 6.7 2 13.8 2 23 15 37 15 37s13-14 13-23.2C28 6.7 22.2 1 15 1z" fill="${color}" stroke="#fff" stroke-width="2"/></svg>
      <span style="position:absolute;left:0;top:6px;width:30px;text-align:center;color:#fff;font:700 12px system-ui">${label}</span></div>`,
  });

function Clicks({ onMapClick }: { onMapClick: MapProps["onMapClick"] }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Fit({ points, inset, k }: { points: [number, number][]; inset: MapProps["inset"]; k: string }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [inset.left + 24, 90],
      paddingBottomRight: [24, inset.bottom + 24],
      maxZoom: 15,
      animate: !reducedMotion(),
      duration: 0.8,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return null;
}

/** A coloured polyline per stretch, with a white casing underneath so it reads on any map tile. */
function Colored({ path, levels, colors, weight = 6 }: { path: [number, number][]; levels: Level[]; colors: Record<Level, string>; weight?: number }) {
  return (
    <>
      <Polyline positions={path} pathOptions={{ color: "#fff", weight: weight + 4, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
      {path.slice(0, -1).map((p, i) => {
        const lv = levels[i] ?? "unknown";
        return (
          <Polyline
            key={i}
            positions={[p, path[i + 1]]}
            pathOptions={{ color: colors[lv], weight, opacity: lv === "unknown" ? 0.55 : 1, dashArray: lv === "unknown" ? "2 7" : undefined, lineCap: "round" }}
          />
        );
      })}
    </>
  );
}

export default function MapView(p: MapProps) {
  const colors = useMemo(() => resolvedColors(), [p.theme]);
  const legs = p.option?.legs ?? [];
  const fitPoints: [number, number][] = useMemo(() => {
    if (p.mode === "plan" && p.option) return p.option.legs.flatMap((l) => l.path);
    if (p.mode === "network" && p.routeStretches?.length) return p.routeStretches.map((s) => [s.lat, s.lon] as [number, number]);
    return [];
  }, [p.mode, p.option, p.routeStretches]);
  const fitKey = p.mode === "plan" ? `o:${p.option?.routes.join("+")}:${p.option?.leave_at}` : `r:${p.routeStretches?.[0]?.from_stop}:${p.routeStretches?.length}`;

  return (
    <MapContainer center={[28.62, 77.2]} zoom={11} zoomControl={false} zoomAnimation={!reducedMotion()} fadeAnimation={!reducedMotion()} className="h-full w-full" attributionControl>
      <TileLayer url={TILE_URL} maxZoom={19} attribution="© OpenStreetMap contributors" />
      <ZoomControl position="bottomright" />
      <Clicks onMapClick={p.onMapClick} />
      <Fit points={fitPoints} inset={p.inset} k={fitKey} />

      {p.mode === "plan" && (
        <>
          {p.hover && p.hover !== p.option && p.hover.legs.map((l, i) => (
            <Polyline key={`h${i}`} positions={l.path} pathOptions={{ color: "rgb(37,99,235)", weight: 4, opacity: 0.7, dashArray: "8 8" }} />
          ))}
          {legs.map((l, i) => <Colored key={i} path={l.path} levels={l.stretch_levels} colors={colors} />)}
          {legs.map((l, i) => (
            <span key={`m${i}`}>
              <CircleMarker center={[l.board.lat, l.board.lon]} radius={7} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }}>
                <Tooltip direction="top">Board {l.route}: {l.board.name}</Tooltip>
              </CircleMarker>
              <CircleMarker center={[l.alight.lat, l.alight.lon]} radius={7} pathOptions={{ color: "#fff", weight: 3, fillColor: "#111827", fillOpacity: 1 }}>
                <Tooltip direction="top">Get off: {l.alight.name}</Tooltip>
              </CircleMarker>
            </span>
          ))}
          {p.fromPin && <Marker position={p.fromPin} icon={pin("#2563eb", "A")} />}
          {p.toPin && <Marker position={p.toPin} icon={pin("#dc2626", "B")} />}
        </>
      )}

      {p.mode === "network" && (
        <>
          {p.routeStretches && p.routeStretches.length > 1 && (
            <Colored
              path={p.routeStretches.map((s) => [s.lat, s.lon] as [number, number])}
              levels={p.routeStretches.slice(0, -1).map((s) => s.level)}
              colors={colors}
              weight={7}
            />
          )}
          {!p.routeStretches?.length && p.hotspots?.map((h, i) => (
            <CircleMarker
              key={`${h.route}-${h.stretch}-${i}`}
              center={[h.lat, h.lon]}
              radius={Math.min(13, 5 + h.riders_per_bus * 0.7)}
              pathOptions={{ color: "#fff", weight: 2, fillColor: colors[h.level], fillOpacity: 0.85 }}
            >
              <Tooltip direction="top">
                <b>{h.route}</b>: {h.from_stop} → {h.to_stop}<br />{LEVELS[h.level].label} · {h.riders_per_bus.toFixed(1)} riders per bus
              </Tooltip>
            </CircleMarker>
          ))}
        </>
      )}
    </MapContainer>
  );
}

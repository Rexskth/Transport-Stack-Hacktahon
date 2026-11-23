"use client";
import { MapPin, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Place, Stop } from "@/lib/types";
import { cn } from "@/lib/utils";

const COORDS = /^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/;

/** Stop search combobox: type 2+ letters, arrow keys + Enter, or paste "lat,lon". */
export function PlaceInput({
  label, dot, value, onChange, placeholder,
}: {
  label: string;
  dot: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  placeholder: string;
}) {
  const id = useId();
  const [text, setText] = useState(value?.label ?? "");
  const [items, setItems] = useState<Stop[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const typing = useRef(false);

  // Follow outside changes (map click, example chips, swap).
  useEffect(() => {
    if (!typing.current) setText(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    const q = text.trim();
    if (!typing.current || q.length < 2 || COORDS.test(q)) { setItems([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        setItems(await api.stops(q, ctl.signal));
        setActive(0);
      } catch { /* ignore aborted or failed lookups; the user can keep typing */ }
      finally { setBusy(false); }
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [text]);

  const pick = (s: Stop) => {
    typing.current = false;
    setOpen(false);
    setText(s.stop_name);
    onChange({ label: s.stop_name, value: s.stop_id, lat: s.stop_lat, lon: s.stop_lon });
  };

  const commitText = () => {
    const m = text.match(COORDS);
    if (m) {
      typing.current = false;
      onChange({ label: `${(+m[1]).toFixed(4)}, ${(+m[3]).toFixed(4)}`, value: `${m[1]},${m[3]}`, lat: +m[1], lon: +m[3] });
    }
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className={cn("flex items-center gap-2 rounded-xl border bg-bg/60 px-3 transition-colors focus-within:border-accent", open && items.length ? "border-accent" : "border-line")}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-bg" style={{ background: dot }} aria-hidden />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && items[active] ? `${id}-${active}` : undefined}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={(e) => { typing.current = true; setText(e.target.value); setOpen(true); if (!e.target.value) onChange(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); typing.current = false; commitText(); setText((t) => (value ? value.label : t)); }, 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); setOpen(true); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { if (open && items[active]) { e.preventDefault(); pick(items[active]); } else commitText(); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
        />
        {text && (
          <button aria-label={`Clear ${label}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { typing.current = false; setText(""); onChange(null); setItems([]); }} className="rounded p-1 text-muted hover:text-ink">
            <X size={16} />
          </button>
        )}
      </div>
      {open && (items.length > 0 || busy) && (
        <ul id={`${id}-list`} role="listbox" className="glass absolute z-30 mt-1.5 max-h-72 w-full overflow-auto rounded-xl p-1 shadow-float scroll-thin">
          {items.map((s, i) => (
            <li
              key={s.stop_id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-sm", i === active ? "bg-accent/12" : "")}
            >
              <MapPin size={15} className="mt-0.5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.stop_name}</span>
                <span className="text-xs text-muted">{s.routes} route{s.routes === 1 ? "" : "s"} stop here</span>
              </span>
            </li>
          ))}
          {busy && items.length === 0 && <li className="px-3 py-2 text-sm text-muted">Searching…</li>}
        </ul>
      )}
    </div>
  );
}

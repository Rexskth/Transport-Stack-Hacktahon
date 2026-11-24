"use client";
import { useEffect, useState } from "react";

/** Fetch whenever `deps` change (and `enabled`), cancelling the previous request. Keeps old data while reloading. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[], enabled = true) {
  const [st, setSt] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: false });
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    setSt((s) => ({ ...s, loading: true, error: null }));
    fn(c.signal)
      .then((data) => setSt({ data, error: null, loading: false }))
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setSt({ data: null, error: e.message, loading: false });
      });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  return st;
}

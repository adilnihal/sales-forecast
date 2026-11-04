"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

/** Load data once and again whenever deps change. `slow` flips on after 4s so we can say "waking up". */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const runId = useRef(0);

  const reload = useCallback(() => {
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    setSlow(false);
    const timer = setTimeout(() => id === runId.current && setSlow(true), 4000);
    fnRef
      .current()
      .then((d) => id === runId.current && setData(d))
      .catch((e) => id === runId.current && setError(e instanceof ApiError ? e : new ApiError(String(e), 0)))
      .finally(() => {
        clearTimeout(timer);
        if (id === runId.current) {
          setLoading(false);
          setSlow(false);
        }
      });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, deps);
  return { data, error, loading, slow, reload };
}

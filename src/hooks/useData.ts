import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Hook genérico que ejecuta una función async y la re-ejecuta
 * automáticamente cada vez que el usuario navega a esta ruta.
 * Elimina el bug de datos stale al cambiar de panel.
 */
export function useData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const location = useLocation();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  // location.key cambia cada vez que React Router navega a esta ruta
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, ...deps]);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refresh: run };
}

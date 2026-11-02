import { useEffect, useState } from 'react';

const ATRASO_PADRAO_MS = 300;

/** Devolve `value` só depois de `delayMs` sem mudanças. O valor inicial é imediato. */
export function useDebounced<T>(value: T, delayMs: number = ATRASO_PADRAO_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

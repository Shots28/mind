import { useRef, useCallback } from 'react';

// Tracks IDs we recently wrote locally so the matching Realtime echo can be
// skipped. Without this, every local create/update would double-apply: once
// from the optimistic dispatch and once from the Realtime payload.
export function useRecentIds(ttlMs = 5000) {
  const ids = useRef(new Map());

  const add = useCallback((id) => {
    if (!id) return;
    ids.current.set(id, Date.now());
    for (const [key, time] of ids.current) {
      if (Date.now() - time > ttlMs) ids.current.delete(key);
    }
  }, [ttlMs]);

  const has = useCallback((id) => {
    if (!id) return false;
    return ids.current.has(id) && (Date.now() - ids.current.get(id)) < ttlMs;
  }, [ttlMs]);

  return { add, has };
}

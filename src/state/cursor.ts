import { useSyncExternalStore } from 'react';

let cursor: { x: number; y: number } | null = null;
const listeners = new Set<() => void>();

export function setCursor(next: { x: number; y: number } | null) {
  if (cursor && next && cursor.x === next.x && cursor.y === next.y) return;
  if (!cursor && !next) return;
  cursor = next;
  for (const l of listeners) l();
}

export function useCursor() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cursor,
    () => cursor,
  );
}

import { useSyncExternalStore } from 'react';

export interface PenAnchorSelection {
  nodeId: string;
  contour: number;
  index: number;
}

let current: PenAnchorSelection | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setPenAnchorSelection(next: PenAnchorSelection | null): void {
  const same =
    (!current && !next) ||
    (current &&
      next &&
      current.nodeId === next.nodeId &&
      current.contour === next.contour &&
      current.index === next.index);
  current = next;
  if (!same) emit();
}

export function getPenAnchorSelection(): PenAnchorSelection | null {
  return current;
}

export function usePenAnchorSelection(): PenAnchorSelection | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

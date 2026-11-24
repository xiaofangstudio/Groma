export type DashKind = 'solid' | 'dashed' | 'dotted' | 'custom';

const DASH_PRESETS: Record<Exclude<DashKind, 'custom'>, number[]> = {
  solid: [],
  dashed: [8, 6],
  dotted: [2, 4],
};

export function dashKind(dash: number[] | undefined): DashKind {
  const value = Array.isArray(dash) ? dash : [];
  if (value.length === 0) return 'solid';
  if (value.length === DASH_PRESETS.dashed.length && value.every((n, i) => n === DASH_PRESETS.dashed[i])) {
    return 'dashed';
  }
  if (value.length === DASH_PRESETS.dotted.length && value.every((n, i) => n === DASH_PRESETS.dotted[i])) {
    return 'dotted';
  }
  return 'custom';
}

export function dashForKind(kind: DashKind): number[] {
  if (kind === 'custom') return [...DASH_PRESETS.dashed];
  return [...DASH_PRESETS[kind]];
}

export function formatDash(dash: number[]): string {
  return dash.map((n) => String(Math.round(n * 100) / 100)).join(' ');
}

export function parseDashInput(text: string): number[] | null {
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length === 0) return [];
  const values: number[] = [];
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isFinite(value) || value <= 0) return null;
    values.push(Math.min(10000, Math.round(value * 100) / 100));
  }
  return values.length > 64 ? values.slice(0, 64) : values;
}

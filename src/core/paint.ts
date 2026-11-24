import type { Paint, PaintStop } from './types';

export type GradientPaint =
  | Extract<Paint, { type: 'linear' }>
  | Extract<Paint, { type: 'radial' }>;
export type GradientType = GradientPaint['type'];
type PaintOf<T extends GradientType> = Extract<GradientPaint, { type: T }>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeColor(color: string, fallback: string): string {
  const next = typeof color === 'string' ? color.trim() : '';
  return next || fallback;
}

function parseHexColor(color: string): [number, number, number] | null {
  const raw = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(raw);
  const full = /^#([0-9a-f]{6})$/i.exec(raw);
  const hex = full ? full[1] : short ? short[1].split('').map((c) => c + c).join('') : null;
  if (!hex) return null;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function mixHexColors(left: string, right: string, t: number): string {
  const a = parseHexColor(left);
  const b = parseHexColor(right);
  if (!a || !b) return left;
  const mix = a.map((value, index) => Math.round(value + (b[index] - value) * t));
  return `#${mix.map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function normalizeStops(stops: PaintStop[] | undefined, fallbackColor: string): PaintStop[] {
  if (!Array.isArray(stops) || stops.length === 0) {
    return [
      { offset: 0, color: fallbackColor, opacity: 1 },
      { offset: 1, color: fallbackColor, opacity: 0.2 },
    ];
  }
  return stops
    .map((stop, index) => ({
      offset: clamp(finite(stop.offset, 0), 0, 1),
      color: normalizeColor(stop.color, fallbackColor),
      opacity: clamp(finite(stop.opacity, 1), 0, 1),
      index,
    }))
    .sort((a, b) => a.offset - b.offset || a.index - b.index)
    .map(({ offset, color, opacity }) => ({ offset, color, opacity }));
}

export function isGradientPaint(paint: Paint | undefined): paint is GradientPaint {
  return Boolean(paint && (paint.type === 'linear' || paint.type === 'radial') && Array.isArray(paint.stops));
}

export function createGradient<T extends GradientType>(
  type: T,
  color: string,
  opacity: number,
  w: number,
  h: number,
): PaintOf<T> {
  const width = Math.max(1, finite(w, 1));
  const height = Math.max(1, finite(h, 1));
  const stops = normalizeStops(undefined, normalizeColor(color, '#D9D9D9'));
  const base = {
    type,
    color: stops[0].color,
    opacity: clamp(finite(opacity, 1), 0, 1),
    stops,
  };
  if (type === 'linear') {
    return { ...base, type: 'linear', x1: 0, y1: 0, x2: width, y2: 0 } as PaintOf<T>;
  }
  return {
    ...base,
    type: 'radial',
    cx: width / 2,
    cy: height / 2,
    r: Math.max(1, Math.hypot(width, height) / 2),
  } as PaintOf<T>;
}

export function toGradientPaint<T extends GradientType>(
  paint: Paint | undefined,
  type: T,
  fallbackColor: string,
  w: number,
  h: number,
): PaintOf<T> {
  if (isGradientPaint(paint)) {
    if (paint.type === type) return paint as PaintOf<T>;
    const width = Math.max(1, finite(w, 1));
    const height = Math.max(1, finite(h, 1));
    const stops = normalizeStops(paint.stops, paint.color);
    const base = {
      type,
      color: paint.color,
      opacity: paint.opacity,
      stops,
    };
    if (type === 'linear') {
      return { ...base, type: 'linear', x1: 0, y1: 0, x2: width, y2: 0 } as PaintOf<T>;
    }
    return {
      ...base,
      type: 'radial',
      cx: width / 2,
      cy: height / 2,
      r: Math.max(1, Math.hypot(width, height) / 2),
    } as PaintOf<T>;
  }
  return createGradient(type, paint?.color ?? fallbackColor, paint?.opacity ?? 1, w, h);
}

export function toSolidPaint(paint: Paint | undefined, fallbackColor: string): Paint {
  if (!paint || paint.type === 'solid') {
    return paint ?? { type: 'solid', color: fallbackColor, opacity: 1 };
  }
  const stop = paint.stops[0];
  return {
    type: 'solid',
    color: stop?.color ?? paint.color ?? fallbackColor,
    opacity: clamp(paint.opacity * (stop?.opacity ?? 1), 0, 1),
  };
}

export function updateGradientStops(paint: GradientPaint, stops: PaintStop[]): GradientPaint {
  return { ...paint, stops: normalizeStops(stops, paint.color) };
}

export function addGradientStop(paint: GradientPaint): GradientPaint {
  const stops = normalizeStops(paint.stops, paint.color);
  if (stops.length === 0) {
    return { ...paint, stops: [{ offset: 0, color: paint.color, opacity: 1 }] };
  }
  if (stops.length === 1) {
    const start = stops[0].offset === 0 ? 1 : 0;
    return updateGradientStops(paint, [...stops, { offset: start, color: stops[0].color, opacity: stops[0].opacity }]);
  }
  let gapIndex = 0;
  let gap = -1;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const size = stops[i + 1].offset - stops[i].offset;
    if (size > gap) {
      gap = size;
      gapIndex = i;
    }
  }
  const left = stops[gapIndex];
  const right = stops[gapIndex + 1];
  const offset = (left.offset + right.offset) / 2;
  const color = mixHexColors(left.color, right.color, 0.5);
  const opacity = (left.opacity + right.opacity) / 2;
  return updateGradientStops(paint, [...stops, { offset, color, opacity }]);
}

export function removeGradientStop(paint: GradientPaint, index: number): GradientPaint {
  if (paint.stops.length <= 2 || index < 0 || index >= paint.stops.length) return paint;
  return updateGradientStops(
    paint,
    paint.stops.filter((_, i) => i !== index),
  );
}

export function linearAngle(paint: Extract<GradientPaint, { type: 'linear' }>): number {
  const angle = (Math.atan2(paint.y2 - paint.y1, paint.x2 - paint.x1) * 180) / Math.PI;
  return ((Math.round(angle * 10) / 10) % 360 + 360) % 360;
}

export function rotateLinearGradient(
  paint: Extract<GradientPaint, { type: 'linear' }>,
  degrees: number,
): Extract<GradientPaint, { type: 'linear' }> {
  const angle = (finite(degrees, 0) * Math.PI) / 180;
  const centerX = (paint.x1 + paint.x2) / 2;
  const centerY = (paint.y1 + paint.y2) / 2;
  const length = Math.max(1, Math.hypot(paint.x2 - paint.x1, paint.y2 - paint.y1));
  const dx = (Math.cos(angle) * length) / 2;
  const dy = (Math.sin(angle) * length) / 2;
  return { ...paint, x1: centerX - dx, y1: centerY - dy, x2: centerX + dx, y2: centerY + dy };
}

function toCssColor(color: string, opacity: number): string {
  const raw = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(raw);
  const full = /^#([0-9a-f]{6})$/i.exec(raw);
  let hex: string | null = null;
  if (full) hex = full[1];
  else if (short) hex = short[1].split('').map((c) => c + c).join('');
  const alpha = clamp(finite(opacity, 1), 0, 1);
  if (!hex) return raw;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

export function paintPreview(paint: Paint, w: number, h: number): string {
  if (!isGradientPaint(paint)) return paint.color;
  const width = Math.max(1, finite(w, 1));
  const height = Math.max(1, finite(h, 1));
  const stops = paint.stops
    .slice()
    .sort((a, b) => a.offset - b.offset)
    .map((stop) => `${toCssColor(stop.color, stop.opacity)} ${Math.round(stop.offset * 1000) / 10}%`)
    .join(', ');
  if (paint.type === 'linear') {
    return `linear-gradient(${linearAngle(paint) + 90}deg, ${stops})`;
  }
  const cx = (paint.cx / width) * 100;
  const cy = (paint.cy / height) * 100;
  return `radial-gradient(circle at ${cx}% ${cy}%, ${stops})`;
}

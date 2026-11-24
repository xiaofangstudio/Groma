export type ParametricShapeKind = 'polygon' | 'star';
export type ShapeKind = ParametricShapeKind | 'arrow';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

function vertex(cx: number, cy: number, rx: number, ry: number, angle: number): string {
  return `${r2(cx + Math.cos(angle) * rx)} ${r2(cy + Math.sin(angle) * ry)}`;
}

/**
 * 正多边形路径；第一个顶点在正上方，边数限制 3–12。
 */
export function polygonPath(w: number, h: number, sides: number): string {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  const n = Math.round(clamp(sides, 3, 12));
  const cx = width / 2;
  const cy = height / 2;
  const points: string[] = [];
  for (let i = 0; i < n; i += 1) {
    points.push(vertex(cx, cy, cx, cy, -Math.PI / 2 + (i * Math.PI * 2) / n));
  }
  return `M ${points[0]} ${points.slice(1).map((p) => `L ${p}`).join(' ')} Z`;
}

/**
 * 星形路径；外顶点在正上方，内外半径交替，角数限制 3–12。
 */
export function starPath(w: number, h: number, points: number, innerRatio = 0.38): string {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  const n = Math.round(clamp(points, 3, 12));
  const ratio = clamp(innerRatio, 0.1, 0.9);
  const cx = width / 2;
  const cy = height / 2;
  const vertices: string[] = [];
  for (let i = 0; i < n * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / n;
    const scale = i % 2 === 0 ? 1 : ratio;
    vertices.push(vertex(cx, cy, cx * scale, cy * scale, angle));
  }
  return `M ${vertices[0]} ${vertices.slice(1).map((p) => `L ${p}`).join(' ')} Z`;
}

export function shapePath(kind: ParametricShapeKind, w: number, h: number, sides: number, innerRatio = 0.38): string {
  return kind === 'star' ? starPath(w, h, sides, innerRatio) : polygonPath(w, h, sides);
}

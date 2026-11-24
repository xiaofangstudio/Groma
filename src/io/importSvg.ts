/**
 * Vexa / SVG 图形导入。
 *
 * 只读“画”，不读工程：SVG 里的 path / rect / ellipse / text / group 会被转换成
 * Groma 可编辑节点。路径以 pathData 保存，保留了原始贝塞尔曲线；填充支持纯色、
 * 线性渐变、径向渐变，描边支持宽度、虚线、端帽与连接。
 */

import type { ImageAsset, Paint, PaintStop, Stroke, StrokeCap, StrokeJoin } from '../core/types';

export interface ImportedImageAsset {
  asset: ImageAsset;
  dataUrl: string;
}

export interface ImportedNode {
  type: 'group' | 'path' | 'text' | 'image';
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  fills: Paint[];
  strokes: Stroke[];
  children: ImportedNode[];
  pathData?: string;
  pathW?: number;
  pathH?: number;
  fillRule?: 'nonzero' | 'evenodd';
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  assetId?: string;
  asset?: ImageAsset;
  assetDataUrl?: string;
}

export interface ImportedFrame {
  name: string;
  w: number;
  h: number;
  background: string;
  children: ImportedNode[];
}

export interface SvgImport {
  name: string;
  frames: ImportedFrame[];
  warnings: string[];
  assets: ImportedImageAsset[];
}

type Matrix = [number, number, number, number, number, number];
type Point = { x: number; y: number };
type PathCommand = { cmd: 'M' | 'L' | 'C' | 'Q' | 'Z'; points: Point[] };

interface Style {
  fill: string | null;
  fillOpacity: number;
  fillRule: 'nonzero' | 'evenodd';
  stroke: string | null;
  strokeOpacity: number;
  strokeWidth: number;
  strokeDash: number[];
  strokeCap: StrokeCap;
  strokeJoin: StrokeJoin;
  opacity: number;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

interface GradientDef {
  type: 'linear' | 'radial';
  units: 'userSpaceOnUse' | 'objectBoundingBox';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  r: number;
  stops: PaintStop[];
}

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_STYLE: Style = {
  fill: '#000000',
  fillOpacity: 1,
  fillRule: 'nonzero',
  stroke: null,
  strokeOpacity: 1,
  strokeWidth: 1,
  strokeDash: [],
  strokeCap: 'butt',
  strokeJoin: 'miter',
  opacity: 1,
  fontSize: 16,
  fontWeight: 400,
  fontFamily: 'Segoe UI, Microsoft YaHei UI, sans-serif',
  italic: false,
  align: 'left',
  lineHeight: 1.3,
};

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function num(value: string | null | undefined, fallback = 0): number {
  if (!value) return fallback;
  const n = Number(value.trim().replace('%', ''));
  return Number.isFinite(n) ? n : fallback;
}

function parsePercent(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const raw = value.trim();
  if (raw.endsWith('%')) {
    const n = Number(raw.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function apply(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

function parseTransform(value: string | null): Matrix {
  if (!value) return IDENTITY;
  let out: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const name = match[1].toLowerCase();
    const args = match[2]
      .split(/[\s,]+/)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
    let next: Matrix = IDENTITY;
    if (name === 'matrix' && args.length >= 6) {
      next = [args[0], args[1], args[2], args[3], args[4], args[5]];
    } else if (name === 'translate' && args.length >= 1) {
      next = [1, 0, 0, 1, args[0], args[1] ?? 0];
    } else if (name === 'scale' && args.length >= 1) {
      next = [args[0], 0, 0, args[1] ?? args[0], 0, 0];
    } else if (name === 'rotate' && args.length >= 1) {
      const rad = (args[0] * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      if (args.length >= 3) {
        const cx = args[1];
        const cy = args[2];
        next = multiply(multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
      } else {
        next = [cos, sin, -sin, cos, 0, 0];
      }
    } else if (name === 'skewx' && args.length >= 1) {
      next = [1, 0, Math.tan((args[0] * Math.PI) / 180), 1, 0, 0];
    } else if (name === 'skewy' && args.length >= 1) {
      next = [1, Math.tan((args[0] * Math.PI) / 180), 0, 1, 0, 0];
    }
    out = multiply(out, next);
  }
  return out;
}

function styleOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = el.getAttribute('style');
  if (!raw) return out;
  for (const pair of raw.split(';')) {
    const at = pair.indexOf(':');
    if (at < 0) continue;
    out[pair.slice(0, at).trim().toLowerCase()] = pair.slice(at + 1).trim();
  }
  return out;
}

function attr(el: Element, name: string, css: Record<string, string>): string | null {
  return css[name] ?? el.getAttribute(name);
}

function parseCap(value: string | null): StrokeCap {
  return value === 'round' || value === 'square' ? value : 'butt';
}

function parseJoin(value: string | null): StrokeJoin {
  return value === 'round' || value === 'bevel' ? value : 'miter';
}

function parseDash(value: string | null): number[] {
  if (!value || value.trim() === 'none') return [];
  return value
    .split(/[\s,]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0);
}

function styleInherited(parent: Style, el: Element): Style {
  const css = styleOf(el);
  const fill = attr(el, 'fill', css);
  const stroke = attr(el, 'stroke', css);
  const opacity = attr(el, 'opacity', css);
  const fontSize = attr(el, 'font-size', css);
  const fontWeight = attr(el, 'font-weight', css);
  const fontFamily = attr(el, 'font-family', css);
  const fontStyle = attr(el, 'font-style', css);
  const direction = attr(el, 'text-anchor', css);
  const lineHeight = attr(el, 'line-height', css);

  return {
    ...parent,
    fill: fill === null ? parent.fill : fill === 'none' ? null : fill,
    fillOpacity: attr(el, 'fill-opacity', css) ? num(attr(el, 'fill-opacity', css), parent.fillOpacity) : parent.fillOpacity,
    fillRule:
      attr(el, 'fill-rule', css) === 'evenodd'
        ? 'evenodd'
        : attr(el, 'fill-rule', css) === 'nonzero'
          ? 'nonzero'
          : parent.fillRule,
    stroke: stroke === null ? parent.stroke : stroke === 'none' ? null : stroke,
    strokeOpacity: attr(el, 'stroke-opacity', css)
      ? num(attr(el, 'stroke-opacity', css), parent.strokeOpacity)
      : parent.strokeOpacity,
    strokeWidth: attr(el, 'stroke-width', css) ? num(attr(el, 'stroke-width', css), parent.strokeWidth) : parent.strokeWidth,
    strokeDash: attr(el, 'stroke-dasharray', css) ? parseDash(attr(el, 'stroke-dasharray', css)) : parent.strokeDash,
    strokeCap: attr(el, 'stroke-linecap', css) ? parseCap(attr(el, 'stroke-linecap', css)) : parent.strokeCap,
    strokeJoin: attr(el, 'stroke-linejoin', css) ? parseJoin(attr(el, 'stroke-linejoin', css)) : parent.strokeJoin,
    opacity: opacity ? num(opacity, parent.opacity) : parent.opacity,
    fontSize: fontSize ? num(fontSize, parent.fontSize) : parent.fontSize,
    fontWeight: fontWeight ? (fontWeight === 'bold' ? 700 : num(fontWeight, parent.fontWeight)) : parent.fontWeight,
    fontFamily: fontFamily ?? parent.fontFamily,
    italic: fontStyle === 'italic' || fontStyle === 'oblique' ? true : parent.italic,
    align: direction === 'middle' ? 'center' : direction === 'end' ? 'right' : parent.align,
    lineHeight: lineHeight ? num(lineHeight, parent.lineHeight) : parent.lineHeight,
  };
}

function makeStroke(style: Style, gradientMap: Map<string, GradientDef>): Stroke[] {
  if (!style.stroke || style.strokeWidth <= 0) return [];
  let color = style.stroke;
  if (style.stroke.startsWith('url(')) {
    const id = style.stroke.replace(/^url\(#/, '').replace(/\)$/, '');
    const grad = gradientMap.get(id);
    color = grad?.stops[0]?.color ?? '#000000';
  }
  return [
    {
      color,
      opacity: style.strokeOpacity,
      width: style.strokeWidth,
      dash: style.strokeDash,
      cap: style.strokeCap,
      join: style.strokeJoin,
    },
  ];
}

function parseStops(el: Element): PaintStop[] {
  return Array.from(el.querySelectorAll('stop')).map((stop) => ({
    offset: parsePercent(stop.getAttribute('offset'), 0),
    color: stop.getAttribute('stop-color') ?? '#000000',
    opacity: num(stop.getAttribute('stop-opacity'), 1),
  }));
}

function collectGradients(root: Element): Map<string, GradientDef> {
  const out = new Map<string, GradientDef>();
  for (const el of Array.from(root.querySelectorAll('linearGradient, radialGradient'))) {
    const id = el.getAttribute('id');
    if (!id) continue;
    const type = el.tagName.toLowerCase() === 'radialgradient' ? 'radial' : 'linear';
    const units = el.getAttribute('gradientUnits') === 'userSpaceOnUse' ? 'userSpaceOnUse' : 'objectBoundingBox';
    const stops = parseStops(el);
    if (stops.length === 0) continue;
    out.set(id, {
      type,
      units,
      x1: parsePercent(el.getAttribute('x1'), 0),
      y1: parsePercent(el.getAttribute('y1'), 0),
      x2: parsePercent(el.getAttribute('x2'), 1),
      y2: parsePercent(el.getAttribute('y2'), 0),
      cx: parsePercent(el.getAttribute('cx'), 0.5),
      cy: parsePercent(el.getAttribute('cy'), 0.5),
      r: parsePercent(el.getAttribute('r'), 0.5),
      stops,
    });
  }
  // href 继承：先复制一份，避免 grad 定义顺序影响。
  for (const el of Array.from(root.querySelectorAll('linearGradient, radialGradient'))) {
    const id = el.getAttribute('id');
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
    if (!id || !href || !href.startsWith('#')) continue;
    const source = out.get(href.slice(1));
    if (source && out.get(id)?.stops.length === 0) out.set(id, { ...source });
  }
  return out;
}

function makeFill(style: Style, bbox: BBox, gradientMap: Map<string, GradientDef>): Paint[] {
  if (!style.fill) return [];
  let color = style.fill;
  let paint: Paint;
  if (style.fill.startsWith('url(')) {
    const id = style.fill.replace(/^url\(#/, '').replace(/\)$/, '');
    const grad = gradientMap.get(id);
    if (grad) {
      color = grad.stops[0]?.color ?? '#000000';
      if (grad.type === 'linear') {
        const x1 = grad.units === 'userSpaceOnUse' ? grad.x1 : bbox.x + grad.x1 * bbox.w;
        const y1 = grad.units === 'userSpaceOnUse' ? grad.y1 : bbox.y + grad.y1 * bbox.h;
        const x2 = grad.units === 'userSpaceOnUse' ? grad.x2 : bbox.x + grad.x2 * bbox.w;
        const y2 = grad.units === 'userSpaceOnUse' ? grad.y2 : bbox.y + grad.y2 * bbox.h;
        paint = {
          type: 'linear',
          color,
          opacity: style.fillOpacity,
          x1: x1 - bbox.x,
          y1: y1 - bbox.y,
          x2: x2 - bbox.x,
          y2: y2 - bbox.y,
          stops: grad.stops,
        };
      } else {
        const cx = grad.units === 'userSpaceOnUse' ? grad.cx : bbox.x + grad.cx * bbox.w;
        const cy = grad.units === 'userSpaceOnUse' ? grad.cy : bbox.y + grad.cy * bbox.h;
        const r = grad.units === 'userSpaceOnUse' ? grad.r : grad.r * Math.max(bbox.w, bbox.h);
        paint = {
          type: 'radial',
          color,
          opacity: style.fillOpacity,
          cx: cx - bbox.x,
          cy: cy - bbox.y,
          r,
          stops: grad.stops,
        };
      }
      return [paint];
    }
    color = '#000000';
  }
  return [{ type: 'solid', color, opacity: style.fillOpacity }];
}

function tokenizePath(d: string): string[] {
  return d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
}

function parsePathData(d: string, warnings: string[]): { commands: PathCommand[]; bbox: BBox } {
  const tokens = tokenizePath(d);
  const commands: PathCommand[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let prevControl: Point | null = null;
  let lastQControl: Point | null = null;

  const isNumber = (value: string) => /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(value);
  const read = () => Number(tokens[i++]);
  const add = (c: PathCommand['cmd'], points: Point[]) => commands.push({ cmd: c, points });

  while (i < tokens.length) {
    if (!isNumber(tokens[i])) {
      cmd = tokens[i++];
    }
    if (!cmd) break;
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const dx = rel ? x : 0;
    const dy = rel ? y : 0;
    if (upper === 'Z') {
      add('Z', []);
      x = sx;
      y = sy;
      prevControl = null;
      lastQControl = null;
      continue;
    }
    if (upper === 'M') {
      const p = { x: read() + dx, y: read() + dy };
      add('M', [p]);
      x = p.x;
      y = p.y;
      sx = x;
      sy = y;
      prevControl = null;
      lastQControl = null;
      cmd = rel ? 'l' : 'L';
      continue;
    }
    if (upper === 'L') {
      const p = { x: read() + dx, y: read() + dy };
      add('L', [{ x, y }, p]);
      x = p.x;
      y = p.y;
      prevControl = null;
      lastQControl = null;
      continue;
    }
    if (upper === 'H') {
      const p = { x: read() + dx, y };
      add('L', [{ x, y }, p]);
      x = p.x;
      prevControl = null;
      lastQControl = null;
      continue;
    }
    if (upper === 'V') {
      const p = { x, y: read() + dy };
      add('L', [{ x, y }, p]);
      y = p.y;
      prevControl = null;
      lastQControl = null;
      continue;
    }
    if (upper === 'C') {
      const c1 = { x: read() + dx, y: read() + dy };
      const c2 = { x: read() + dx, y: read() + dy };
      const p = { x: read() + dx, y: read() + dy };
      add('C', [{ x, y }, c1, c2, p]);
      x = p.x;
      y = p.y;
      prevControl = c2;
      lastQControl = null;
      continue;
    }
    if (upper === 'S') {
      const c1: Point = prevControl ? { x: x * 2 - prevControl.x, y: y * 2 - prevControl.y } : { x, y };
      const c2 = { x: read() + dx, y: read() + dy };
      const p = { x: read() + dx, y: read() + dy };
      add('C', [{ x, y }, c1, c2, p]);
      x = p.x;
      y = p.y;
      prevControl = c2;
      lastQControl = null;
      continue;
    }
    if (upper === 'Q') {
      const c = { x: read() + dx, y: read() + dy };
      const p = { x: read() + dx, y: read() + dy };
      add('Q', [{ x, y }, c, p]);
      x = p.x;
      y = p.y;
      lastQControl = c;
      prevControl = null;
      continue;
    }
    if (upper === 'T') {
      const c: Point = lastQControl ? { x: x * 2 - lastQControl.x, y: y * 2 - lastQControl.y } : { x, y };
      const p = { x: read() + dx, y: read() + dy };
      add('Q', [{ x, y }, c, p]);
      x = p.x;
      y = p.y;
      lastQControl = c;
      prevControl = null;
      continue;
    }
    if (upper === 'A') {
      // Vexa 导出不使用弧线；通用 SVG 的弧线先按直线近似，并给出告警。
      const rx = read();
      const ry = read();
      const rotation = read();
      const large = read();
      const sweep = read();
      const p = { x: read() + dx, y: read() + dy };
      void rx;
      void ry;
      void rotation;
      void large;
      void sweep;
      add('L', [{ x, y }, p]);
      x = p.x;
      y = p.y;
      warnings.push('SVG 弧线按直线近似');
      prevControl = null;
      lastQControl = null;
      continue;
    }
    // 未知命令：跳到下一个命令，避免死循环。
    warnings.push(`SVG 路径命令 ${cmd} 不受支持`);
    i += 1;
  }

  return { commands, bbox: pathBBox(commands) };
}

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const t = i / 12;
    const mt = 1 - t;
    out.push({
      x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
      y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
    });
  }
  return out;
}

function sampleQuad(p0: Point, p1: Point, p2: Point): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const t = i / 12;
    const mt = 1 - t;
    out.push({
      x: mt ** 2 * p0.x + 2 * mt * t * p1.x + t ** 2 * p2.x,
      y: mt ** 2 * p0.y + 2 * mt * t * p1.y + t ** 2 * p2.y,
    });
  }
  return out;
}

function pathBBox(commands: PathCommand[]): BBox {
  const points: Point[] = [];
  for (const command of commands) {
    if (command.cmd === 'Z' || command.points.length === 0) continue;
    points.push(command.points[command.points.length - 1]);
    if (command.cmd === 'C' && command.points.length === 4) {
      points.push(...sampleCubic(command.points[0], command.points[1], command.points[2], command.points[3]));
    } else if (command.cmd === 'Q' && command.points.length === 3) {
      points.push(...sampleQuad(command.points[0], command.points[1], command.points[2]));
    }
  }
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxX = Math.max(...points.map((p) => p.x));
  const maxY = Math.max(...points.map((p) => p.y));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function transformCommands(commands: PathCommand[], matrix: Matrix): PathCommand[] {
  return commands.map((command) => ({
    cmd: command.cmd,
    points: command.points.map((p) => apply(matrix, p)),
  }));
}

function commandsToD(commands: PathCommand[]): string {
  const out: string[] = [];
  for (const command of commands) {
    const pts = command.points;
    if (command.cmd === 'Z') {
      out.push('Z');
      continue;
    }
    if (command.cmd === 'M') out.push(`M${fmt(pts[0].x)} ${fmt(pts[0].y)}`);
    else if (command.cmd === 'L') out.push(`L${fmt(pts[1].x)} ${fmt(pts[1].y)}`);
    else if (command.cmd === 'C') {
      out.push(`C${fmt(pts[1].x)} ${fmt(pts[1].y)} ${fmt(pts[2].x)} ${fmt(pts[2].y)} ${fmt(pts[3].x)} ${fmt(pts[3].y)}`);
    } else if (command.cmd === 'Q') {
      out.push(`Q${fmt(pts[1].x)} ${fmt(pts[1].y)} ${fmt(pts[2].x)} ${fmt(pts[2].y)}`);
    }
  }
  return out.join(' ');
}

function fmt(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function pathNode(
  name: string,
  commands: PathCommand[],
  bbox: BBox,
  style: Style,
  gradientMap: Map<string, GradientDef>,
  frameOrigin: Point,
): ImportedNode {
  const local = commandsToD(
    transformCommands(commands, [1, 0, 0, 1, -bbox.x, -bbox.y]),
  );
  return {
    type: 'path',
    name,
    x: bbox.x - frameOrigin.x,
    y: bbox.y - frameOrigin.y,
    w: Math.max(0.01, bbox.w),
    h: Math.max(0.01, bbox.h),
    opacity: style.opacity,
    fills: makeFill(style, bbox, gradientMap),
    strokes: makeStroke(style, gradientMap),
    children: [],
    pathData: local,
    pathW: Math.max(0.01, bbox.w),
    pathH: Math.max(0.01, bbox.h),
    fillRule: style.fillRule,
  };
}

function rectPath(x: number, y: number, w: number, h: number, rx: number, ry: number): PathCommand[] {
  const r = Math.max(0, Math.min(rx, w / 2));
  const rY = Math.max(0, Math.min(ry, h / 2));
  if (r <= 0 || rY <= 0) {
    return [
      { cmd: 'M', points: [{ x, y }] },
      { cmd: 'L', points: [{ x, y }, { x: x + w, y }] },
      { cmd: 'L', points: [{ x: x + w, y }, { x: x + w, y: y + h }] },
      { cmd: 'L', points: [{ x: x + w, y: y + h }, { x, y: y + h }] },
      { cmd: 'L', points: [{ x, y: y + h }, { x, y }] },
      { cmd: 'Z', points: [] },
    ];
  }
  return [
    { cmd: 'M', points: [{ x: x + r, y }] },
    { cmd: 'L', points: [{ x: x + r, y }, { x: x + w - r, y }] },
    { cmd: 'Q', points: [{ x: x + w - r, y }, { x: x + w, y }, { x: x + w, y: y + rY }] },
    { cmd: 'L', points: [{ x: x + w, y: y + rY }, { x: x + w, y: y + h - rY }] },
    { cmd: 'Q', points: [{ x: x + w, y: y + h - rY }, { x: x + w, y: y + h }, { x: x + w - r, y: y + h }] },
    { cmd: 'L', points: [{ x: x + w - r, y: y + h }, { x: x + r, y: y + h }] },
    { cmd: 'Q', points: [{ x: x + r, y: y + h }, { x, y: y + h }, { x, y: y + h - rY }] },
    { cmd: 'L', points: [{ x: x, y: y + h - rY }, { x, y: y + rY }] },
    { cmd: 'Q', points: [{ x, y: y + rY }, { x, y }, { x: x + r, y }] },
    { cmd: 'Z', points: [] },
  ];
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathCommand[] {
  const k = 0.5522847498307936;
  return [
    { cmd: 'M', points: [{ x: cx - rx, y: cy }] },
    {
      cmd: 'C',
      points: [
        { x: cx - rx, y: cy },
        { x: cx - rx, y: cy - ry * k },
        { x: cx - rx * k, y: cy - ry },
        { x: cx, y: cy - ry },
      ],
    },
    {
      cmd: 'C',
      points: [
        { x: cx, y: cy - ry },
        { x: cx + rx * k, y: cy - ry },
        { x: cx + rx, y: cy - ry * k },
        { x: cx + rx, y: cy },
      ],
    },
    {
      cmd: 'C',
      points: [
        { x: cx + rx, y: cy },
        { x: cx + rx, y: cy + ry * k },
        { x: cx + rx * k, y: cy + ry },
        { x: cx, y: cy + ry },
      ],
    },
    {
      cmd: 'C',
      points: [
        { x: cx, y: cy + ry },
        { x: cx - rx * k, y: cy + ry },
        { x: cx - rx, y: cy + ry * k },
        { x: cx - rx, y: cy },
      ],
    },
    { cmd: 'Z', points: [] },
  ];
}

function pointsPath(points: Array<{ x: number; y: number }>, close: boolean): PathCommand[] {
  if (points.length === 0) return [];
  const commands: PathCommand[] = [{ cmd: 'M', points: [points[0]] }];
  for (let i = 1; i < points.length; i += 1) {
    commands.push({ cmd: 'L', points: [points[i - 1], points[i]] });
  }
  if (close && points.length > 2) commands.push({ cmd: 'Z', points: [] });
  return commands;
}

function bboxOfNodes(nodes: ImportedNode[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    if (node.w <= 0 && node.h <= 0) continue;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function textLines(el: Element): string[] {
  const tspans = Array.from(el.querySelectorAll('tspan'))
    .map((tspan) => (tspan.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (tspans.length > 0) return tspans;
  return (el.textContent ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function measureLine(line: string, fs: number): number {
  let units = 0;
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x2e80 || (code >= 0x3000 && code <= 0x303f)) units += 1;
    else if (ch === ' ') units += 0.28;
    else if (/[A-Z0-9]/.test(ch)) units += 0.64;
    else if (/[a-z]/.test(ch)) units += 0.54;
    else units += 0.5;
  }
  return Math.max(1, units * fs);
}

function textNode(
  el: Element,
  style: Style,
  matrix: Matrix,
  frameOrigin: Point,
  gradientMap: Map<string, GradientDef>,
  warnings: string[],
): ImportedNode | null {
  const lines = textLines(el);
  if (lines.length === 0) return null;
  const xAttr = num(el.getAttribute('x'), 0);
  const yAttr = num(el.getAttribute('y'), 0);
  const baseline = apply(matrix, { x: xAttr, y: yAttr });
  const fs = Math.max(4, style.fontSize * Math.max(1, Math.abs(matrix[0]), Math.abs(matrix[3])));
  const lineHeight = fs * style.lineHeight;
  const w = Math.max(1, Math.max(...lines.map((line) => measureLine(line, fs))));
  const h = Math.max(fs, fs + (lines.length - 1) * lineHeight);
  const anchor = style.align === 'center' ? w / 2 : style.align === 'right' ? w : 0;
  const box = { x: baseline.x - frameOrigin.x - anchor, y: baseline.y - frameOrigin.y - fs * 0.82, w, h };
  if (Math.abs(matrix[1]) > 0.01 || Math.abs(matrix[2]) > 0.01) {
    warnings.push('旋转文字按水平方向导入');
  }
  return {
    type: 'text',
    name: lines[0].slice(0, 20),
    x: box.x,
    y: box.y,
    w,
    h,
    opacity: style.opacity,
    fills: makeFill(style, { x: baseline.x - anchor, y: baseline.y - fs * 0.82, w, h }, gradientMap),
    strokes: makeStroke(style, gradientMap),
    children: [],
    text: lines.join('\n'),
    fontSize: fs,
    fontWeight: style.fontWeight,
    fontFamily: style.fontFamily,
    italic: style.italic,
    align: style.align,
    lineHeight: style.lineHeight,
  };
}

let imageSeq = 0;

function imageNode(
  el: Element,
  matrix: Matrix,
  frameOrigin: Point,
  warnings: string[],
): ImportedNode | null {
  const rawW = num(el.getAttribute('width'));
  const rawH = num(el.getAttribute('height'));
  const href =
    el.getAttribute('href') ??
    el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
    el.getAttribute('xlink:href') ??
    '';
  if (!href) {
    warnings.push('SVG 图片缺少地址，已跳过');
    return null;
  }
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(href);
  if (!match) {
    warnings.push('SVG 图片只支持内嵌 PNG / JPG / WebP，已跳过外链图片');
    return null;
  }
  if (rawW <= 0 || rawH <= 0) {
    warnings.push('SVG 图片缺少宽高，已跳过');
    return null;
  }
  const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const base64 = match[2].replace(/\s/g, '');
  const x = num(el.getAttribute('x'));
  const y = num(el.getAttribute('y'));
  const corners = [
    apply(matrix, { x, y }),
    apply(matrix, { x: x + rawW, y }),
    apply(matrix, { x, y: y + rawH }),
    apply(matrix, { x: x + rawW, y: y + rawH }),
  ];
  const minX = Math.min(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxX = Math.max(...corners.map((p) => p.x));
  const maxY = Math.max(...corners.map((p) => p.y));
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  imageSeq += 1;
  const assetId = `asset-svg-${Date.now().toString(36)}-${imageSeq}`;
  const asset: ImageAsset = {
    id: assetId,
    name: (el.getAttribute('data-name') || el.getAttribute('id') || `图片 ${imageSeq}`).slice(0, 40),
    mime,
    file: `assets/${assetId}.${ext}`,
    w,
    h,
    bytes: Math.round(base64.length * 0.75),
  };
  return {
    type: 'image',
    name: asset.name,
    x: minX - frameOrigin.x,
    y: minY - frameOrigin.y,
    w,
    h,
    opacity: 1,
    fills: [],
    strokes: [],
    children: [],
    assetId,
    asset,
    assetDataUrl: href,
  };
}

function collectImageAssets(node: ImportedNode, out: Map<string, ImportedImageAsset>) {
  if (node.type === 'image' && node.asset && node.assetDataUrl) {
    out.set(node.asset.id, { asset: node.asset, dataUrl: node.assetDataUrl });
  }
  node.children.forEach((child) => collectImageAssets(child, out));
}

function parseElement(
  el: Element,
  inherited: Style,
  matrix: Matrix,
  frameOrigin: Point,
  gradientMap: Map<string, GradientDef>,
  warnings: string[],
): ImportedNode[] {
  const tag = el.tagName.toLowerCase();
  if (tag === 'defs' || tag === 'lineargradient' || tag === 'radialgradient' || tag === 'clippath' || tag === 'mask' || tag === 'marker') {
    return [];
  }
  const style = styleInherited(inherited, el);
  const localMatrix = multiply(matrix, parseTransform(el.getAttribute('transform')));

  if (tag === 'g' || tag === 'svg') {
    const children = Array.from(el.children).flatMap((child) =>
      parseElement(child, { ...style, opacity: 1 }, localMatrix, frameOrigin, gradientMap, warnings),
    );
    if (children.length === 0) return [];
    const box = bboxOfNodes(children);
    return [
      {
        type: 'group',
        name: el.getAttribute('data-name') ?? el.getAttribute('id') ?? '组',
        x: 0,
        y: 0,
        w: box.w,
        h: box.h,
        opacity: style.opacity,
        fills: [],
        strokes: [],
        children,
      },
    ];
  }

  if (tag === 'text') {
    const node = textNode(el, style, localMatrix, frameOrigin, gradientMap, warnings);
    return node ? [node] : [];
  }

  if (tag === 'image') {
    const node = imageNode(el, localMatrix, frameOrigin, warnings);
    return node ? [node] : [];
  }

  if (tag === 'use') {
    warnings.push('SVG <use> 引用暂不支持，已跳过');
    return [];
  }

  let commands: PathCommand[] | null = null;
  const shapeNames: Record<string, string> = {
    path: '路径',
    rect: '矩形',
    circle: '圆形',
    ellipse: '椭圆',
    line: '直线',
    polygon: '多边形',
    polyline: '折线',
  };
  let name = el.getAttribute('data-name') ?? el.getAttribute('id') ?? shapeNames[tag] ?? tag;
  if (tag === 'path') {
    const d = el.getAttribute('d');
    if (!d) return [];
    const parsed = parsePathData(d, warnings);
    commands = parsed.commands;
  } else if (tag === 'rect') {
    const w = num(el.getAttribute('width'));
    const h = num(el.getAttribute('height'));
    if (w <= 0 || h <= 0) return [];
    const rx = num(el.getAttribute('rx'), num(el.getAttribute('ry'), 0));
    const ry = num(el.getAttribute('ry'), rx);
    commands = rectPath(num(el.getAttribute('x')), num(el.getAttribute('y')), w, h, rx, ry);
  } else if (tag === 'circle') {
    const r = num(el.getAttribute('r'));
    if (r <= 0) return [];
    commands = ellipsePath(num(el.getAttribute('cx')), num(el.getAttribute('cy')), r, r);
  } else if (tag === 'ellipse') {
    const rx = num(el.getAttribute('rx'));
    const ry = num(el.getAttribute('ry'));
    if (rx <= 0 || ry <= 0) return [];
    commands = ellipsePath(num(el.getAttribute('cx')), num(el.getAttribute('cy')), rx, ry);
  } else if (tag === 'line') {
    commands = pointsPath(
      [
        { x: num(el.getAttribute('x1')), y: num(el.getAttribute('y1')) },
        { x: num(el.getAttribute('x2')), y: num(el.getAttribute('y2')) },
      ],
      false,
    );
  } else if (tag === 'polygon' || tag === 'polyline') {
    const raw = (el.getAttribute('points') ?? '')
      .split(/[\s,]+/)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
    const pts: Point[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) pts.push({ x: raw[i], y: raw[i + 1] });
    commands = pointsPath(pts, tag === 'polygon');
  } else {
    return [];
  }

  if (!commands || commands.length === 0) return [];
  const transformed = transformCommands(commands, localMatrix);
  const bbox = pathBBox(transformed);
  if (bbox.w <= 0 && bbox.h <= 0) return [];
  return [pathNode(name, transformed, bbox, style, gradientMap, frameOrigin)];
}

function findBoardBackground(group: Element): { color: string; rect: Element } | null {
  const rect = Array.from(group.children).find((child) => child.tagName.toLowerCase() === 'rect');
  if (!rect) return null;
  const fill = rect.getAttribute('fill');
  if (!fill || fill === 'none' || fill.startsWith('url(')) return null;
  return { color: fill, rect };
}

function parseViewBox(root: Element): BBox {
  const raw = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (raw.length === 4 && raw.every(Number.isFinite) && raw[2] > 0 && raw[3] > 0) {
    return { x: raw[0], y: raw[1], w: raw[2], h: raw[3] };
  }
  return {
    x: 0,
    y: 0,
    w: Math.max(1, num(root.getAttribute('width'), 800)),
    h: Math.max(1, num(root.getAttribute('height'), 600)),
  };
}

function nodeBBox(nodes: ImportedNode[]): BBox {
  return bboxOfNodes(nodes);
}

export function parseSvgDrawing(svgText: string, fallbackName = 'Vexa 图形'): SvgImport {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('不是有效的 SVG 文件');
  }
  const gradientMap = collectGradients(root);
  const warnings: string[] = [];
  const title = root.querySelector('title')?.textContent?.trim();
  const name = root.getAttribute('data-name')?.trim() || title || fallbackName || 'Vexa 图形';

  const boards = Array.from(root.children).filter((child) => {
    if (child.tagName.toLowerCase() !== 'g') return false;
    return /^board-/.test(child.getAttribute('id') ?? '') || Boolean(child.getAttribute('data-name'));
  });

  if (boards.length > 0) {
    const frames = boards.map((board, index) => {
      const bg = findBoardBackground(board);
      const bgBox = bg
        ? {
            x: num(bg.rect.getAttribute('x')),
            y: num(bg.rect.getAttribute('y')),
            w: Math.max(1, num(bg.rect.getAttribute('width'))),
            h: Math.max(1, num(bg.rect.getAttribute('height'))),
          }
        : null;
      const parsed = Array.from(board.children)
        .filter((child) => child !== bg?.rect)
        .flatMap((child) => parseElement(child, DEFAULT_STYLE, IDENTITY, { x: 0, y: 0 }, gradientMap, warnings));
      const box = bgBox ?? nodeBBox(parsed);
      const origin = { x: box.x, y: box.y };
      const shifted = parsed.map((node) => shiftNode(node, -origin.x, -origin.y));
      return {
        name: board.getAttribute('data-name') || board.getAttribute('id') || `${name} ${index + 1}`,
        w: Math.max(1, box.w),
        h: Math.max(1, box.h),
        background: bg?.color ?? '#FFFFFF',
        children: shifted,
      };
    });
    if (frames.length > 1) warnings.push(`已导入 ${frames.length} 个画板`);
    const imageAssets = new Map<string, ImportedImageAsset>();
    frames.forEach((frame) => frame.children.forEach((node) => collectImageAssets(node, imageAssets)));
    return { name, frames, warnings, assets: [...imageAssets.values()] };
  }

  const viewBox = parseViewBox(root);
  const parsed = Array.from(root.children).flatMap((child) =>
    parseElement(child, DEFAULT_STYLE, IDENTITY, { x: viewBox.x, y: viewBox.y }, gradientMap, warnings),
  );
  const shifted = parsed.map((node) => shiftNode(node, -viewBox.x, -viewBox.y));
  const imageAssets = new Map<string, ImportedImageAsset>();
  shifted.forEach((node) => collectImageAssets(node, imageAssets));
  return {
    name,
    frames: [
      {
        name,
        w: Math.max(1, viewBox.w),
        h: Math.max(1, viewBox.h),
        background: '#FFFFFF',
        children: shifted,
      },
    ],
    warnings,
    assets: [...imageAssets.values()],
  };
}

function shiftNode(node: ImportedNode, dx: number, dy: number): ImportedNode {
  if (node.type === 'group') {
    return {
      ...node,
      x: 0,
      y: 0,
      children: node.children.map((child) => shiftNode(child, dx, dy)),
    };
  }
  return {
    ...node,
    x: node.x + dx,
    y: node.y + dy,
    children: node.children.map((child) => shiftNode(child, dx, dy)),
  };
}

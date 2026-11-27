import type { GromaDoc, Paint, SceneNode, Stroke } from './types';
import { activeEffects } from './effects';
import { cornerRadiiOf } from './corners';
import { visibleFills } from './fills';

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function rgba(color: string, opacity: number): string {
  const full = /^#([0-9a-f]{6})$/i.exec(color.trim());
  const short = /^#([0-9a-f]{3})$/i.exec(color.trim());
  const hex = full ? full[1] : short ? short[1].split('').map((part) => part + part).join('') : null;
  if (!hex) return color;
  const alpha = Math.max(0, Math.min(1, opacity));
  return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${round(alpha)})`;
}

function paintValue(paint: Paint, stacked: boolean): string {
  if (paint.type === 'solid') {
    const color = rgba(paint.color, paint.opacity);
    return stacked ? `linear-gradient(${color}, ${color})` : color;
  }
  const stops = paint.stops
    .map((stop) => `${rgba(stop.color, stop.opacity * paint.opacity)} ${round(stop.offset * 100)}%`)
    .join(', ');
  if (paint.type === 'linear') {
    const angle = ((Math.atan2(paint.y2 - paint.y1, paint.x2 - paint.x1) * 180) / Math.PI + 90 + 360) % 360;
    return `linear-gradient(${round(angle)}deg, ${stops})`;
  }
  return `radial-gradient(circle ${round(paint.r)}px at ${round(paint.cx)}px ${round(paint.cy)}px, ${stops})`;
}

function strokeValue(stroke: Stroke): string {
  return `${round(stroke.width)}px ${stroke.dash.length > 0 ? 'dashed' : 'solid'} ${rgba(stroke.color, stroke.opacity)}`;
}

function classNameFor(node: SceneNode): string {
  const slug = node.name
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `.${slug || 'layer'}`;
}

/** 生成一段可直接粘贴的 CSS；定位相对父画板，尺寸/填充/描边/效果/文本属性都带上。 */
export function nodeCss(doc: GromaDoc, nodeId: string): string {
  const node = doc.nodes[nodeId];
  if (!node || node.type === 'page' || node.type === 'slice') return '';
  const parent = node.parentId ? doc.nodes[node.parentId] : null;
  const isRoot = !parent || parent.type === 'page';
  const lines: string[] = [];
  lines.push(`position: ${isRoot ? 'relative' : 'absolute'};`);
  if (!isRoot) {
    lines.push(`left: ${round(node.x)}px;`);
    lines.push(`top: ${round(node.y)}px;`);
  }
  lines.push(`width: ${round(node.w)}px;`);
  lines.push(`height: ${round(node.h)}px;`);
  lines.push('box-sizing: border-box;');
  if (node.opacity < 1) lines.push(`opacity: ${round(node.opacity)};`);
  if (node.rotation) lines.push(`transform: rotate(${round(node.rotation)}deg);`);
  if (node.visible === false) lines.push('display: none;');
  if (node.clipContent) lines.push('overflow: hidden;');
  const radii = cornerRadiiOf(node);
  if (radii.some((radius) => radius > 0)) lines.push(`border-radius: ${radii.map(round).join('px ')}px;`);
  if (node.type === 'ellipse') lines.push('border-radius: 50%;');
  const fills = visibleFills(node.fills);
  if (!node.imageFill && fills.length === 1 && fills[0].type === 'solid') {
    lines.push(`background-color: ${rgba(fills[0].color, fills[0].opacity)};`);
  } else if (!node.imageFill && fills.length > 0) {
    lines.push(`background-image: ${fills.map((paint) => paintValue(paint, fills.length > 1)).join(', ')};`);
  }
  const stroke = node.strokes?.[0];
  if (stroke && stroke.width > 0) lines.push(`border: ${strokeValue(stroke)};`);
  const shadows = activeEffects(node).filter((effect) => effect.type === 'drop-shadow');
  if (shadows.length > 0) {
    lines.push(
      `box-shadow: ${shadows.map((effect) => `${round(effect.x)}px ${round(effect.y)}px ${round(effect.blur)}px ${rgba(effect.color, effect.opacity)}`).join(', ')};`,
    );
  }
  const blurs = activeEffects(node).filter((effect) => effect.type === 'layer-blur');
  if (blurs.length > 0) lines.push(`filter: blur(${blurs.map((effect) => `${round(effect.blur)}px`).join(' ')});`);
  if (node.type === 'text') {
    const fs = node.fontSize ?? 24;
    lines.push(`font-family: ${node.fontFamily ?? 'sans-serif'};`);
    lines.push(`font-size: ${round(fs)}px;`);
    lines.push(`font-weight: ${node.fontWeight ?? 500};`);
    lines.push(`line-height: ${round(node.lineHeight ?? 1.3)};`);
    if ((node.letterSpacing ?? 0) !== 0) lines.push(`letter-spacing: ${round(node.letterSpacing ?? 0)}px;`);
    lines.push(`text-align: ${node.align ?? 'left'};`);
    if (node.italic) lines.push('font-style: italic;');
    const top = fills[0];
    if (top && top.type === 'solid') lines.push(`color: ${rgba(top.color, top.opacity)};`);
    lines.push('white-space: pre-wrap;');
  }
  return `${classNameFor(node)} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}\n`;
}

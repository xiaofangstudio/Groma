import type { GromaDoc, Paint, SceneNode } from '../core/types';
import { absolutePosition } from '../core/geometry';
import { activeEffects } from '../core/effects';
import { cornerRadiiOf } from '../core/corners';
import { visibleFills } from '../core/fills';
import { imageCropOf } from '../core/image';
import { imageFillBox } from '../core/imageFill';
import { getAssetDataUrl } from '../io/images';
import { renderNodeSvg } from './svg';

export interface HtmlExport {
  html: string;
  width: number;
  height: number;
}

const num = (value: number) => String(Math.round(value * 1000) / 1000);

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rgba(color: string, opacity: number): string {
  const alpha = Math.max(0, Math.min(1, opacity));
  const full = /^#([0-9a-f]{6})$/i.exec(color.trim());
  const short = /^#([0-9a-f]{3})$/i.exec(color.trim());
  const hex = full ? full[1] : short ? short[1].split('').map((part) => part + part).join('') : null;
  if (!hex) return color;
  return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${num(alpha)})`;
}

function gradientLayer(paint: Paint): string {
  const stops = paint.type === 'solid' ? `${rgba(paint.color, paint.opacity)} 0%, ${rgba(paint.color, paint.opacity)} 100%` : paint.stops
    .map((stop) => `${rgba(stop.color, stop.opacity * paint.opacity)} ${num(stop.offset * 100)}%`)
    .join(', ');
  if (paint.type === 'linear') {
    const angle = ((Math.atan2(paint.y2 - paint.y1, paint.x2 - paint.x1) * 180) / Math.PI + 90 + 360) % 360;
    return `linear-gradient(${num(angle)}deg, ${stops})`;
  }
  if (paint.type === 'radial') {
    return `radial-gradient(circle ${num(paint.r)}px at ${num(paint.cx)}px ${num(paint.cy)}px, ${stops})`;
  }
  return `linear-gradient(90deg, ${stops})`;
}

function fillBackground(node: SceneNode): string {
  if (node.imageFill) return '';
  const layers = visibleFills(node.fills).map((paint) => gradientLayer(paint));
  return layers.length > 0 ? `background-image:${layers.join(', ')};` : '';
}

function imageFillMarkup(doc: GromaDoc, node: SceneNode, width: number, height: number): string {
  const fill = node.imageFill;
  if (!fill) return '';
  const asset = doc.assets?.[fill.assetId];
  const data = asset ? getAssetDataUrl(fill.assetId) : null;
  if (!asset || !data) return '';
  const box = imageFillBox(asset.w, asset.h, width, height, fill);
  return `<img class="groma-img" alt="" src="${data}" style="left:${num(box.x)}px;top:${num(box.y)}px;width:${num(box.w)}px;height:${num(box.h)}px;opacity:${num(fill.opacity)}" />`;
}

function imageNodeMarkup(doc: GromaDoc, node: SceneNode): string {
  const asset = node.assetId ? doc.assets?.[node.assetId] : undefined;
  const data = asset ? getAssetDataUrl(asset.id) : null;
  if (!asset || !data) return '<div class="groma-missing">图片缺失</div>';
  const crop = imageCropOf(node);
  const displayW = node.w / Math.max(0.01, crop.w);
  const displayH = node.h / Math.max(0.01, crop.h);
  return `<img class="groma-img" alt="" src="${data}" style="left:${num(-crop.x * displayW)}px;top:${num(-crop.y * displayH)}px;width:${num(displayW)}px;height:${num(displayH)}px" />`;
}

function effectFilter(node: SceneNode): string {
  const parts: string[] = [];
  for (const effect of activeEffects(node)) {
    if (effect.type === 'layer-blur') parts.push(`blur(${num(effect.blur)}px)`);
    else if (effect.type === 'drop-shadow') {
      parts.push(`drop-shadow(${num(effect.x)}px ${num(effect.y)}px ${num(effect.blur)}px ${rgba(effect.color, effect.opacity)})`);
    }
  }
  return parts.length > 0 ? `filter:${parts.join(' ')};` : '';
}

function radiusStyle(node: SceneNode): string {
  const radii = cornerRadiiOf(node);
  return radii.some((radius) => radius > 0)
    ? `border-radius:${radii.map((radius) => `${num(radius)}px`).join(' ')};`
    : '';
}

function textMarkup(node: SceneNode, common: string): string {
  const fs = Math.max(1, node.fontSize ?? 24);
  const lineHeight = fs * (node.lineHeight ?? 1.3);
  const fills = visibleFills(node.fills);
  const top = fills[0];
  const paint =
    top && top.type !== 'solid'
      ? `background-image:${gradientLayer(top)};background-clip:text;-webkit-background-clip:text;color:transparent;`
      : `color:${top ? rgba(top.color, top.opacity) : 'transparent'};`;
  const lines = (node.text ?? '文本').split('\n');
  const content = lines
    .map((line, index) =>
      node.listStyle === 'bullet' ? `•  ${line}` : node.listStyle === 'number' ? `${index + 1}.  ${line}` : line,
    )
    .join('\n');
  return `<div class="groma-node groma-text" data-node="${esc(node.id)}" style="${common}font-family:${esc(node.fontFamily ?? '"Segoe UI", "Microsoft YaHei UI", sans-serif')};font-size:${num(fs)}px;font-weight:${node.fontWeight ?? 500};line-height:${num(lineHeight)}px;letter-spacing:${num(node.letterSpacing ?? 0)}px;text-align:${node.align ?? 'left'};font-style:${node.italic ? 'italic' : 'normal'};${paint}">${esc(content)}</div>`;
}

function nodeMarkup(doc: GromaDoc, node: SceneNode, rootX: number, rootY: number, isRoot = false): string {
  if (!node.visible || node.type === 'slice') return '';
  const position = absolutePosition(doc, node.id);
  const left = isRoot ? 0 : position.x - rootX;
  const top = isRoot ? 0 : position.y - rootY;
  const common = `position:absolute;left:${num(left)}px;top:${num(top)}px;width:${num(node.w)}px;height:${num(node.h)}px;opacity:${num(node.opacity)};${radiusStyle(node)}${effectFilter(node)}${node.rotation ? `transform:rotate(${num(node.rotation)}deg);transform-origin:center center;` : ''}`;
  if (node.type === 'text') {
    return textMarkup(node, common);
  }
  if (node.type === 'image') {
    return `<div class="groma-node" data-node="${esc(node.id)}" style="${common}overflow:hidden;">${imageNodeMarkup(doc, node)}</div>`;
  }
  if (node.type === 'path' || node.type === 'boolean') {
    const svg = renderNodeSvg(doc, node.id, true, 1);
    return svg
      ? `<div class="groma-node" data-node="${esc(node.id)}" style="${common}overflow:hidden;">${svg.svg}</div>`
      : '';
  }
  if (node.type === 'rect' || node.type === 'ellipse') {
    const ellipse = node.type === 'ellipse' ? 'border-radius:50%;' : '';
    return `<div class="groma-node" data-node="${esc(node.id)}" style="${common}${ellipse}overflow:hidden;${fillBackground(node)}">${imageFillMarkup(doc, node, node.w, node.h)}</div>`;
  }
  const children = node.children.map((id) => (doc.nodes[id] ? nodeMarkup(doc, doc.nodes[id], rootX, rootY) : '')).join('');
  return `<div class="groma-node" data-node="${esc(node.id)}" style="${common}${node.clipContent ? 'overflow:hidden;' : ''}${fillBackground(node)}">${imageFillMarkup(doc, node, node.w, node.h)}${children}</div>`;
}

function shell(title: string, width: number, height: number, body: string, transparent: boolean): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
html, body { margin: 0; min-height: 100%; background: ${transparent ? 'transparent' : '#ffffff'}; }
body { display: flex; align-items: flex-start; justify-content: flex-start; }
.groma-artboard { position: relative; overflow: hidden; flex: none; isolation: isolate; }
.groma-node { position: absolute; box-sizing: border-box; }
.groma-img { position: absolute; display: block; object-fit: fill; }
.groma-text { margin: 0; padding: 0; white-space: pre-wrap; overflow: hidden; word-break: break-word; }
.groma-missing { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: #6d685e; background: #f1efe9; font: 12px "Segoe UI", sans-serif; }
</style>
</head>
<body>
<main class="groma-artboard" style="width:${num(width)}px;height:${num(height)}px;background:${transparent ? 'transparent' : '#ffffff'}">
${body}
</main>
</body>
</html>
`;
}

/** 把画板/区块或任意图层导出成可独立打开的 HTML；文字保持可选可编辑。 */
export function renderFrameHtml(doc: GromaDoc, frameId: string, transparent = false): HtmlExport | null {
  const frame = doc.nodes[frameId];
  if (!frame || (frame.type !== 'frame' && frame.type !== 'section')) return null;
  const root = absolutePosition(doc, frame.id);
  const width = Math.max(1, frame.w);
  const height = Math.max(1, frame.h);
  const children = frame.children.map((id) => (doc.nodes[id] ? nodeMarkup(doc, doc.nodes[id], root.x, root.y) : '')).join('');
  const body = `<div class="groma-node" data-node="${esc(frame.id)}" style="left:0;top:0;width:${num(width)}px;height:${num(height)}px;opacity:${num(frame.opacity)};${fillBackground(frame)}">${imageFillMarkup(doc, frame, width, height)}${children}</div>`;
  return { html: shell(frame.name, width, height, body, transparent), width, height };
}

export function renderNodeHtml(doc: GromaDoc, nodeId: string, transparent = false): HtmlExport | null {
  const node = doc.nodes[nodeId];
  if (!node || node.type === 'page' || node.type === 'slice') return null;
  const root = absolutePosition(doc, node.id);
  const width = Math.max(1, node.w);
  const height = Math.max(1, node.h);
  const body = nodeMarkup(doc, node, root.x, root.y, true);
  return { html: shell(node.name, width, height, body, transparent), width, height };
}

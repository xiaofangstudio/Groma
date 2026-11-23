import type { GromaDoc, SceneNode } from '../core/types';
import { absoluteRect } from '../core/geometry';

export interface SvgExport {
  svg: string;
  width: number;
  height: number;
  scale: number;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function n(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function fillOf(node: SceneNode): { color: string; opacity: number } | null {
  const paint = node.fills[0];
  if (!paint || paint.opacity <= 0) return null;
  return { color: paint.color, opacity: paint.opacity };
}

function rectAttrs(x: number, y: number, w: number, h: number, radius: number): string {
  return `x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${radius > 0 ? ` rx="${n(radius)}"` : ''}`;
}

function paintAttrs(node: SceneNode): string {
  const fill = fillOf(node);
  if (!fill) return 'fill="none"';
  return `fill="${esc(fill.color)}" fill-opacity="${n(fill.opacity)}"`;
}

function emitNode(
  doc: GromaDoc,
  node: SceneNode,
  originX: number,
  originY: number,
  clipIndex: { value: number },
): string {
  if (!node.visible) return '';
  const r = absoluteRect(doc, node.id);
  const x = r.x - originX;
  const y = r.y - originY;
  const opacity = node.opacity < 1 ? ` opacity="${n(node.opacity)}"` : '';
  const body = (() => {
    if (node.type === 'rect') {
      return `<rect ${rectAttrs(x, y, r.w, r.h, node.cornerRadius)} ${paintAttrs(node)} />`;
    }
    if (node.type === 'ellipse') {
      const fill = fillOf(node);
      return `<ellipse cx="${n(x + r.w / 2)}" cy="${n(y + r.h / 2)}" rx="${n(r.w / 2)}" ry="${n(r.h / 2)}"${fill ? ` fill="${esc(fill.color)}" fill-opacity="${n(fill.opacity)}"` : ' fill="none"'} />`;
    }
    if (node.type === 'text') {
      const fill = fillOf(node) ?? { color: '#221C00', opacity: 1 };
      const fs = node.fontSize ?? 24;
      const lines = (node.text ?? '文本').split('\n');
      const spans = lines
        .map((line, index) => {
          const dy = index === 0 ? 0 : fs * 1.3;
          return `<tspan x="${n(x)}"${index === 0 ? '' : ` dy="${n(dy)}"`}>${esc(line)}</tspan>`;
        })
        .join('');
      return `<text x="${n(x)}" y="${n(y)}" font-family="Segoe UI, Microsoft YaHei UI, sans-serif" font-size="${n(fs)}" font-weight="${n(node.fontWeight ?? 500)}" fill="${esc(fill.color)}" fill-opacity="${n(fill.opacity)}" dominant-baseline="text-before-edge">${spans}</text>`;
    }

    const childSvg = node.children
      .map((id) => {
        const child = doc.nodes[id];
        return child ? emitNode(doc, child, originX, originY, clipIndex) : '';
      })
      .join('\n');

    if (node.type === 'frame' || node.type === 'section') {
      const fill = fillOf(node);
      const frameRect = fill || node.type === 'frame'
        ? `<rect ${rectAttrs(x, y, r.w, r.h, node.cornerRadius)} ${fill ? paintAttrs(node) : 'fill="none"'} stroke="#221C00" stroke-opacity="0.12" />`
        : '';
      if (node.clipContent && node.type === 'frame' && childSvg) {
        clipIndex.value += 1;
        const clipId = `groma-clip-${clipIndex.value}`;
        return `${frameRect}<clipPath id="${clipId}"><rect ${rectAttrs(x, y, r.w, r.h, node.cornerRadius)} /></clipPath><g clip-path="url(#${clipId})">${childSvg}</g>`;
      }
      return `${frameRect}${childSvg}`;
    }
    return childSvg;
  })();

  return opacity ? `<g${opacity}>${body}</g>` : body;
}

/**
 * 把单个画板/区块导出成 SVG。坐标按目标节点左上角归零；
 * 区块不画自身标签与边框，导出内容与 PNG 区块导出保持一致。
 */
export function renderFrameSvg(
  doc: GromaDoc,
  frameId: string,
  transparent = false,
  scale = 1,
): SvgExport | null {
  const frame = doc.nodes[frameId];
  if (!frame || (frame.type !== 'frame' && frame.type !== 'section')) return null;
  const safeScale = Math.max(0.5, Math.min(4, scale));
  const origin = absoluteRect(doc, frameId);
  const width = Math.max(1, Math.round(frame.w * safeScale));
  const height = Math.max(1, Math.round(frame.h * safeScale));
  const fill = fillOf(frame);
  const background = transparent
    ? ''
    : `<rect x="0" y="0" width="${n(frame.w)}" height="${n(frame.h)}" fill="${esc(fill?.color ?? '#FFFFFF')}" />`;
  const clipIndex = { value: 0 };
  const children = frame.children
    .map((id) => {
      const child = doc.nodes[id];
      return child ? emitNode(doc, child, origin.x, origin.y, clipIndex) : '';
    })
    .join('\n');
  const body = frame.clipContent
    ? (() => {
        const clipId = 'groma-clip-export';
        return `<clipPath id="${clipId}"><rect x="0" y="0" width="${n(frame.w)}" height="${n(frame.h)}" rx="${n(frame.cornerRadius)}" /></clipPath><g clip-path="url(#${clipId})">${children}</g>`;
      })()
    : children;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${n(frame.w)} ${n(frame.h)}">\n${background}${body}\n</svg>`;
  return { svg, width: frame.w, height: frame.h, scale: safeScale };
}

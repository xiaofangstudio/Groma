import type { GromaDoc, Paint, SceneNode } from '../core/types';
import { absoluteRect } from '../core/geometry';
import { nodePathContours, penPathData } from '../core/pen';
import { nodeWorldRings } from '../core/boolean';
import { maskIndexForParent, maskTypeOf } from '../core/mask';
import { imageCropOf, isFullImageCrop } from '../core/image';
import { imageFillBox } from '../core/imageFill';
import { getAssetDataUrl } from '../io/images';

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

function fillOf(node: SceneNode): Paint | null {
  const paint = node.fills[0];
  if (!paint || paint.opacity <= 0) return null;
  return paint;
}

interface Defs {
  items: string[];
  seq: number;
}

function stopsSvg(paint: Extract<Paint, { type: 'linear' | 'radial' }>): string {
  return paint.stops
    .map(
      (stop) =>
        `<stop offset="${n(stop.offset)}" stop-color="${esc(stop.color)}"${
          stop.opacity < 1 ? ` stop-opacity="${n(stop.opacity)}"` : ''
        } />`,
    )
    .join('');
}

function paintAttrs(node: SceneNode, defs: Defs): string {
  const paint = fillOf(node);
  if (!paint) return 'fill="none"';
  if (paint.type === 'linear') {
    defs.seq += 1;
    const id = `groma-grad-${defs.seq}`;
    defs.items.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(paint.x1)}" y1="${n(paint.y1)}" x2="${n(paint.x2)}" y2="${n(paint.y2)}">${stopsSvg(paint)}</linearGradient>`,
    );
    return `fill="url(#${id})" fill-opacity="${n(paint.opacity)}"`;
  }
  if (paint.type === 'radial') {
    defs.seq += 1;
    const id = `groma-grad-${defs.seq}`;
    defs.items.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(paint.cx)}" cy="${n(paint.cy)}" r="${n(paint.r)}">${stopsSvg(paint)}</radialGradient>`,
    );
    return `fill="url(#${id})" fill-opacity="${n(paint.opacity)}"`;
  }
  return `fill="${esc(paint.color)}" fill-opacity="${n(paint.opacity)}"`;
}

function strokeAttrs(node: SceneNode): string {
  const stroke = node.strokes?.[0];
  if (!stroke || stroke.width <= 0 || stroke.opacity <= 0) return '';
  const dash = stroke.dash.length > 0 ? ` stroke-dasharray="${stroke.dash.map(n).join(' ')}"` : '';
  return ` stroke="${esc(stroke.color)}" stroke-opacity="${n(stroke.opacity)}" stroke-width="${n(stroke.width)}" stroke-linecap="${stroke.cap}" stroke-linejoin="${stroke.join}"${dash}`;
}

function rectAttrs(x: number, y: number, w: number, h: number, radius: number): string {
  return `x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${radius > 0 ? ` rx="${n(radius)}"` : ''}`;
}

/** 在给定局部框内输出图片填充；clipBody 与 boxW/boxH 使用同一坐标系。 */
function imageFillMarkup(
  doc: GromaDoc,
  node: SceneNode,
  defs: Defs,
  boxW: number,
  boxH: number,
  clipBody: string,
): string | null {
  const fill = node.imageFill;
  const asset = fill ? doc.assets?.[fill.assetId] : undefined;
  const dataUrl = asset ? getAssetDataUrl(asset.id) : null;
  if (!fill || !asset || !dataUrl) return null;
  const box = imageFillBox(asset.w, asset.h, boxW, boxH, fill);
  defs.seq += 1;
  const clipId = `groma-image-fill-${defs.seq}`;
  defs.items.push(`<clipPath id="${clipId}">${clipBody}</clipPath>`);
  return `<g clip-path="url(#${clipId})"><image x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" href="${esc(dataUrl)}" preserveAspectRatio="none"${fill.opacity < 1 ? ` opacity="${n(fill.opacity)}"` : ''} /></g>`;
}

function ringsToPath(doc: GromaDoc, mask: SceneNode, originX: number, originY: number): string {
  return nodeWorldRings(doc, mask)
    .filter((ring) => ring.length >= 3)
    .map((ring) => {
      const points = ring.map(([x, y]) => `${n(x - originX)} ${n(y - originY)}`);
      return `M ${points.join(' L ')} Z`;
    })
    .join(' ');
}

function emitChildren(
  doc: GromaDoc,
  node: SceneNode,
  originX: number,
  originY: number,
  clipIndex: { value: number },
  defs: Defs,
  hideChrome: boolean,
): string {
  const maskIndex = maskIndexForParent(doc, node);
  const below = node.children
    .slice(0, maskIndex >= 0 ? maskIndex : node.children.length)
    .filter((id) => !doc.nodes[id]?.isMask)
    .map((id) => {
      const child = doc.nodes[id];
      return child ? emitNode(doc, child, originX, originY, clipIndex, defs, hideChrome) : '';
    })
    .join('\n');
  if (maskIndex < 0) return below;
  const mask = doc.nodes[node.children[maskIndex]];
  if (!mask) return below;
  const above = node.children
    .slice(maskIndex + 1)
    .filter((id) => !doc.nodes[id]?.isMask)
    .map((id) => {
      const child = doc.nodes[id];
      return child ? emitNode(doc, child, originX, originY, clipIndex, defs, hideChrome) : '';
    })
    .join('\n');
  const path = ringsToPath(doc, mask, originX, originY);
  const type = maskTypeOf(mask);
  if (!path && type === 'geometry') return `${below}${above}`;
  clipIndex.value += 1;
  if (type === 'geometry') {
    const clipId = `groma-mask-${clipIndex.value}`;
    defs.items.push(`<clipPath id="${clipId}"><path d="${esc(path)}" fill-rule="evenodd" /></clipPath>`);
    return `${below}<g clip-path="url(#${clipId})">${above}</g>`;
  }
  const maskId = `groma-mask-${clipIndex.value}`;
  const maskContent = emitNode(doc, mask, originX, originY, clipIndex, defs, true);
  const maskType = type === 'alpha' ? 'alpha' : 'luminance';
  defs.items.push(
    `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000" mask-type="${maskType}" style="mask-type:${maskType}">${maskContent}</mask>`,
  );
  return `${below}<g mask="url(#${maskId})">${above}</g>`;
}

function emitNode(
  doc: GromaDoc,
  node: SceneNode,
  originX: number,
  originY: number,
  clipIndex: { value: number },
  defs: Defs,
  hideChrome = false,
): string {
  if (!node.visible) return '';
  const r = absoluteRect(doc, node.id);
  const x = r.x - originX;
  const y = r.y - originY;
  const opacity = node.opacity < 1 ? ` opacity="${n(node.opacity)}"` : '';
  const body = (() => {
    if (node.type === 'rect') {
      if (node.imageFill) {
        const body = imageFillMarkup(doc, node, defs, r.w, r.h, `<rect ${rectAttrs(0, 0, r.w, r.h, node.cornerRadius)} />`);
        if (body) {
          return `<g transform="translate(${n(x)} ${n(y)})">${body}<rect ${rectAttrs(0, 0, r.w, r.h, node.cornerRadius)} fill="none"${strokeAttrs(node)} /></g>`;
        }
      }
      return `<rect ${rectAttrs(x, y, r.w, r.h, node.cornerRadius)} ${paintAttrs(node, defs)}${strokeAttrs(node)} />`;
    }
    if (node.type === 'ellipse') {
      if (node.imageFill) {
        const body = imageFillMarkup(
          doc,
          node,
          defs,
          r.w,
          r.h,
          `<ellipse cx="${n(r.w / 2)}" cy="${n(r.h / 2)}" rx="${n(r.w / 2)}" ry="${n(r.h / 2)}" />`,
        );
        if (body) {
          return `<g transform="translate(${n(x)} ${n(y)})">${body}<ellipse cx="${n(r.w / 2)}" cy="${n(r.h / 2)}" rx="${n(r.w / 2)}" ry="${n(r.h / 2)}" fill="none"${strokeAttrs(node)} /></g>`;
        }
      }
      return `<ellipse cx="${n(x + r.w / 2)}" cy="${n(y + r.h / 2)}" rx="${n(r.w / 2)}" ry="${n(r.h / 2)}" ${paintAttrs(node, defs)}${strokeAttrs(node)} />`;
    }
    if (node.type === 'path') {
      if (!node.pathData) return '';
      const sourceW = Math.max(0.01, node.pathW ?? r.w);
      const sourceH = Math.max(0.01, node.pathH ?? r.h);
      const sx = r.w / sourceW;
      const sy = r.h / sourceH;
      const transform = `translate(${n(x)} ${n(y)})${sx !== 1 || sy !== 1 ? ` scale(${n(sx)} ${n(sy)})` : ''}`;
      const head =
        node.shapeKind === 'arrow' && node.arrowHeadData && node.strokes?.[0] && node.strokes[0].opacity > 0 && node.strokes[0].width > 0
          ? `<path d="${esc(node.arrowHeadData)}" transform="${transform}" fill="${esc(node.strokes[0].color)}" fill-opacity="${n(node.strokes[0].opacity)}" />`
          : '';
      if (node.pathContours?.length) {
        const contours = nodePathContours(node);
        const closedData = contours
          .filter((contour) => contour.closed && contour.anchors.length >= 3)
          .map((contour) => penPathData(contour.anchors, true))
          .filter(Boolean)
          .join(' ');
        const openData = contours
          .filter((contour) => !contour.closed)
          .map((contour) => penPathData(contour.anchors, false))
          .filter(Boolean)
          .join(' ');
        const filled = closedData
          ? (() => {
              const imageBody = node.imageFill
                ? imageFillMarkup(doc, node, defs, sourceW, sourceH, `<path d="${esc(closedData)}" fill-rule="${node.fillRule ?? 'nonzero'}" />`)
                : null;
              if (imageBody) {
                return `<g transform="${transform}">${imageBody}<path d="${esc(closedData)}" fill="none"${strokeAttrs(node)} /></g>`;
              }
              return `<path d="${esc(closedData)}" transform="${transform}" fill-rule="${node.fillRule ?? 'nonzero'}" ${paintAttrs(node, defs)}${strokeAttrs(node)} />`;
            })()
          : '';
        const open = openData
          ? `<path d="${esc(openData)}" transform="${transform}" fill="none"${strokeAttrs(node)} />`
          : '';
        return `${filled}${open}${head}`;
      }
      const imageBody = node.imageFill
        ? imageFillMarkup(doc, node, defs, sourceW, sourceH, `<path d="${esc(node.pathData)}" fill-rule="${node.fillRule ?? 'nonzero'}" />`)
        : null;
      if (imageBody) {
        return `<g transform="${transform}">${imageBody}<path d="${esc(node.pathData)}" fill="none"${strokeAttrs(node)} /></g>${head}`;
      }
      return `<path d="${esc(node.pathData)}" transform="${transform}" fill-rule="${node.fillRule ?? 'nonzero'}" ${paintAttrs(node, defs)}${strokeAttrs(node)} />${head}`;
    }
    if (node.type === 'image') {
      const asset = node.assetId ? doc.assets?.[node.assetId] : undefined;
      const dataUrl = asset ? getAssetDataUrl(asset.id) : null;
      if (!dataUrl) {
        return `<rect ${rectAttrs(x, y, r.w, r.h, node.cornerRadius)} fill="#F1EFE9" stroke="#221C00" stroke-opacity="0.22" />`;
      }
      const crop = imageCropOf(node);
      const full = isFullImageCrop(crop);
      if (!full) {
        defs.seq += 1;
        const clipId = `groma-image-crop-${defs.seq}`;
        defs.items.push(`<clipPath id="${clipId}"><rect ${rectAttrs(x, y, r.w, r.h, node.cornerRadius)} /></clipPath>`);
        const drawW = r.w / crop.w;
        const drawH = r.h / crop.h;
        return `<g clip-path="url(#${clipId})"${opacity}><image x="${n(x - crop.x * drawW)}" y="${n(y - crop.y * drawH)}" width="${n(drawW)}" height="${n(drawH)}" href="${esc(dataUrl)}" preserveAspectRatio="none" /></g>`;
      }
      const imageTag = `<image x="${n(x)}" y="${n(y)}" width="${n(r.w)}" height="${n(r.h)}" href="${esc(dataUrl)}" preserveAspectRatio="none"${opacity} />`;
      if (node.cornerRadius > 0) {
        defs.seq += 1;
        const clipId = `groma-image-clip-${defs.seq}`;
        defs.items.push(`<clipPath id="${clipId}"><rect ${rectAttrs(x, y, r.w, r.h, node.cornerRadius)} /></clipPath>`);
        return `<g clip-path="url(#${clipId})">${imageTag}</g>`;
      }
      return imageTag;
    }
    if (node.type === 'text') {
      const fs = node.fontSize ?? 24;
      const lines = (node.text ?? '文本').split('\n');
      const lineHeight = fs * (node.lineHeight ?? 1.3);
      const family = node.fontFamily ?? 'Segoe UI, Microsoft YaHei UI, sans-serif';
      const italic = node.italic ? ' font-style="italic"' : '';
      const spacing = node.letterSpacing !== undefined && node.letterSpacing !== 0 ? ` letter-spacing="${n(node.letterSpacing)}"` : '';
      const anchor = node.align === 'center' ? 'middle' : node.align === 'right' ? 'end' : 'start';
      const textX = node.align === 'center' ? x + r.w / 2 : node.align === 'right' ? x + r.w : x;
      const step = lineHeight + (node.paragraphSpacing ?? 0);
      const spans = lines
        .map((line, index) => {
          const display = node.listStyle === 'bullet' ? `•  ${line}` : node.listStyle === 'number' ? `${index + 1}.  ${line}` : line;
          const dy = index === 0 ? 0 : step;
          return `<tspan x="${n(textX)}"${index === 0 ? '' : ` dy="${n(dy)}"`}>${esc(display)}</tspan>\n`;
        })
        .join('');
      return `<text x="${n(textX)}" y="${n(y)}" font-family="${esc(family)}" font-size="${n(fs)}" font-weight="${n(node.fontWeight ?? 500)}"${italic}${spacing} text-anchor="${anchor}" ${paintAttrs(node, defs)} dominant-baseline="text-before-edge">${spans}</text>`;
    }

    const childSvg = emitChildren(doc, node, originX, originY, clipIndex, defs, hideChrome);

    if (node.type === 'frame' || node.type === 'section') {
      const fill = fillOf(node);
      const frameRect = fill || !hideChrome
        ? `<rect ${rectAttrs(x, y, r.w, r.h, node.cornerRadius)} ${fill ? paintAttrs(node, defs) : 'fill="none"'}${hideChrome ? '' : ' stroke="#221C00" stroke-opacity="0.12"'} />`
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
 * 切片 SVG：以切片矩形为零点重绘整页可见节点，外层 viewBox 只保留切片区域。
 * 切片自身不产生任何 SVG 节点，所以编辑态虚线不会混进导出文件。
 */
export function renderSliceSvg(
  doc: GromaDoc,
  sliceId: string,
  transparent = false,
  scale = 1,
): SvgExport | null {
  const slice = doc.nodes[sliceId];
  if (!slice || slice.type !== 'slice') return null;
  let root: SceneNode | undefined = doc.nodes[sliceId];
  let guard = 0;
  while (root && root.type !== 'page' && root.parentId && guard < 128) {
    root = doc.nodes[root.parentId];
    guard += 1;
  }
  if (!root || root.type !== 'page') return null;

  const region = absoluteRect(doc, sliceId);
  const safeScale = Math.max(0.5, Math.min(4, scale));
  const width = Math.max(1, Math.round(region.w * safeScale));
  const height = Math.max(1, Math.round(region.h * safeScale));
  const clipIndex = { value: 0 };
  const defs: Defs = { items: [], seq: 0 };
  const children = root.children
    .filter((id) => !doc.nodes[id]?.isMask)
    .map((id) => {
      const child = doc.nodes[id];
      return child ? emitNode(doc, child, region.x, region.y, clipIndex, defs, true) : '';
    })
    .join('\n');
  const clipId = 'groma-slice-export';
  defs.items.push(`<clipPath id="${clipId}"><rect x="0" y="0" width="${n(region.w)}" height="${n(region.h)}" /></clipPath>`);
  const defsWithClip = `<defs>${defs.items.join('')}</defs>`;
  const background = transparent
    ? ''
    : `<rect x="0" y="0" width="${n(region.w)}" height="${n(region.h)}" fill="#FFFFFF" />`;
  const body = `<g clip-path="url(#${clipId})">${children}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${n(region.w)} ${n(region.h)}">\n${defsWithClip}${background}${body}\n</svg>`;
  return { svg, width: region.w, height: region.h, scale: safeScale };
}

/**
 * 把单个图层导出成 SVG，以图层包围盒为零点。用于钢笔、形状、文本等
 * 非画板目标的直接导出；画板/区块/切片继续走各自的专用路径。
 */
export function renderNodeSvg(
  doc: GromaDoc,
  nodeId: string,
  transparent = false,
  scale = 1,
): SvgExport | null {
  const node = doc.nodes[nodeId];
  if (!node || node.type === 'page' || node.type === 'slice' || node.type === 'frame' || node.type === 'section') return null;
  const region = absoluteRect(doc, nodeId);
  const safeScale = Math.max(0.5, Math.min(4, scale));
  const width = Math.max(1, Math.round(region.w * safeScale));
  const height = Math.max(1, Math.round(region.h * safeScale));
  const clipIndex = { value: 0 };
  const defs: Defs = { items: [], seq: 0 };
  const body = emitNode(doc, node, region.x, region.y, clipIndex, defs, true);
  const defsBlock = defs.items.length > 0 ? `<defs>${defs.items.join('')}</defs>` : '';
  const background = transparent
    ? ''
    : `<rect x="0" y="0" width="${n(region.w)}" height="${n(region.h)}" fill="#FFFFFF" />`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${n(region.w)} ${n(region.h)}">\n${defsBlock}${background}${body}\n</svg>`;
  return { svg, width: region.w, height: region.h, scale: safeScale };
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
  const defs: Defs = { items: [], seq: 0 };
  const children = emitChildren(doc, frame, origin.x, origin.y, clipIndex, defs, false);
  const defsBlock = defs.items.length > 0 ? `<defs>${defs.items.join('')}</defs>` : '';
  const body = frame.clipContent
    ? (() => {
        const clipId = 'groma-clip-export';
        return `<clipPath id="${clipId}"><rect x="0" y="0" width="${n(frame.w)}" height="${n(frame.h)}" rx="${n(frame.cornerRadius)}" /></clipPath><g clip-path="url(#${clipId})">${children}</g>`;
      })()
    : children;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${n(frame.w)} ${n(frame.h)}">\n${defsBlock}${background}${body}\n</svg>`;
  return { svg, width: frame.w, height: frame.h, scale: safeScale };
}

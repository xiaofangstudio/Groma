import type { Paint, SceneNode } from './types';

export const MAX_FILLS = 16;

/** 数组顺序是顶层到最底层；渲染时需要反向，从底层铺到顶层。 */
export function visibleFills(fills: Paint[] | undefined): Paint[] {
  return (fills ?? []).filter((paint) => paint.visible !== false && paint.opacity > 0);
}

/** 从底层到顶层的绘制顺序，最多 16 层。 */
export function fillStack(fills: Paint[] | undefined): Paint[] {
  return visibleFills(fills).slice(0, MAX_FILLS).reverse();
}

export function addFill(fills: Paint[], paint: Paint): Paint[] {
  if (fills.length >= MAX_FILLS) return fills;
  return [paint, ...fills];
}

export function updateFill(fills: Paint[], index: number, paint: Paint): Paint[] {
  if (index < 0 || index >= fills.length) return fills;
  return fills.map((item, i) => (i === index ? paint : item));
}

export function removeFill(fills: Paint[], index: number): Paint[] {
  if (index < 0 || index >= fills.length) return fills;
  return fills.filter((_, i) => i !== index);
}

/** 正数向下移，负数向上移；返回新数组。 */
export function moveFill(fills: Paint[], index: number, delta: number): Paint[] {
  const target = index + delta;
  if (index < 0 || index >= fills.length || target < 0 || target >= fills.length) return fills;
  const next = fills.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function toggleFillVisible(fills: Paint[], index: number): Paint[] {
  const paint = fills[index];
  if (!paint) return fills;
  return updateFill(fills, index, { ...paint, visible: paint.visible === false });
}

export function fillLabel(fills: Paint[] | undefined): string {
  const count = visibleFills(fills).length;
  if (count === 0) return '无填充';
  return count === 1 ? '1 层填充' : `${count} 层填充`;
}

export function isPaintVisible(paint: Paint | undefined): boolean {
  return Boolean(paint && paint.visible !== false && paint.opacity > 0);
}

/** 用于 MCP / 测试的轻量摘要。 */
export function fillSummary(node: SceneNode): Array<{ type: Paint['type']; color: string; opacity: number; visible: boolean }> {
  return node.fills.map((paint) => ({
    type: paint.type,
    color: paint.color,
    opacity: paint.opacity,
    visible: paint.visible !== false,
  }));
}

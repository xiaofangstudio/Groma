import type { Point } from './line';

export interface ArrowGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  pathData: string;
  pathW: number;
  pathH: number;
  arrowHeadData: string;
}

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function arrowHeadSize(length: number): number {
  return Math.min(24, Math.max(8, length * 0.18));
}

/**
 * 把拖拽起止点换算成箭头节点：线身从起点到终点，终点带一个填充三角头；
 * 包围盒把三角头两翼一起算进去，避免选中框比图形窄。
 */
export function arrowGeometry(start: Point, end: Point): ArrowGeometry {
  let ex = end.x;
  let ey = end.y;
  if (Math.hypot(ex - start.x, ey - start.y) < 3) {
    ex = start.x + 120;
    ey = start.y + 60;
  }
  const dx = ex - start.x;
  const dy = ey - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const head = arrowHeadSize(length);
  const half = head * 0.55;
  const tipX = ex;
  const tipY = ey;
  const baseX = ex - ux * head;
  const baseY = ey - uy * head;
  const leftX = baseX - uy * half;
  const leftY = baseY + ux * half;
  const rightX = baseX + uy * half;
  const rightY = baseY - ux * half;

  const minX = Math.min(start.x, tipX, leftX, rightX);
  const minY = Math.min(start.y, tipY, leftY, rightY);
  const maxX = Math.max(start.x, tipX, leftX, rightX);
  const maxY = Math.max(start.y, tipY, leftY, rightY);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  const local = (px: number, py: number) => `${r2(px - minX)} ${r2(py - minY)}`;
  return {
    x: minX,
    y: minY,
    w,
    h,
    pathData: `M ${local(start.x, start.y)} L ${local(tipX, tipY)}`,
    pathW: w,
    pathH: h,
    arrowHeadData: `M ${local(leftX, leftY)} L ${local(tipX, tipY)} L ${local(rightX, rightY)} Z`,
  };
}

export interface Point {
  x: number;
  y: number;
}

export interface LineGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  pathData: string;
  pathW: number;
  pathH: number;
}

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 把拖拽起止点换算成 path 节点的包围盒与局部坐标路径。
 * 起止点过近时按 120×80 兜底，保证单击也能得到一条可见直线。
 */
export function lineGeometry(start: Point, end: Point): LineGeometry {
  let ex = end.x;
  let ey = end.y;
  if (Math.hypot(ex - start.x, ey - start.y) < 3) {
    ex = start.x + 120;
    ey = start.y + 80;
  }
  const minX = Math.min(start.x, ex);
  const minY = Math.min(start.y, ey);
  const w = Math.max(1, Math.abs(ex - start.x));
  const h = Math.max(1, Math.abs(ey - start.y));
  return {
    x: minX,
    y: minY,
    w,
    h,
    pathData: `M ${r2(start.x - minX)} ${r2(start.y - minY)} L ${r2(ex - minX)} ${r2(ey - minY)}`,
    pathW: w,
    pathH: h,
  };
}

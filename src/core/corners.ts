export type CornerRadii = [number, number, number, number];

type RadiusSource = {
  cornerRadius: number;
  cornerRadii?: CornerRadii;
};

/** 四角顺序固定为左上、右上、右下、左下；缺省时回退到统一圆角。 */
export function cornerRadiiOf(node: RadiusSource): CornerRadii {
  const radii = node.cornerRadii;
  if (Array.isArray(radii) && radii.length === 4 && radii.every((value) => Number.isFinite(value))) {
    return [
      Math.max(0, radii[0]),
      Math.max(0, radii[1]),
      Math.max(0, radii[2]),
      Math.max(0, radii[3]),
    ];
  }
  const radius = Number.isFinite(node.cornerRadius) ? Math.max(0, node.cornerRadius) : 0;
  return [radius, radius, radius, radius];
}

export function hasCornerRadii(node: RadiusSource): boolean {
  return cornerRadiiOf(node).some((radius) => radius > 0);
}

/** 缩放到屏幕/导出坐标，并按短边限制单角半径，避免弧线互相穿插。 */
export function scaledCornerRadii(node: RadiusSource, scale: number, w: number, h: number): CornerRadii {
  const cap = Math.max(0, Math.min(w, h) / 2);
  const factor = Number.isFinite(scale) ? Math.max(0, scale) : 0;
  return cornerRadiiOf(node).map((radius) => Math.min(radius * factor, cap)) as CornerRadii;
}

/** 给 SVG 用的圆角矩形路径；四角相同时调用方仍可走原生 rect 快路径。 */
export function cornerPathData(
  x: number,
  y: number,
  w: number,
  h: number,
  radii: CornerRadii,
  format: (value: number) => string = (value) => String(Number(value.toFixed(3))),
): string {
  const max = Math.max(0, Math.min(w, h) / 2);
  const [tl, tr, br, bl] = radii.map((radius) => Math.min(Math.max(0, radius), max));
  const f = format;
  return [
    `M ${f(x + tl)} ${f(y)}`,
    `L ${f(x + w - tr)} ${f(y)}`,
    tr > 0 ? `A ${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}` : `L ${f(x + w)} ${f(y + tr)}`,
    `L ${f(x + w)} ${f(y + h - br)}`,
    br > 0 ? `A ${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}` : `L ${f(x + w - br)} ${f(y + h)}`,
    `L ${f(x + bl)} ${f(y + h)}`,
    bl > 0 ? `A ${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}` : `L ${f(x)} ${f(y + h - bl)}`,
    `L ${f(x)} ${f(y + tl)}`,
    tl > 0 ? `A ${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}` : `L ${f(x + tl)} ${f(y)}`,
    'Z',
  ].join(' ');
}

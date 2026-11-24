export type NodeType = 'page' | 'frame' | 'section' | 'rect' | 'ellipse' | 'text' | 'path' | 'image' | 'group' | 'slice';

export type GuideAxis = 'x' | 'y';

/** 手动参考线：x 是竖线（对齐横坐标），y 是横线。 */
export interface Guide {
  axis: GuideAxis;
  position: number;
}

export interface PaintStop {
  offset: number;
  color: string;
  opacity: number;
}

/** 纯色或线性 / 径向渐变；color 始终保留一个可回退的主色。 */
export type Paint =
  | { type: 'solid'; color: string; opacity: number }
  | {
      type: 'linear';
      color: string;
      opacity: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stops: PaintStop[];
    }
  | {
      type: 'radial';
      color: string;
      opacity: number;
      cx: number;
      cy: number;
      r: number;
      stops: PaintStop[];
    };

export type StrokeCap = 'butt' | 'round' | 'square';
export type StrokeJoin = 'miter' | 'round' | 'bevel';

/** 导入的矢量描边；右侧检查器可编辑颜色、透明度、宽度、虚线、端点与转角。 */
export interface Stroke {
  color: string;
  opacity: number;
  width: number;
  dash: number[];
  cap: StrokeCap;
  join: StrokeJoin;
}

/** 钢笔锚点：x/y 是锚点，in/out 是左右手柄，全部在节点局部坐标。 */
export interface PathAnchor {
  x: number;
  y: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
}

/** 一条连续轮廓；同一钢笔节点可有多个轮廓，组成复合矢量路径。 */
export interface PathContour {
  anchors: PathAnchor[];
  closed: boolean;
}

/** 位图资产只存引用；文件本体在工程 assets 目录，scene.json 保持轻量可读。 */
export interface ImageAsset {
  id: string;
  name: string;
  mime: string;
  /** 相对工程根目录的路径，例如 assets/photo-1.png。 */
  file: string;
  w: number;
  h: number;
  bytes: number;
}

export interface SceneNode {
  id: string;
  type: NodeType;
  name: string;
  parentId: string | null;
  children: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  clipContent: boolean;
  fills: Paint[];
  cornerRadius: number;
  /** 矢量路径：节点局部坐标，左上角为 0,0；pathW / pathH 记录导入时的原始尺寸。 */
  pathData?: string;
  pathW?: number;
  pathH?: number;
  /** 钢笔路径的锚点与手柄，坐标同节点局部坐标；pathAnchors/pathClosed 镜像第一条轮廓。 */
  pathAnchors?: PathAnchor[];
  pathClosed?: boolean;
  /** 复合矢量路径的全部轮廓；缺省时按 pathAnchors/pathClosed 视为单轮廓。 */
  pathContours?: PathContour[];
  fillRule?: 'nonzero' | 'evenodd';
  /** 参数化形状：多边形/星形/箭头；pathData 仍为最终可渲染线身路径。 */
  shapeKind?: 'polygon' | 'star' | 'arrow';
  shapeSides?: number;
  shapeInnerRatio?: number;
  /** 箭头的填充三角头路径，和 pathData 共用局部坐标系。 */
  arrowHeadData?: string;
  strokes?: Stroke[];
  /** 图片节点引用的资产 id；资产表在 GromaDoc.assets。 */
  assetId?: string;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
}

export interface Page {
  id: string;
  name: string;
  rootId: string;
  background: string;
  /** 页级手动参考线；旧工程没有这个字段时视为空。 */
  guides?: Guide[];
}

export interface GromaDoc {
  version: number;
  name: string;
  pages: Page[];
  nodes: Record<string, SceneNode>;
  /** 旧工程没有这个字段；按缺省空表处理。 */
  assets?: Record<string, ImageAsset>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

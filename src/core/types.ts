import type { ImageFill } from './imageFill';
import type { CornerRadii } from './corners';

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

/** 纯色或线性 / 径向渐变；color 始终保留一个可回退的主色。数组顺序为顶层到最底层。 */
export type Paint =
  | { type: 'solid'; color: string; opacity: number; visible?: boolean }
  | {
      type: 'linear';
      color: string;
      opacity: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stops: PaintStop[];
      visible?: boolean;
    }
  | {
      type: 'radial';
      color: string;
      opacity: number;
      cx: number;
      cy: number;
      r: number;
      stops: PaintStop[];
      visible?: boolean;
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
  /** 同一节点内相同 id 的锚点共享位置与手柄；旧数据可没有。 */
  vertexId?: string;
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

/** 图片裁剪使用的归一化源图区域。 */
export interface ImageCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 图层效果；先支持投影与整层模糊，内阴影/背景模糊留后续。 */
export type Effect =
  | {
      type: 'drop-shadow';
      x: number;
      y: number;
      blur: number;
      color: string;
      opacity: number;
      visible: boolean;
    }
  | { type: 'layer-blur'; blur: number; visible: boolean };

/** 约束：子图层在父画板缩放时如何跟随。 */
export type HorizontalConstraint = 'left' | 'right' | 'center' | 'leftRight' | 'scale';
export type VerticalConstraint = 'top' | 'bottom' | 'center' | 'topBottom' | 'scale';

export interface Constraints {
  horizontal: HorizontalConstraint;
  vertical: VerticalConstraint;
}

export type LayoutMode = 'horizontal' | 'vertical';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch';
export type LayoutJustify = 'start' | 'center' | 'end' | 'space-between';

/** 容器自动布局：子层按方向、间距、内边距排列；hug 时主轴包住内容。 */
export interface AutoLayout {
  mode: LayoutMode;
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  align: LayoutAlign;
  justify: LayoutJustify;
  hug: boolean;
}

export type StyleKind = 'fill' | 'stroke' | 'effect' | 'text';

export interface TextStyle {
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  listStyle: 'none' | 'bullet' | 'number';
}

type StyleBase = {
  id: string;
  name: string;
};

export type Style =
  | (StyleBase & { kind: 'fill'; fills: Paint[] })
  | (StyleBase & { kind: 'stroke'; strokes: Stroke[] })
  | (StyleBase & { kind: 'effect'; effects: Effect[] })
  | (StyleBase & { kind: 'text'; textStyle: TextStyle });

export type StyleRefs = Partial<Record<StyleKind, string>>;

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
  /** 父画板缩放时子图层的跟随规则；缺省为左上固定。 */
  constraints?: Constraints;
  /** 容器自动布局；缺省无，手动坐标生效。 */
  layout?: AutoLayout;
  /** 已绑定的命名样式；直接改对应属性会解除绑定。 */
  styleRefs?: StyleRefs;
  /** 形状蒙版：该节点定义同父级中位于其上方的兄弟图层裁切区域。 */
  isMask?: boolean;
  /** 蒙版取像素的方式；缺省 geometry 走快速轮廓裁切。 */
  maskType?: 'geometry' | 'alpha' | 'luminance';
  fills: Paint[];
  cornerRadius: number;
  /** 四角独立圆角，顺序左上/右上/右下/左下；缺省时所有角使用 cornerRadius。 */
  cornerRadii?: CornerRadii;
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
  /** 图片裁剪：归一化 0–1 源图区域；缺省整张图。 */
  imageCrop?: ImageCrop;
  /** 形状上的图片填充；存在时优先于 fills 绘制。 */
  imageFill?: ImageFill;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  /** 字距，单位 px；正负均可，缺省 0。 */
  letterSpacing?: number;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  /** 段落之间的额外间距，单位 px。 */
  paragraphSpacing?: number;
  /** 简单列表：项目符号 / 阿拉伯数字；缺省无。 */
  listStyle?: 'none' | 'bullet' | 'number';
  /** 图层效果列表；缺省无效果。 */
  effects?: Effect[];
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
  /** 文档级命名样式；旧工程没有这个字段时视为空。 */
  styles?: Record<string, Style>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

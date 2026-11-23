export type NodeType = 'page' | 'frame' | 'section' | 'rect' | 'ellipse' | 'text' | 'group';

export type GuideAxis = 'x' | 'y';

/** 手动参考线：x 是竖线（对齐横坐标），y 是横线。 */
export interface Guide {
  axis: GuideAxis;
  position: number;
}

export interface Paint {
  type: 'solid';
  color: string;
  opacity: number;
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
  text?: string;
  fontSize?: number;
  fontWeight?: number;
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
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

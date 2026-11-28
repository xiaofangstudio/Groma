import { useSyncExternalStore } from 'react';
import { createDoc } from '../core/doc';
import { applyCommand, collectSubtree, importComponentFromDoc, masterOfEditedNode, publishComponent as publishComponentToLibrary, refreshComponentFromDoc, syncInstancesOfMaster, type NodePatch, type SceneCommand } from '../core/commands';
import {
  addPage as addPageToDoc,
  duplicatePage as duplicatePageInDoc,
  movePage as movePageInDoc,
  pageContainsNode,
  removePage as removePageFromDoc,
  renamePage as renamePageInDoc,
} from '../core/pages';
import type { GromaDoc, Guide, ImageAsset, LibrarySource, NodeType, PathAnchor, Rect, SceneNode, Stroke, Style, StyleKind, VariableType } from '../core/types';
import { canCreateStyle, styleApplyPatch, styleFromNode, styleName, styleValuesPatch } from '../core/styles';
import { clampScale, fitRect, zoomAt, type Viewport } from '../core/viewport';
import type { ProjectUiState } from './project-ui';
import type { ImportedNode, SvgImport } from '../io/importSvg';
import { alignDeltas, alignToParentDeltas, distributeDeltas, type AlignMode, type DistributeMode } from '../core/align';
import { absolutePosition, absoluteRect, deepestFrame, selectionBounds, topLevelSelection } from '../core/geometry';
import { shapePath, type ShapeKind } from '../core/shapes';
import { nodePathContours, penContoursGeometry, type PenAnchor, type PenContour } from '../core/pen';
import { vectorActionBuild, type BooleanOp, type VectorAction } from '../core/boolean';
import { isAutoLayoutChild } from '../core/autoLayout';
import { prototypeStart } from '../core/prototype';
import { pageOfNode } from '../core/variants';
import { ancestorInstance, instancePath, mergeInstanceOverride, overrideFromPatch } from '../core/instance';
import { activeModeId, canAliasVariable, canBindVariable, defaultValueForType, materializeNodeVariables, materializeVariables, variableById, type VariableProp } from '../core/variables';

export type Tool = 'move' | 'hand' | 'frame' | 'section' | 'rect' | 'ellipse' | 'text' | 'line' | 'arrow' | 'polygon' | 'star' | 'slice' | 'pen';
export type SaveState = 'local' | 'saving' | 'saved' | 'error';

interface PatchItem {
  id: string;
  before: SceneNode;
  after: SceneNode;
}

interface AddItem {
  node: SceneNode;
  parentId: string;
  index: number;
  subtree: Record<string, SceneNode>;
}

interface DeleteItem {
  parentId: string;
  index: number;
  subtree: Record<string, SceneNode>;
}

type HistoryEntry =
  | { kind: 'patch'; id: string; before: SceneNode; after: SceneNode }
  | { kind: 'batch'; items: PatchItem[] }
  | { kind: 'add'; node: SceneNode; parentId: string; index: number; subtree?: Record<string, SceneNode> }
  | { kind: 'addBatch'; items: AddItem[] }
  | { kind: 'delete'; parentId: string; index: number; subtree: Record<string, SceneNode> }
  | { kind: 'deleteBatch'; items: DeleteItem[] }
  | { kind: 'guides'; pageId: string; before: Guide[]; after: Guide[] }
  | { kind: 'doc'; beforeDoc: GromaDoc; afterDoc: GromaDoc }
  | {
      kind: 'pages';
      beforeDoc: GromaDoc;
      afterDoc: GromaDoc;
      pageIdBefore: string;
      pageIdAfter: string;
      selectionBefore: string[];
      selectionAfter: string[];
    }
  | {
      kind: 'structure';
      beforeNodes: Record<string, SceneNode>;
      afterNodes: Record<string, SceneNode>;
      undoRemove: string[];
      redoRemove: string[];
      selectionBefore: string[];
      selectionAfter: string[];
    };

interface EditorState {
  doc: GromaDoc;
  pageId: string;
  /** 兼容旧界面：主选中节点，等于 selectedIds[0] */
  selectedId: string | null;
  selectedIds: string[];
  projectId: string | null;
  saveState: SaveState;
  viewport: Viewport;
  viewports: Record<string, Viewport>;
  viewSize: { w: number; h: number };
  tool: Tool;
  /** 图片裁剪模式的目标；退出或改选其他图层时清空。 */
  cropId: string | null;
  /** 正在演示的起始画板；null 表示演示窗口关闭。 */
  prototypeStartId: string | null;
  leftOpen: boolean;
  rightOpen: boolean;
  /** 参考线是否显示；隐藏后也不参与吸附。 */
  guidesVisible: boolean;
  /** 参考线锁定；锁定后不可拖动或删除。 */
  guidesLocked: boolean;
  needsFit: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

interface Transaction {
  items: Record<string, SceneNode>;
  docBefore: GromaDoc;
}

let state: EditorState;
let transaction: Transaction | null = null;
let idSeq = 0;
let styleSeq = 0;
let variableSeq = 0;
let viewportAnimFrame = 0;
let pasteSeq = 0;
let nodeClipboard: NodeClipboard | null = null;

interface NodeClipboardItem {
  rootId: string;
  parentId: string;
  pageId: string;
  pageX: number;
  pageY: number;
  subtree: Record<string, SceneNode>;
}

interface NodeClipboard {
  projectId: string | null;
  items: NodeClipboardItem[];
}

function freshState(): EditorState {
  const doc = createDoc();
  return {
    doc,
    pageId: doc.pages[0].id,
    selectedId: null,
    selectedIds: [],
    projectId: null,
    saveState: 'local',
    viewport: { x: 0, y: 0, scale: 1 },
    viewports: {},
    viewSize: { w: 0, h: 0 },
    tool: 'move',
    cropId: null,
    prototypeStartId: null,
    leftOpen: true,
    rightOpen: true,
    guidesVisible: true,
    guidesLocked: false,
    needsFit: true,
    past: [],
    future: [],
  };
}

state = freshState();

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function set(updater: (s: EditorState) => EditorState) {
  state = updater(state);
  emit();
}

function withSelection(s: EditorState, ids: string[]): EditorState {
  return {
    ...s,
    selectedIds: ids,
    selectedId: ids[0] ?? null,
    cropId: s.cropId && ids.includes(s.cropId) ? s.cropId : null,
  };
}

function withViewport(s: EditorState, viewport: Viewport): EditorState {
  const next = { ...viewport, scale: clampScale(viewport.scale) };
  return { ...s, viewport: next, viewports: { ...s.viewports, [s.pageId]: next } };
}

function reduceMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function stopViewportAnimation(): void {
  if (!viewportAnimFrame) return;
  window.cancelAnimationFrame(viewportAnimFrame);
  viewportAnimFrame = 0;
}

/** `Shift+1/2` 与适配按钮走 180ms 缓出；滚轮、拖动仍即时跟手。 */
function animateViewportTo(target: Viewport): void {
  stopViewportAnimation();
  if (reduceMotion() || typeof window === 'undefined') {
    set((s) => withViewport(s, target));
    return;
  }
  const from = state.viewport;
  const start = performance.now();
  const duration = 180;
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    set((s) =>
      withViewport(s, {
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        scale: from.scale + (target.scale - from.scale) * eased,
      }),
    );
    if (progress < 1) viewportAnimFrame = window.requestAnimationFrame(step);
    else viewportAnimFrame = 0;
  };
  viewportAnimFrame = window.requestAnimationFrame(step);
}

function validSelection(doc: GromaDoc, ids: string[]): string[] {
  return ids.filter((id) => {
    const node = doc.nodes[id];
    return Boolean(node && node.type !== 'page');
  });
}

/**
 * 钢笔路径的统一写入口：世界坐标轮廓 → 节点包围盒 → 局部锚点/复合 pathData。
 * 单轮廓仍只写 pathAnchors/pathClosed；多轮廓额外写 pathContours，并镜像第一条。
 */
function commitPathContours(id: string, contours: PenContour[], silent: boolean, ensureOpenStroke = false): boolean {
  if (contours.length === 0 || contours.some((contour) => contour.anchors.length < 2)) return false;
  let changed = false;
  set((s) => {
    const node = s.doc.nodes[id];
    if (!node || node.type !== 'path' || node.locked || nodePathContours(node).length === 0) return s;
    const geometry = penContoursGeometry(contours);
    if (!geometry) return s;
    const parent = node.parentId ? s.doc.nodes[node.parentId] : undefined;
    const parentAbs = parent && parent.type !== 'page' ? absolutePosition(s.doc, parent.id) : { x: 0, y: 0 };
    const first = geometry.contours[0];
    const patch: NodePatch = {
      x: geometry.x - parentAbs.x,
      y: geometry.y - parentAbs.y,
      w: geometry.w,
      h: geometry.h,
      pathData: geometry.pathData,
      pathW: geometry.pathW,
      pathH: geometry.pathH,
      pathAnchors: first.anchors,
      pathClosed: first.closed,
      pathContours: geometry.contours.length > 1 ? geometry.contours : undefined,
    };
    if (ensureOpenStroke && contours.some((contour) => !contour.closed) && (node.strokes?.length ?? 0) === 0) {
      patch.strokes = [{ color: '#221C00', opacity: 1, width: 2, dash: [], cap: 'butt', join: 'miter' }];
    }
    const after: SceneNode = { ...node, ...patch };
    if (JSON.stringify(node) === JSON.stringify(after)) return s;
    changed = true;
    const doc = run(s.doc, { type: 'patch', id, patch });
    if (silent) return { ...s, doc };
    return {
      ...s,
      doc,
      past: [...s.past, { kind: 'patch', id, before: node, after } as HistoryEntry].slice(-200),
      future: [],
    };
  });
  return changed;
}

export function getState(): EditorState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEditor(): EditorState {
  return useSyncExternalStore(subscribe, getState, getState);
}

function pageRoot(doc: GromaDoc, pageId: string): SceneNode | null {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return null;
  return doc.nodes[page.rootId] ?? null;
}

function frameBounds(doc: GromaDoc, pageId: string, selectedId: string | null): Rect {
  if (selectedId) {
    const node = doc.nodes[selectedId];
    if (node && (node.type === 'frame' || node.type === 'section')) {
      return absoluteRect(doc, selectedId);
    }
  }
  const root = pageRoot(doc, pageId);
  const frames = (root?.children ?? [])
    .map((id) => doc.nodes[id])
    .filter((n) => n && (n.type === 'frame' || n.type === 'section'));
  if (frames.length === 0) return { x: 0, y: 0, w: 1440, h: 900 };
  if (frames.length === 1) {
    const f = frames[0];
    return { x: f.x, y: f.y, w: f.w, h: f.h };
  }
  const minX = Math.min(...frames.map((f) => f.x));
  const minY = Math.min(...frames.map((f) => f.y));
  const maxX = Math.max(...frames.map((f) => f.x + f.w));
  const maxY = Math.max(...frames.map((f) => f.y + f.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function computeFit(s: EditorState): Viewport {
  const bounds = frameBounds(s.doc, s.pageId, s.selectedId);
  return fitRect(bounds, s.viewSize.w, s.viewSize.h);
}

function newNodeId(type: NodeType): string {
  idSeq += 1;
  return `${type}-${Date.now().toString(36)}-${idSeq}`;
}

function run(doc: GromaDoc, command: SceneCommand): GromaDoc {
  return applyCommand(doc, command).doc;
}

function withGuides(doc: GromaDoc, pageId: string, guides: Guide[]): GromaDoc {
  return {
    ...doc,
    pages: doc.pages.map((page) => (page.id === pageId ? { ...page, guides } : page)),
  };
}

function guideState(s: EditorState, pageId: string, before: Guide[], after: Guide[]): EditorState {
  return {
    ...s,
    doc: withGuides(s.doc, pageId, after),
    past: [...s.past, { kind: 'guides', pageId, before, after } as HistoryEntry].slice(-200),
    future: [],
  };
}

function fitPageState(s: EditorState): EditorState {
  if (s.viewSize.w <= 0 || s.viewSize.h <= 0) return { ...s, needsFit: true };
  return { ...s, viewport: computeFit(s), needsFit: false };
}

/** 每页记住自己的缩放与平移；没有记录时才适配画板。 */
function pageViewportState(s: EditorState, pageId: string): EditorState {
  const saved = s.viewports[pageId];
  const clean = { ...s, pageId, needsFit: false };
  if (saved) return { ...clean, viewport: { ...saved } };
  return fitPageState(clean);
}

function pageHistoryState(
  s: EditorState,
  afterDoc: GromaDoc,
  pageIdAfter: string,
  selectionAfter: string[],
): EditorState {
  const entry: HistoryEntry = {
    kind: 'pages',
    beforeDoc: s.doc,
    afterDoc,
    pageIdBefore: s.pageId,
    pageIdAfter,
    selectionBefore: s.selectedIds,
    selectionAfter,
  };
  let next: EditorState = {
    ...withSelection(s, selectionAfter),
    doc: afterDoc,
    pageId: pageIdAfter,
    past: [...s.past, entry].slice(-200),
    future: [],
  };
  if (pageIdAfter !== s.pageId) next = pageViewportState(next, pageIdAfter);
  return next;
}

function pageIdAfterEntry(
  entry: HistoryEntry,
  direction: 'undo' | 'redo',
  current: string,
): string {
  if (entry.kind !== 'pages') return current;
  return direction === 'undo' ? entry.pageIdBefore : entry.pageIdAfter;
}

function selectionOnPage(doc: GromaDoc, pageId: string, ids: string[]): string[] {
  return ids.filter((id) => pageContainsNode(doc, pageId, id));
}

function changedDescendants(beforeDoc: GromaDoc, afterDoc: GromaDoc, rootId: string): PatchItem[] {
  const root = beforeDoc.nodes[rootId];
  if (!root || root.children.length === 0) return [];
  const items: PatchItem[] = [];
  const stack = [...root.children];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const before = beforeDoc.nodes[id];
    const after = afterDoc.nodes[id];
    if (!before || !after) continue;
    if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ id, before, after });
    stack.push(...before.children);
  }
  return items;
}

function pageHasAutoLayout(doc: GromaDoc, rootId: string): boolean {
  const stack = [rootId];
  while (stack.length > 0) {
    const node = doc.nodes[stack.pop() as string];
    if (!node) continue;
    if (node.layout) return true;
    stack.push(...node.children);
  }
  return false;
}

function liveSyncMasters(doc: GromaDoc, changedIds: string[]): GromaDoc {
  const masters = new Set<string>();
  for (const id of changedIds) {
    const masterId = masterOfEditedNode(doc, id);
    if (masterId) masters.add(masterId);
  }
  let next = doc;
  for (const masterId of masters) next = syncInstancesOfMaster(next, masterId, newNodeId);
  return next;
}

function patchItems(
  doc: GromaDoc,
  patches: Array<{ id: string; patch: NodePatch }>,
): { doc: GromaDoc; items: PatchItem[] } {
  let next = doc;
  const changed = new Map<string, PatchItem>();
  const record = (before: SceneNode, after: SceneNode) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const existing = changed.get(after.id) ?? changed.get(before.id);
    if (existing) existing.after = after;
    else changed.set(after.id, { id: after.id, before, after });
  };
  for (const { id, patch } of patches) {
    try {
      const beforeApply = next;
      const result = applyCommand(next, { type: 'patch', id, patch });
      if (!result.before || !result.after) continue;
      record(result.before, result.after);
      next = result.doc;
      if (result.beforeNodes && result.afterNodes) {
        for (const [key, before] of Object.entries(result.beforeNodes)) {
          const after = result.afterNodes[key];
          if (after) record(before, after);
        }
      }
      for (const item of changedDescendants(beforeApply, next, id)) record(item.before, item.after);

      // 实例子层的可覆盖字段写回实例根，主组件同步时再重放。
      const instance = ancestorInstance(next, id);
      if (instance) {
        const path = instancePath(next, instance.id, id);
        const override = overrideFromPatch(patch as Record<string, unknown>);
        if (path && Object.keys(override).length > 0) {
          const currentRoot = next.nodes[instance.id];
          const overrides = mergeInstanceOverride(currentRoot.instanceOverrides, path, override);
          if (overrides) {
            const nextRoot: SceneNode = { ...currentRoot, instanceOverrides: overrides };
            record(currentRoot, nextRoot);
            next = { ...next, nodes: { ...next.nodes, [currentRoot.id]: nextRoot } };
          }
        }
      }
    } catch {
      // 单个节点补丁失败不应让整批操作停在中途
    }
  }
  return { doc: next, items: [...changed.values()] };
}

function patchForTarget(from: SceneNode, target: SceneNode): NodePatch {  const patch = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(from)) {
    if (!(key in target)) patch[key] = undefined;
  }
  return patch as NodePatch;
}

function applyEntry(doc: GromaDoc, entry: HistoryEntry, direction: 'undo' | 'redo'): GromaDoc {
  if (entry.kind === 'patch') {
    const target = direction === 'undo' ? entry.before : entry.after;
    const opposite = direction === 'undo' ? entry.after : entry.before;
    try {
      return run(doc, { type: 'patch', id: entry.id, patch: patchForTarget(opposite, target) });
    } catch {
      return doc;
    }
  }
  if (entry.kind === 'batch') {
    let next = doc;
    for (const item of entry.items) {
      const target = direction === 'undo' ? item.before : item.after;
      const opposite = direction === 'undo' ? item.after : item.before;
      try {
        next = run(next, {
          type: 'patch',
          id: item.id,
          patch: patchForTarget(opposite, target),
        });
      } catch {
        // 保留其余可恢复项
      }
    }
    return next;
  }
  if (entry.kind === 'add') {
    if (direction === 'undo') {
      try {
        return run(doc, { type: 'remove', id: entry.node.id });
      } catch {
        return doc;
      }
    }
    try {
      return run(doc, {
        type: 'restore',
        parentId: entry.parentId,
        index: entry.index,
        subtree: entry.subtree ?? { [entry.node.id]: entry.node },
      });
    } catch {
      return doc;
    }
  }
  if (entry.kind === 'addBatch') {
    let next = doc;
    if (direction === 'undo') {
      for (const item of entry.items) {
        try {
          next = run(next, { type: 'remove', id: item.node.id });
        } catch {
          // 已删除的克隆不影响其它项
        }
      }
      return next;
    }
    for (const item of entry.items) {
      try {
        next = run(next, {
          type: 'restore',
          parentId: item.parentId,
          index: item.index,
          subtree: item.subtree,
        });
      } catch {
        // 继续恢复其它项
      }
    }
    return next;
  }
  if (entry.kind === 'delete') {
    if (direction === 'undo') {
      try {
        return run(doc, { type: 'restore', parentId: entry.parentId, index: entry.index, subtree: entry.subtree });
      } catch {
        return doc;
      }
    }
    const root = Object.values(entry.subtree).find((node) => node.parentId === entry.parentId);
    if (!root) return doc;
    try {
      return run(doc, { type: 'remove', id: root.id });
    } catch {
      return doc;
    }
  }
  if (entry.kind === 'deleteBatch') {
    let next = doc;
    if (direction === 'undo') {
      const ordered = [...entry.items].reverse();
      for (const item of ordered) {
        try {
          next = run(next, { type: 'restore', parentId: item.parentId, index: item.index, subtree: item.subtree });
        } catch {
          // 跳过已恢复项
        }
      }
      return next;
    }
    for (const item of entry.items) {
      const root = Object.values(item.subtree).find((node) => node.parentId === item.parentId);
      if (!root) continue;
      try {
        next = run(next, { type: 'remove', id: root.id });
      } catch {
        // 继续删除其它项
      }
    }
    return next;
  }
  if (entry.kind === 'structure') {
    const nodes = { ...doc.nodes };
    for (const id of direction === 'undo' ? entry.undoRemove : entry.redoRemove) delete nodes[id];
    const source = direction === 'undo' ? entry.beforeNodes : entry.afterNodes;
    for (const [id, node] of Object.entries(source)) nodes[id] = node;
    return { ...doc, nodes };
  }
  if (entry.kind === 'guides') {
    return withGuides(doc, entry.pageId, direction === 'undo' ? entry.before : entry.after);
  }
  if (entry.kind === 'doc') {
    return direction === 'undo' ? entry.beforeDoc : entry.afterDoc;
  }
  if (entry.kind === 'pages') {
    return direction === 'undo' ? entry.beforeDoc : entry.afterDoc;
  }
  return doc;
}

function selectionAfterEntry(
  entry: HistoryEntry,
  direction: 'undo' | 'redo',
  current: string[],
): string[] | null {
  if (entry.kind === 'add') return direction === 'undo' ? [] : [entry.node.id];
  if (entry.kind === 'addBatch') return direction === 'undo' ? [] : entry.items.map((item) => item.node.id);
  if (entry.kind === 'delete') {
    return direction === 'undo'
      ? [Object.values(entry.subtree).find((node) => node.parentId === entry.parentId)?.id ?? '']
      : [];
  }
  if (entry.kind === 'deleteBatch') {
    return direction === 'undo'
      ? entry.items.map((item) => Object.values(item.subtree).find((node) => node.parentId === item.parentId)?.id ?? '')
      : [];
  }
  if (entry.kind === 'structure') return direction === 'undo' ? entry.selectionBefore : entry.selectionAfter;
  if (entry.kind === 'pages') return direction === 'undo' ? entry.selectionBefore : entry.selectionAfter;
  return current;
}

export const editor = {
  setViewport(v: Viewport) {
    stopViewportAnimation();
    set((s) => withViewport(s, v));
  },

  panBy(dx: number, dy: number) {
    stopViewportAnimation();
    set((s) => withViewport(s, { ...s.viewport, x: s.viewport.x + dx, y: s.viewport.y + dy }));
  },

  zoomAtPoint(sx: number, sy: number, factor: number) {
    stopViewportAnimation();
    set((s) => withViewport(s, zoomAt(s.viewport, sx, sy, factor)));
  },

  setZoomPercent(percent: number, sx?: number, sy?: number) {
    stopViewportAnimation();
    set((s) => {
      const target = clampScale(percent / 100);
      const ax = sx ?? s.viewSize.w / 2;
      const ay = sy ?? s.viewSize.h / 2;
      return withViewport(s, zoomAt(s.viewport, ax, ay, target / s.viewport.scale));
    });
  },

  fitAll() {
    stopViewportAnimation();
    if (state.viewSize.w <= 0) return;
    const target = computeFit(state);
    set((s) => ({ ...s, needsFit: false }));
    animateViewportTo(target);
  },

  fitSelection() {
    stopViewportAnimation();
    if (state.viewSize.w <= 0) return;
    const ids = validSelection(state.doc, state.selectedIds);
    if (ids.length === 0) {
      this.fitAll();
      return;
    }
    const bounds = selectionBounds(state.doc, ids);
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
      this.fitAll();
      return;
    }
    set((s) => ({ ...s, needsFit: false }));
    animateViewportTo(fitRect(bounds, state.viewSize.w, state.viewSize.h));
  },

  setCanvasSize(w: number, h: number) {
    stopViewportAnimation();
    set((s) => {
      if (s.viewSize.w === w && s.viewSize.h === h && !s.needsFit) return s;
      const next = { ...s, viewSize: { w, h } };
      if (s.needsFit && w > 0 && h > 0) {
        const viewport = computeFit(next);
        next.viewport = viewport;
        next.needsFit = false;
        next.viewports = { ...next.viewports, [s.pageId]: viewport };
      }
      return next;
    });
  },

  addGuide(axis: Guide['axis'], position: number) {
    set((s) => {
      const page = s.doc.pages.find((item) => item.id === s.pageId) ?? s.doc.pages[0];
      if (!page || !Number.isFinite(position)) return s;
      const before = page.guides ?? [];
      const value = Math.round(position);
      if (before.some((guide) => guide.axis === axis && Math.abs(guide.position - value) < 1)) return s;
      const after: Guide[] = [...before, { axis, position: value }];
      return guideState(s, page.id, before, after);
    });
  },

  moveGuide(index: number, position: number) {
    set((s) => {
      const page = s.doc.pages.find((item) => item.id === s.pageId) ?? s.doc.pages[0];
      const before = page?.guides ?? [];
      if (!page || !Number.isInteger(index) || index < 0 || index >= before.length || !Number.isFinite(position)) return s;
      const value = Math.round(position);
      const current = before[index];
      if (!current || current.position === value) return s;
      const after = before.slice();
      after[index] = { ...current, position: value };
      return guideState(s, page.id, before, after);
    });
  },

  removeGuide(index: number) {
    set((s) => {
      const page = s.doc.pages.find((item) => item.id === s.pageId) ?? s.doc.pages[0];
      const before = page?.guides ?? [];
      if (!page || !Number.isInteger(index) || index < 0 || index >= before.length) return s;
      const after = before.filter((_, guideIndex) => guideIndex !== index);
      return guideState(s, page.id, before, after);
    });
  },

  select(id: string | null, additive = false) {
    set((s) => {
      if (id === null) return withSelection(s, []);
      const node = s.doc.nodes[id];
      if (!node) return s;
      if (!additive || node.type === 'page') return withSelection(s, [id]);
      if (s.selectedIds.includes(id)) {
        return withSelection(s, s.selectedIds.filter((selected) => selected !== id));
      }
      return withSelection(s, [...s.selectedIds, id]);
    });
  },

  /** 跨页选中组件：切到所属页面再选中，供本地组件库跳转。 */
  openNode(id: string) {
    const node = state.doc.nodes[id];
    if (!node) return;
    const page = pageOfNode(state.doc, id);
    if (page && page.id !== state.pageId) {
      stopViewportAnimation();
      set((s) => ({ ...pageViewportState({ ...s, pageId: page.id }, page.id), selectedId: id, selectedIds: [id] }));
      return;
    }
    editor.select(id);
  },

  selectMany(ids: string[]) {
    set((s) => withSelection(s, validSelection(s.doc, [...new Set(ids)])));
  },

  selectAll() {
    set((s) => {
      const page = s.doc.pages.find((item) => item.id === s.pageId) ?? s.doc.pages[0];
      const root = s.doc.nodes[page.rootId];
      if (!root) return s;
      return withSelection(s, validSelection(s.doc, root.children.filter((id) => !s.doc.nodes[id]?.locked)));
    });
  },

  clearSelection() {
    set((s) => (s.selectedIds.length === 0 ? s : withSelection(s, [])));
  },

  toggleSelected(id: string) {
    editor.select(id, true);
  },

  /** 进入图片裁剪模式；画布只改源图可见区域，不移动或缩放节点本身。 */
  enterImageCrop(id: string) {
    set((s) => {
      const node = s.doc.nodes[id];
      if (!node || node.type !== 'image' || node.locked) return s;
      return { ...withSelection(s, [id]), cropId: id, tool: 'move' };
    });
  },

  exitImageCrop() {
    set((s) => (s.cropId ? { ...s, cropId: null } : s));
  },

  resetImageCrop(id: string) {
    editor.applyPatch(id, { imageCrop: undefined });
  },

  setTool(tool: Tool) {
    set((s) => (s.tool === tool ? s : { ...s, tool }));
  },

  toggleLeft() {
    set((s) => ({ ...s, leftOpen: !s.leftOpen }));
  },

  toggleRight() {
    set((s) => ({ ...s, rightOpen: !s.rightOpen }));
  },

  toggleGuidesVisible() {
    set((s) => ({ ...s, guidesVisible: !s.guidesVisible }));
  },

  toggleGuidesLocked() {
    set((s) => ({ ...s, guidesLocked: !s.guidesLocked }));
  },

  renameDoc(name: string) {
    set((s) => ({ ...s, doc: { ...s.doc, name } }));
  },

  setProjectId(projectId: string | null) {
    set((s) => ({
      ...s,
      projectId,
      saveState: projectId ? 'saving' : 'local',
    }));
  },

  setSaveState(saveState: SaveState) {
    set((s) => (s.saveState === saveState ? s : { ...s, saveState }));
  },

  loadDoc(doc: GromaDoc, projectId: string, ui?: ProjectUiState) {
    stopViewportAnimation();
    transaction = null;
    const savedPage = ui?.pageId && doc.pages.some((page) => page.id === ui.pageId) ? ui.pageId : doc.pages[0].id;
    const savedViewports: Record<string, Viewport> = {};
    if (ui?.viewports) {
      for (const page of doc.pages) {
        const viewport = ui.viewports[page.id];
        if (!viewport) continue;
        if (!Number.isFinite(viewport.x) || !Number.isFinite(viewport.y) || !Number.isFinite(viewport.scale)) continue;
        savedViewports[page.id] = { x: viewport.x, y: viewport.y, scale: clampScale(viewport.scale) };
      }
    }
    set((s) => {
      const next: EditorState = {
        ...s,
        doc,
        pageId: savedPage,
        selectedId: null,
        selectedIds: [],
        projectId,
        saveState: 'saved',
        cropId: null,
        needsFit: !savedViewports[savedPage],
        viewports: savedViewports,
        past: [],
        future: [],
      };
      const restored = savedViewports[savedPage];
      if (restored) {
        next.viewport = restored;
      } else if (s.viewSize.w > 0 && s.viewSize.h > 0) {
        next.viewport = computeFit(next);
        next.needsFit = false;
        next.viewports = { ...next.viewports, [savedPage]: next.viewport };
      }
      return next;
    });
  },

  setPage(pageId: string) {
    stopViewportAnimation();
    set((s) => {
      if (s.pageId === pageId || !s.doc.pages.some((page) => page.id === pageId)) return s;
      return pageViewportState({ ...withSelection(s, []), pageId }, pageId);
    });
  },

  addPage(): string {
    stopViewportAnimation();
    let created = '';
    set((s) => {
      const result = addPageToDoc(s.doc, () => newNodeId('page'));
      created = result.page.id;
      return pageHistoryState(s, result.doc, created, []);
    });
    return created;
  },

  renamePage(pageId: string, name: string): boolean {
    stopViewportAnimation();
    let changed = false;
    set((s) => {
      const doc = renamePageInDoc(s.doc, pageId, name);
      if (!doc) return s;
      changed = true;
      return pageHistoryState(s, doc, s.pageId, selectionOnPage(doc, s.pageId, s.selectedIds));
    });
    return changed;
  },

  movePage(pageId: string, toIndex: number): boolean {
    stopViewportAnimation();
    let changed = false;
    set((s) => {
      const doc = movePageInDoc(s.doc, pageId, toIndex);
      if (!doc) return s;
      changed = true;
      return pageHistoryState(s, doc, s.pageId, selectionOnPage(doc, s.pageId, s.selectedIds));
    });
    return changed;
  },

  duplicatePage(pageId: string): string | null {
    stopViewportAnimation();
    let created: string | null = null;
    set((s) => {
      const result = duplicatePageInDoc(s.doc, pageId, (type) => newNodeId(type));
      if (!result) return s;
      const pageIdAfter = result.page.id;
      created = pageIdAfter;
      return pageHistoryState(s, result.doc, pageIdAfter, []);
    });
    return created;
  },

  deletePage(pageId: string): boolean {
    stopViewportAnimation();
    let removed = false;
    set((s) => {
      const result = removePageFromDoc(s.doc, pageId);
      if (!result) return s;
      removed = true;
      const deletingCurrent = s.pageId === pageId;
      const pageIdAfter = deletingCurrent ? result.nextPageId : s.pageId;
      const selectionAfter = deletingCurrent ? [] : selectionOnPage(result.doc, pageIdAfter, s.selectedIds);
      return pageHistoryState(s, result.doc, pageIdAfter, selectionAfter);
    });
    return removed;
  },

  applyPatch(id: string, patch: NodePatch) {
    set((s) => {
      const beforeDoc = s.doc;
      const result = patchItems(s.doc, [{ id, patch }]);
      const nextDoc = result.items.length === 0 ? result.doc : liveSyncMasters(result.doc, result.items.map((item) => item.id));
      if (result.items.length === 0) return { ...s, doc: result.doc };
      const synced = nextDoc !== result.doc;
      return {
        ...s,
        doc: nextDoc,
        past: [
          ...s.past,
          synced
            ? ({ kind: 'doc', beforeDoc, afterDoc: nextDoc } as HistoryEntry)
            : ({ kind: 'batch', items: result.items } as HistoryEntry),
        ].slice(-200),
        future: [],
      };
    });
  },

  createStyle(kind: StyleKind, nodeId?: string): string | null {
    const id = nodeId ?? state.selectedId;
    const node = id ? state.doc.nodes[id] : undefined;
    if (!node || !canCreateStyle(kind, node)) return null;
    const existing = Object.values(state.doc.styles ?? {}).filter((style) => style.kind === kind).length;
    styleSeq += 1;
    const styleId = `style-${Date.now().toString(36)}-${styleSeq}`;
    const style = styleFromNode(kind, styleId, styleName(kind, existing), node);
    if (!style) return null;
    const refs = { ...(node.styleRefs ?? {}), [kind]: styleId };
    const after: GromaDoc = {
      ...state.doc,
      styles: { ...(state.doc.styles ?? {}), [styleId]: style },
      nodes: { ...state.doc.nodes, [node.id]: { ...node, styleRefs: refs } },
    };
    set((s) => ({
      ...s,
      doc: after,
      past: [...s.past, { kind: 'doc', beforeDoc: s.doc, afterDoc: after } as HistoryEntry].slice(-200),
      future: [],
    }));
    return styleId;
  },

  applyStyle(styleId: string, nodeId?: string): boolean {
    const id = nodeId ?? state.selectedId;
    const node = id ? state.doc.nodes[id] : undefined;
    const style = state.doc.styles?.[styleId];
    if (!node || !style) return false;
    const result = patchItems(state.doc, [{ id: node.id, patch: styleApplyPatch(style, node) }]);
    if (result.items.length === 0) return false;
    set((s) => ({
      ...s,
      doc: result.doc,
      past: [...s.past, { kind: 'batch', items: result.items } as HistoryEntry].slice(-200),
      future: [],
    }));
    return true;
  },

  /** 用当前节点值覆盖命名样式，并同步所有已绑定该样式的同类型图层。 */
  updateStyle(styleId: string, sourceId?: string): boolean {
    const source = sourceId ? state.doc.nodes[sourceId] : state.selectedId ? state.doc.nodes[state.selectedId] : undefined;
    const style = state.doc.styles?.[styleId];
    if (!source || !style || !canCreateStyle(style.kind, source)) return false;
    const nextStyle = styleFromNode(style.kind, style.id, style.name, source);
    if (!nextStyle) return false;
    const values = styleValuesPatch(nextStyle, source);
    const nodes = { ...state.doc.nodes };
    for (const [nodeId, node] of Object.entries(nodes)) {
      if (node.styleRefs?.[style.kind] !== styleId) continue;
      nodes[nodeId] = { ...node, ...values };
    }
    const after: GromaDoc = {
      ...state.doc,
      styles: { ...(state.doc.styles ?? {}), [styleId]: nextStyle },
      nodes,
    };
    set((s) => ({
      ...s,
      doc: after,
      past: [...s.past, { kind: 'doc', beforeDoc: s.doc, afterDoc: after } as HistoryEntry].slice(-200),
      future: [],
    }));
    return true;
  },

  detachStyle(kind: StyleKind, nodeId?: string): boolean {
    const id = nodeId ?? state.selectedId;
    const node = id ? state.doc.nodes[id] : undefined;
    if (!node?.styleRefs?.[kind]) return false;
    const refs = { ...node.styleRefs };
    delete refs[kind];
    editor.applyPatch(node.id, { styleRefs: Object.keys(refs).length > 0 ? refs : undefined });
    return true;
  },

  deleteStyle(styleId: string): boolean {
    const style = state.doc.styles?.[styleId];
    if (!style) return false;
    const styles = { ...(state.doc.styles ?? {}) };
    delete styles[styleId];
    const nodes = { ...state.doc.nodes };
    for (const [nodeId, node] of Object.entries(nodes)) {
      if (node.styleRefs?.[style.kind] !== styleId) continue;
      const refs = { ...node.styleRefs };
      delete refs[style.kind];
      nodes[nodeId] = { ...node, styleRefs: Object.keys(refs).length > 0 ? refs : undefined };
    }
    const after: GromaDoc = { ...state.doc, styles, nodes };
    set((s) => ({
      ...s,
      doc: after,
      past: [...s.past, { kind: 'doc', beforeDoc: s.doc, afterDoc: after } as HistoryEntry].slice(-200),
      future: [],
    }));
    return true;
  },

  createVariableCollection(name = '主题'): string {
    variableSeq += 1;
    const collectionId = `collection-${Date.now().toString(36)}-${variableSeq}`;
    const modeId = `mode-${Date.now().toString(36)}-${variableSeq}`;
    const after: GromaDoc = {
      ...state.doc,
      variables: {
        ...(state.doc.variables ?? {}),
        [collectionId]: {
          id: collectionId,
          name: name.trim() || `集合 ${variableSeq}`,
          modes: [{ id: modeId, name: '默认' }],
          defaultModeId: modeId,
          variables: {},
        },
      },
      variableModes: { ...(state.doc.variableModes ?? {}), [collectionId]: modeId },
    };
    set((s) => ({
      ...s,
      doc: after,
      past: [...s.past, { kind: 'doc', beforeDoc: s.doc, afterDoc: after } as HistoryEntry].slice(-200),
      future: [],
    }));
    return collectionId;
  },

  addVariableMode(collectionId: string, name: string): string | null {
    const collection = state.doc.variables?.[collectionId];
    if (!collection || collection.modes.length >= 16) return null;
    variableSeq += 1;
    const modeId = `mode-${Date.now().toString(36)}-${variableSeq}`;
    const modeName = name.trim() || `Mode ${collection.modes.length + 1}`;
    const variables = { ...collection.variables };
    for (const [id, variable] of Object.entries(variables)) {
      const base = variable.values[activeModeId(state.doc, collection)];
      variables[id] = { ...variable, values: { ...variable.values, [modeId]: base ?? defaultValueForType(variable.type) } };
    }
    const after: GromaDoc = {
      ...state.doc,
      variables: {
        ...(state.doc.variables ?? {}),
        [collectionId]: { ...collection, modes: [...collection.modes, { id: modeId, name: modeName }], variables },
      },
    };
    set((s) => ({
      ...s,
      doc: after,
      past: [...s.past, { kind: 'doc', beforeDoc: s.doc, afterDoc: after } as HistoryEntry].slice(-200),
      future: [],
    }));
    return modeId;
  },

  addVariable(collectionId: string, name: string, type: VariableType): string | null {
    const collection = state.doc.variables?.[collectionId];
    if (!collection) return null;
    variableSeq += 1;
    const variableId = `var-${Date.now().toString(36)}-${variableSeq}`;
    const values: Record<string, string | number | boolean> = {};
    const fallback = defaultValueForType(type);
    for (const mode of collection.modes) values[mode.id] = fallback;
    const after: GromaDoc = {
      ...state.doc,
      variables: {
        ...(state.doc.variables ?? {}),
        [collectionId]: {
          ...collection,
          variables: {
            ...collection.variables,
            [variableId]: {
              id: variableId,
              name: name.trim() || `变量 ${Object.keys(collection.variables).length + 1}`,
              type,
              collectionId,
              values,
            },
          },
        },
      },
    };
    set((s) => ({
      ...s,
      doc: after,
      past: [...s.past, { kind: 'doc', beforeDoc: s.doc, afterDoc: after } as HistoryEntry].slice(-200),
      future: [],
    }));
    return variableId;
  },

  setVariableValue(collectionId: string, variableId: string, modeId: string, value: string | number | boolean): boolean {
    const collection = state.doc.variables?.[collectionId];
    const variable = collection?.variables[variableId];
    if (!collection || !variable || !collection.modes.some((mode) => mode.id === modeId)) return false;
    if (variable.type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(String(value))) return false;
    if (variable.type === 'number' && !Number.isFinite(Number(value))) return false;
    const nextVariable = { ...variable, values: { ...variable.values, [modeId]: value } };
    let after: GromaDoc = {
      ...state.doc,
      variables: {
        ...(state.doc.variables ?? {}),
        [collectionId]: { ...collection, variables: { ...collection.variables, [variableId]: nextVariable } },
      },
    };
    if (activeModeId(after, collection) === modeId) after = materializeVariables(after, collectionId).doc;
    set((s) => ({
      ...s,
      doc: after,
      past: [...s.past, { kind: 'doc', beforeDoc: s.doc, afterDoc: after } as HistoryEntry].slice(-200),
      future: [],
    }));
    return true;
  },

  setVariableAlias(collectionId: string, variableId: string, targetId: string | null): boolean {
    const collection = state.doc.variables?.[collectionId];
    const variable = collection?.variables[variableId];
    if (!collection || !variable) return false;
    if (targetId && !canAliasVariable(state.doc, variableId, targetId)) return false;
    const { alias: _previous, ...base } = variable;
    const nextVariable = targetId ? { ...base, alias: targetId } : base;
    let after: GromaDoc = {
      ...state.doc,
      variables: {
        ...(state.doc.variables ?? {}),
        [collectionId]: { ...collection, variables: { ...collection.variables, [variableId]: nextVariable } },
      },
    };
    after = materializeVariables(after).doc;
    set((s) => ({
      ...s,
      doc: after,
      past: [...s.past, { kind: 'doc', beforeDoc: s.doc, afterDoc: after } as HistoryEntry].slice(-200),
      future: [],
    }));
    return true;
  },

  setVariableMode(collectionId: string, modeId: string): boolean {
    const collection = state.doc.variables?.[collectionId];
    if (!collection || !collection.modes.some((mode) => mode.id === modeId)) return false;
    const after = materializeVariables(
      { ...state.doc, variableModes: { ...(state.doc.variableModes ?? {}), [collectionId]: modeId } },
      collectionId,
    ).doc;
    set((s) => ({
      ...s,
      doc: after,
      past: [...s.past, { kind: 'doc', beforeDoc: s.doc, afterDoc: after } as HistoryEntry].slice(-200),
      future: [],
    }));
    return true;
  },

  bindVariable(prop: VariableProp, variableId: string, nodeId?: string): boolean {
    const id = nodeId ?? state.selectedId;
    const node = id ? state.doc.nodes[id] : undefined;
    const variable = variableById(state.doc, variableId);
    if (!node || node.locked || !variable || !canBindVariable(variable, prop)) return false;
    const bindings = { ...(node.variableBindings ?? {}), [prop]: variableId };
    const materialized = materializeNodeVariables(state.doc, { ...node, variableBindings: bindings });
    editor.applyPatch(node.id, {
      variableBindings: bindings,
      fills: materialized.fills,
      strokes: materialized.strokes,
      layout: materialized.layout,
      cornerRadius: materialized.cornerRadius,
      cornerRadii: materialized.cornerRadii,
      fontSize: materialized.fontSize,
    });
    return true;
  },

  clearVariableBinding(prop: VariableProp, nodeId?: string): boolean {
    const id = nodeId ?? state.selectedId;
    const node = id ? state.doc.nodes[id] : undefined;
    if (!node?.variableBindings?.[prop]) return false;
    const bindings = { ...node.variableBindings };
    delete bindings[prop];
    editor.applyPatch(node.id, { variableBindings: Object.keys(bindings).length ? bindings : undefined });
    return true;
  },

  renameStyle(styleId: string, name: string): boolean {
    const style = state.doc.styles?.[styleId];
    const next = name.trim().slice(0, 40);
    if (!style || !next) return false;
    const after: GromaDoc = {
      ...state.doc,
      styles: { ...(state.doc.styles ?? {}), [styleId]: { ...style, name: next } as Style },
    };
    set((s) => ({
      ...s,
      doc: after,
      past: [...s.past, { kind: 'doc', beforeDoc: s.doc, afterDoc: after } as HistoryEntry].slice(-200),
      future: [],
    }));
    return true;
  },

  addNode(input: {
    type: 'frame' | 'section' | 'rect' | 'ellipse' | 'text' | 'path' | 'slice';
    parentId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    name?: string;
    fill?: string;
    pathData?: string;
    pathW?: number;
    pathH?: number;
    pathAnchors?: PathAnchor[];
    pathClosed?: boolean;
    shapeKind?: ShapeKind;
    shapeSides?: number;
    shapeInnerRatio?: number;
    arrowHeadData?: string;
    strokes?: Stroke[];
  }): string {
    const id = newNodeId(input.type);
    set((s) => {
      const parent = s.doc.nodes[input.parentId];
      if (!parent) return s;
      const sameType = parent.children
        .map((cid) => s.doc.nodes[cid])
        .filter((n) => n && n.type === input.type).length;
      const isPen = input.type === 'path' && Array.isArray(input.pathAnchors) && input.pathAnchors.length > 0;
      const sameShape =
        isPen
          ? parent.children
              .map((cid) => s.doc.nodes[cid])
              .filter((n) => n && n.type === 'path' && (n.pathAnchors?.length ?? 0) > 0).length
          : input.type === 'path' && input.shapeKind
            ? parent.children
                .map((cid) => s.doc.nodes[cid])
                .filter((n) => n && n.type === 'path' && n.shapeKind === input.shapeKind).length
            : sameType;
      const typeName =
        input.type === 'frame'
          ? '画板'
          : input.type === 'section'
            ? '区块'
            : input.type === 'rect'
              ? '矩形'
              : input.type === 'ellipse'
                ? '椭圆'
                : input.type === 'slice'
                  ? '切片'
                  : input.type === 'path'
                    ? isPen
                      ? '钢笔'
                      : input.shapeKind === 'polygon'
                        ? '多边形'
                        : input.shapeKind === 'star'
                          ? '星形'
                          : input.shapeKind === 'arrow'
                            ? '箭头'
                            : '直线'
                    : '文本';
      const fill =
        input.type === 'frame' || input.type === 'rect' || input.type === 'ellipse'
          ? [{ type: 'solid' as const, color: input.fill ?? (input.type === 'frame' ? '#FFFFFF' : '#D9D9D9'), opacity: 1 }]
          : input.type === 'path'
            ? input.fill
              ? [{ type: 'solid' as const, color: input.fill, opacity: 1 }]
              : []
            : input.type === 'section' || input.type === 'slice'
              ? []
              : [{ type: 'solid' as const, color: input.fill ?? '#221C00', opacity: 1 }];
      const node: SceneNode = {
        id,
        type: input.type,
        name: input.name ?? `${typeName} ${sameShape + 1}`,
        parentId: parent.id,
        children: [],
        x: input.x,
        y: input.y,
        w: Math.max(1, input.w),
        h: Math.max(1, input.h),
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        clipContent: input.type === 'frame',
        fills: fill,
        cornerRadius: 0,
        ...(input.type === 'path'
          ? {
              pathData: input.pathData ?? '',
              pathW: Math.max(0.01, input.pathW ?? input.w),
              pathH: Math.max(0.01, input.pathH ?? input.h),
              ...(input.pathAnchors?.length
                ? { pathAnchors: input.pathAnchors, pathClosed: Boolean(input.pathClosed) }
                : {}),
              ...(input.shapeKind
                ? {
                    shapeKind: input.shapeKind,
                    ...(input.shapeKind === 'arrow'
                      ? { arrowHeadData: input.arrowHeadData ?? '' }
                      : { shapeSides: Math.round(Math.min(12, Math.max(3, input.shapeSides ?? 5))) }),
                    ...(input.shapeKind === 'star'
                      ? { shapeInnerRatio: Math.min(0.9, Math.max(0.1, input.shapeInnerRatio ?? 0.38)) }
                      : {}),
                  }
                : {}),
              strokes:
                input.strokes ??
                [{ color: '#221C00', opacity: 1, width: 2, dash: [], cap: 'butt' as const, join: 'miter' as const }],
            }
          : {}),
        ...(input.type === 'text' ? { text: '文本', fontSize: 24, fontWeight: 600 } : {}),
      };
      const result = applyCommand(s.doc, { type: 'insert', parentId: parent.id, node });
      const past = [
        ...s.past,
        {
          kind: 'add',
          node,
          parentId: parent.id,
          index: result.index ?? parent.children.length,
          subtree: { [id]: node },
        } as HistoryEntry,
      ].slice(-200);
      return { ...withSelection(s, [id]), doc: result.doc, past, future: [] };
    });
    return id;
  },

  insertImage(asset: ImageAsset, place?: { x?: number; y?: number; w?: number; h?: number }): string {
    const id = newNodeId('image');
    set((s) => {
      const page = s.doc.pages.find((item) => item.id === s.pageId);
      const root = page ? s.doc.nodes[page.rootId] : undefined;
      if (!page || !root) return s;

      const selected = s.selectedId ? s.doc.nodes[s.selectedId] : undefined;
      let parent = root;
      if (selected && (selected.type === 'frame' || selected.type === 'section')) {
        parent = selected;
      } else if (selected && selected.parentId) {
        const owner = s.doc.nodes[selected.parentId];
        if (owner && (owner.type === 'frame' || owner.type === 'section')) parent = owner;
      } else {
        const centerX = (s.viewSize.w / 2 - s.viewport.x) / s.viewport.scale;
        const centerY = (s.viewSize.h / 2 - s.viewport.y) / s.viewport.scale;
        const frame = s.viewSize.w > 0 && s.viewSize.h > 0 ? deepestFrame(s.doc, page, centerX, centerY) : null;
        if (frame) parent = frame;
      }

      const naturalW = Math.max(1, asset.w);
      const naturalH = Math.max(1, asset.h);
      const maxW = parent.type === 'frame' || parent.type === 'section' ? Math.max(1, parent.w * 0.8) : 1600;
      const maxH = parent.type === 'frame' || parent.type === 'section' ? Math.max(1, parent.h * 0.8) : 1600;
      const fit = Math.min(1, maxW / naturalW, maxH / naturalH);
      const w = Math.max(1, Math.round(place?.w ?? naturalW * fit));
      const h = Math.max(1, Math.round(place?.h ?? naturalH * fit));
      const x =
        place?.x ??
        (parent.type === 'page'
          ? (s.viewSize.w / 2 - s.viewport.x) / s.viewport.scale - w / 2
          : (parent.w - w) / 2);
      const y =
        place?.y ??
        (parent.type === 'page'
          ? (s.viewSize.h / 2 - s.viewport.y) / s.viewport.scale - h / 2
          : (parent.h - h) / 2);

      const node: SceneNode = {
        id,
        type: 'image',
        name: asset.name || '图片',
        parentId: parent.id,
        children: [],
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        w,
        h,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        clipContent: false,
        fills: [],
        strokes: [],
        cornerRadius: 0,
        assetId: asset.id,
      };
      const result = applyCommand(s.doc, { type: 'insert', parentId: parent.id, node });
      const assets = { ...(s.doc.assets ?? {}), [asset.id]: asset };
      const past = [
        ...s.past,
        {
          kind: 'add',
          node,
          parentId: parent.id,
          index: result.index ?? parent.children.length,
          subtree: { [id]: node },
        } as HistoryEntry,
      ].slice(-200);
      return { ...withSelection(s, [id]), doc: { ...result.doc, assets }, past, future: [] };
    });
    return id;
  },

  setShapeParams(id: string, input: { sides?: number; innerRatio?: number }): boolean {
    let changed = false;
    set((s) => {
      const node = s.doc.nodes[id];
      if (!node || node.type !== 'path' || !node.shapeKind || node.shapeKind === 'arrow' || node.locked) return s;
      const sides = Math.round(Math.min(12, Math.max(3, input.sides ?? node.shapeSides ?? 5)));
      const ratio =
        node.shapeKind === 'star'
          ? Math.min(0.9, Math.max(0.1, input.innerRatio ?? node.shapeInnerRatio ?? 0.38))
          : node.shapeInnerRatio;
      if ((node.shapeSides ?? 5) === sides && (node.shapeInnerRatio ?? 0.38) === ratio) return s;
      const pathData = shapePath(node.shapeKind, node.w, node.h, sides, ratio ?? 0.38);
      const patch: NodePatch = {
        shapeSides: sides,
        pathData,
        pathW: node.w,
        pathH: node.h,
        ...(node.shapeKind === 'star' ? { shapeInnerRatio: ratio } : {}),
      };
      changed = true;
      const after: SceneNode = { ...node, ...patch };
      return {
        ...s,
        doc: run(s.doc, { type: 'patch', id, patch }),
        past: [...s.past, { kind: 'patch', id, before: node, after } as HistoryEntry].slice(-200),
        future: [],
      };
    });
    return changed;
  },

  /**
   * 用世界坐标锚点重算钢笔几何。silent 用于拖拽中连续更新，由调用方用
   * beginTransaction/endTransaction 合成一条撤销；加点/删点直接走历史。
   * 多轮廓节点只替换第一条轮廓，其余轮廓原样保留。
   */
  setPathAnchors(id: string, anchors: PenAnchor[], closed: boolean, silent = false): boolean {
    const node = getState().doc.nodes[id];
    if (!node || node.type !== 'path' || node.locked) return false;
    const contours: PenContour[] = nodePathContours(node).map((contour) => ({
      closed: contour.closed,
      anchors: contour.anchors.map((anchor) => ({ ...anchor })),
    }));
    if (contours.length === 0) return false;
    contours[0] = { anchors: anchors.map((anchor) => ({ ...anchor })), closed };
    return commitPathContours(id, contours, silent);
  },

  /** 世界坐标轮廓写入口；用于分支/多轮廓路径的新增、删除与拖拽。 */
  setPathContours(id: string, contours: PenContour[], silent = false, ensureOpenStroke = false): boolean {
    return commitPathContours(id, contours, silent, ensureOpenStroke);
  },

  fitImageRatio(id: string): boolean {
    let changed = false;
    set((s) => {
      const node = s.doc.nodes[id];
      if (!node || node.type !== 'image' || node.locked) return s;
      const asset = node.assetId ? s.doc.assets?.[node.assetId] : undefined;
      if (!asset || asset.w <= 0 || asset.h <= 0) return s;
      const h = Math.max(1, Math.round((node.w * asset.h / asset.w) * 100) / 100);
      if (Math.abs(h - node.h) < 0.01) return s;
      changed = true;
      const after: SceneNode = { ...node, h };
      return {
        ...s,
        doc: run(s.doc, { type: 'patch', id, patch: { h } }),
        past: [...s.past, { kind: 'patch', id, before: node, after } as HistoryEntry].slice(-200),
        future: [],
      };
    });
    return changed;
  },

  replaceImageAsset(id: string, asset: ImageAsset): boolean {
    let changed = false;
    set((s) => {
      const node = s.doc.nodes[id];
      if (!node || node.type !== 'image' || node.locked) return s;
      if (node.assetId === asset.id) return s;
      changed = true;
      const oldAsset = node.assetId ? s.doc.assets?.[node.assetId] : undefined;
      const rename = !oldAsset || node.name === oldAsset.name || node.name === '图片';
      const patch = rename ? { assetId: asset.id, name: asset.name, imageCrop: undefined } : { assetId: asset.id, imageCrop: undefined };
      const after: SceneNode = { ...node, ...patch };
      return {
        ...s,
        doc: { ...run(s.doc, { type: 'patch', id, patch }), assets: { ...(s.doc.assets ?? {}), [asset.id]: asset } },
        past: [...s.past, { kind: 'patch', id, before: node, after } as HistoryEntry].slice(-200),
        future: [],
      };
    });
    return changed;
  },

  importFrames(input: SvgImport, place?: { x: number; y: number }): string[] {
    const created: string[] = [];
    set((s) => {
      const page = s.doc.pages.find((item) => item.id === s.pageId);
      const root = page ? s.doc.nodes[page.rootId] : undefined;
      if (!page || !root) return s;

      const nodes = { ...s.doc.nodes };
      const items: AddItem[] = [];
      const gap = 48;
      const totalW = input.frames.reduce((sum, frame) => sum + Math.max(1, frame.w), 0) + gap * Math.max(0, input.frames.length - 1);
      const maxH = Math.max(1, ...input.frames.map((frame) => frame.h));
      const siblings = root.children
        .map((id) => s.doc.nodes[id])
        .filter((node): node is SceneNode => Boolean(node && (node.type === 'frame' || node.type === 'section')));
      const occupiedRight = siblings.length
        ? Math.max(...siblings.map((node) => node.x + node.w))
        : null;
      const occupiedTop = siblings.length
        ? Math.min(...siblings.map((node) => node.y))
        : null;
      const centerX = place?.x ?? (s.viewSize.w / 2 - s.viewport.x) / s.viewport.scale;
      const centerY = place?.y ?? (s.viewSize.h / 2 - s.viewport.y) / s.viewport.scale;
      let cursorX = place
        ? centerX - totalW / 2
        : occupiedRight !== null
          ? occupiedRight + 96
          : centerX - totalW / 2;
      const cursorY = place
        ? centerY - maxH / 2
        : occupiedTop !== null
          ? occupiedTop
          : centerY - maxH / 2;

      for (const frame of input.frames) {
        const frameId = newNodeId('frame');
        const subtree: Record<string, SceneNode> = {};
        const frameNode: SceneNode = {
          id: frameId,
          type: 'frame',
          name: frame.name || input.name || '导入图形',
          parentId: root.id,
          children: [],
          x: Math.round(cursorX),
          y: Math.round(cursorY),
          w: Math.max(1, Math.min(16384, frame.w)),
          h: Math.max(1, Math.min(16384, frame.h)),
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          clipContent: true,
          fills: [{ type: 'solid', color: frame.background || '#FFFFFF', opacity: 1 }],
          strokes: [],
          cornerRadius: 0,
        };
        subtree[frameId] = frameNode;

        const build = (source: ImportedNode, parentId: string): string => {
          const id = newNodeId(source.type);
          const node: SceneNode = {
            id,
            type: source.type,
            name: source.name || '图层',
            parentId,
            children: [],
            x: Math.round(source.x * 1000) / 1000,
            y: Math.round(source.y * 1000) / 1000,
            w: Math.max(0.01, Math.round(source.w * 1000) / 1000),
            h: Math.max(0.01, Math.round(source.h * 1000) / 1000),
            rotation: 0,
            opacity: Math.max(0, Math.min(1, source.opacity)),
            visible: true,
            locked: false,
            clipContent: false,
            fills: source.fills,
            strokes: source.strokes,
            cornerRadius: 0,
            ...(source.type === 'path'
              ? {
                  pathData: source.pathData,
                  pathW: source.pathW,
                  pathH: source.pathH,
                  fillRule: source.fillRule,
                }
              : {}),
            ...(source.type === 'text'
              ? {
                  text: source.text,
                  fontSize: source.fontSize,
                  fontWeight: source.fontWeight,
                  fontFamily: source.fontFamily,
                  italic: source.italic,
                  align: source.align,
                  lineHeight: source.lineHeight,
                }
              : {}),
            ...(source.type === 'image' && source.assetId ? { assetId: source.assetId } : {}),
          };
          nodes[id] = node;
          subtree[id] = node;
          node.children = source.children.map((child) => build(child, id));
          return id;
        };

        frameNode.children = frame.children.map((child) => build(child, frameId));
        nodes[frameId] = frameNode;
        items.push({
          node: frameNode,
          parentId: root.id,
          index: root.children.length + items.length,
          subtree,
        });
        created.push(frameId);
        cursorX += Math.max(1, frame.w) + gap;
      }

      nodes[root.id] = { ...root, children: [...root.children, ...items.map((item) => item.node.id)] };
      const past = [...s.past, { kind: 'addBatch', items } as HistoryEntry].slice(-200);
      const assets = { ...(s.doc.assets ?? {}) };
      input.assets.forEach((item) => {
        assets[item.asset.id] = item.asset;
      });
      const importedBounds = {
        x: items[0]?.node.x ?? cursorX,
        y: cursorY,
        w: totalW,
        h: maxH,
      };
      const viewport = s.viewSize.w > 0 && s.viewSize.h > 0
        ? fitRect(importedBounds, s.viewSize.w, s.viewSize.h)
        : s.viewport;
      return {
        ...withSelection(s, created),
        doc: { ...s.doc, nodes, assets },
        past,
        future: [],
        viewport,
        viewports: { ...s.viewports, [page.id]: viewport },
      };
    });
    return created;
  },

  beginTransaction(input: string | string[]) {
    if (transaction) editor.endTransaction();
    const ids = Array.isArray(input) ? input : [input];
    const items: Record<string, SceneNode> = {};
    const page = state.doc.pages.find((item) => item.id === state.pageId) ?? state.doc.pages[0];
    const layoutPage = page ? pageHasAutoLayout(state.doc, page.rootId) : false;
    const stack = layoutPage && page ? [page.rootId] : [...topLevelSelection(state.doc, ids)];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      const node = state.doc.nodes[id];
      if (!node || items[id]) continue;
      items[id] = node;
      stack.push(...node.children);
    }
    transaction = Object.keys(items).length > 0 ? { items, docBefore: state.doc } : null;
  },

  updateSilent(id: string, patch: NodePatch) {
    set((s) => {
      try {
        return { ...s, doc: run(s.doc, { type: 'patch', id, patch }) };
      } catch {
        return s;
      }
    });
  },

  updateManySilent(patches: Array<{ id: string; patch: NodePatch }>) {
    set((s) => {
      if (patches.length === 0) return s;
      return { ...s, doc: patchItems(s.doc, patches).doc };
    });
  },

  endTransaction() {
    const tx = transaction;
    transaction = null;
    if (!tx) return;
    const items: PatchItem[] = [];
    for (const [id, before] of Object.entries(tx.items)) {
      const after = state.doc.nodes[id];
      if (!after) continue;
      if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ id, before, after });
    }
    if (items.length === 0) return;
    set((s) => {
      const nextDoc = liveSyncMasters(s.doc, items.map((item) => item.id));
      if (nextDoc !== s.doc) {
        return {
          ...s,
          doc: nextDoc,
          past: [...s.past, { kind: 'doc', beforeDoc: tx.docBefore, afterDoc: nextDoc } as HistoryEntry].slice(-200),
          future: [],
        };
      }
      return {
        ...s,
        past: [
          ...s.past,
          items.length === 1
            ? ({ kind: 'patch', ...items[0] } as HistoryEntry)
            : ({ kind: 'batch', items } as HistoryEntry),
        ].slice(-200),
        future: [],
      };
    });
  },

  cancelTransaction() {
    const tx = transaction;
    transaction = null;
    if (!tx) return;
    set((s) => {
      let next = s.doc;
      for (const [id, before] of Object.entries(tx.items)) {
        try {
          next = run(next, { type: 'patch', id, patch: before });
        } catch {
          // 单个节点恢复失败不影响其它节点
        }
      }
      return { ...s, doc: next };
    });
  },

  deleteSelected() {
    set((s) => {
      const ids = topLevelSelection(s.doc, s.selectedIds);
      let next = s.doc;
      const items: DeleteItem[] = [];
      for (const id of ids) {
        try {
          const result = applyCommand(next, { type: 'remove', id });
          if (!result.parentId || result.index === undefined || !result.subtree) continue;
          items.push({ parentId: result.parentId, index: result.index, subtree: result.subtree });
          next = result.doc;
        } catch {
          // 跳过不可删除节点
        }
      }
      if (items.length === 0) return s;
      const past = [...s.past, { kind: 'deleteBatch', items } as HistoryEntry].slice(-200);
      return { ...withSelection(s, []), doc: next, past, future: [] };
    });
  },

  duplicateSelected(dx = 12, dy = 12) {
    set((s) => {
      const ids = topLevelSelection(s.doc, s.selectedIds);
      let next = s.doc;
      const items: AddItem[] = [];
      for (const id of ids) {
        try {
          const result = applyCommand(next, {
            type: 'clone',
            id,
            makeId: newNodeId,
            dx,
            dy,
            nameSuffix: ' 副本',
          });
          if (!result.node || !result.parentId || result.index === undefined || !result.subtree) continue;
          items.push({ node: result.node, parentId: result.parentId, index: result.index, subtree: result.subtree });
          next = result.doc;
        } catch {
          // 跳过不可复制节点
        }
      }
      if (items.length === 0) return s;
      const selected = items.map((item) => item.node.id);
      const past = [...s.past, { kind: 'addBatch', items } as HistoryEntry].slice(-200);
      return { ...withSelection(s, selected), doc: next, past, future: [] };
    });
  },

  /** 写入应用内剪贴板。返回是否真的有节点被复制，供快捷键决定是否拦截浏览器默认行为。 */
  copySelected() {
    const s = state;
    const ids = topLevelSelection(s.doc, s.selectedIds);
    if (ids.length === 0) return false;
    const items: NodeClipboardItem[] = [];
    for (const id of ids) {
      const node = s.doc.nodes[id];
      if (!node || !node.parentId) continue;
      const page = pageOfNode(s.doc, id);
      if (!page) continue;
      const subtree: Record<string, SceneNode> = {};
      const walk = (currentId: string) => {
        const current = s.doc.nodes[currentId];
        if (!current) return;
        subtree[currentId] = current;
        for (const childId of current.children) walk(childId);
      };
      walk(id);
      const pagePosition = absolutePosition(s.doc, id);
      items.push({
        rootId: id,
        parentId: node.parentId,
        pageId: page.id,
        pageX: pagePosition.x,
        pageY: pagePosition.y,
        subtree,
      });
    }
    if (items.length === 0) return false;
    nodeClipboard = { projectId: s.projectId, items };
    pasteSeq = 0;
    return true;
  },

  /** 粘贴应用内剪贴板；同工程同一页尽量落回原父级，跨页或父级已删除则落到当前页根。 */
  pasteClipboard() {
    const clip = nodeClipboard;
    if (!clip || clip.items.length === 0 || clip.projectId !== state.projectId) return false;
    const offset = 12 * (pasteSeq + 1);
    let created: string[] = [];
    set((s) => {
      const page = s.doc.pages.find((item) => item.id === s.pageId) ?? s.doc.pages[0];
      const pageRoot = s.doc.nodes[page.rootId];
      if (!pageRoot) return s;
      let next = s.doc;
      const items: AddItem[] = [];
      const roots: string[] = [];
      for (const entry of clip.items) {
        const sourceRoot = entry.subtree[entry.rootId];
        if (!sourceRoot) continue;
        const preferredParentId = entry.pageId === s.pageId && next.nodes[entry.parentId] ? entry.parentId : pageRoot.id;
        const parent = next.nodes[preferredParentId];
        if (!parent) continue;
        const idMap = new Map<string, string>();
        for (const [oldId, oldNode] of Object.entries(entry.subtree)) idMap.set(oldId, newNodeId(oldNode.type));
        const clones: Record<string, SceneNode> = {};
        for (const [oldId, oldNode] of Object.entries(entry.subtree)) {
          const cloneId = idMap.get(oldId) as string;
          const isRoot = oldId === entry.rootId;
          clones[cloneId] = {
            ...oldNode,
            id: cloneId,
            parentId: isRoot ? preferredParentId : (idMap.get(oldNode.parentId ?? '') ?? preferredParentId),
            children: oldNode.children.map((childId) => idMap.get(childId)).filter((x): x is string => Boolean(x)),
            ...(isRoot
              ? {
                  x: (preferredParentId === entry.parentId && entry.pageId === s.pageId ? oldNode.x : entry.pageX) + offset,
                  y: (preferredParentId === entry.parentId && entry.pageId === s.pageId ? oldNode.y : entry.pageY) + offset,
                }
              : {}),
          };
        }
        const root = clones[idMap.get(entry.rootId) as string];
        if (!root) continue;
        const at = parent.children.length;
        next = {
          ...next,
          nodes: { ...next.nodes, ...clones, [parent.id]: { ...parent, children: [...parent.children, root.id] } },
        };
        items.push({ node: root, parentId: parent.id, index: at, subtree: clones });
        roots.push(root.id);
      }
      if (items.length === 0) return s;
      created = roots;
      const past = [...s.past, { kind: 'addBatch', items } as HistoryEntry].slice(-200);
      return { ...withSelection(s, roots), doc: next, past, future: [] };
    });
    if (created.length > 0) pasteSeq += 1;
    return created.length > 0;
  },

  importExternalComponent(sourceDoc: GromaDoc, sourceId: string, sourceRef: LibrarySource): string | null {
    let created: string | null = null;
    set((s) => {
      const page = s.doc.pages.find((p) => p.id === s.pageId);
      if (!page) return s;
      const root = s.doc.nodes[page.rootId];
      if (!root) return s;
      const sourceNode = sourceDoc.nodes[sourceId];
      if (!sourceNode) return s;
      // 和 Figma 一样落在当前视口中心，导入后立刻可见，而不是排到所有画板下方。
      const centerX = (s.viewSize.w / 2 - s.viewport.x) / s.viewport.scale;
      const centerY = (s.viewSize.h / 2 - s.viewport.y) / s.viewport.scale;
      const result = importComponentFromDoc(
        s.doc,
        sourceDoc,
        sourceId,
        newNodeId,
        root.id,
        Math.round(centerX - sourceNode.w / 2),
        Math.round(centerY - sourceNode.h / 2),
        sourceRef,
      );
      if (!result.node || !result.parentId || result.index === undefined || !result.subtree) return s;
      created = result.node.id;
      const past = [
        ...s.past,
        {
          kind: 'addBatch',
          items: [{ node: result.node, parentId: result.parentId, index: result.index, subtree: result.subtree }],
        } as HistoryEntry,
      ].slice(-200);
      return { ...withSelection(s, [result.node.id]), doc: result.doc, past, future: [] };
    });
    return created;
  },

  refreshExternalComponent(sourceDoc: GromaDoc, sourceId: string, targetId: string): boolean {
    let done = false;
    set((s) => {
      const target = s.doc.nodes[targetId];
      if (!target?.isComponent || !target.librarySource) return s;
      try {
        let next = refreshComponentFromDoc(s.doc, target.id, sourceDoc, sourceId, newNodeId).doc;
        // 来源更新后实例跟着走，和 Figma 的库更新一致；覆盖仍按路径重放。
        const instances = Object.values(next.nodes).filter((node) => node.componentOf === target.id).map((node) => node.id);
        for (const instanceId of instances) {
          try {
            next = applyCommand(next, { type: 'sync-instance', id: instanceId, makeId: newNodeId }).doc;
          } catch {
            // 单个实例结构异常不阻断主组件更新。
          }
        }
        done = true;
        const past = [
          ...s.past,
          { kind: 'doc', beforeDoc: s.doc, afterDoc: next } as HistoryEntry,
        ].slice(-200);
        return { ...s, doc: next, past, future: [] };
      } catch {
        return s;
      }
    });
    return done;
  },

  publishComponent(): boolean {
    let done = false;
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!node) return s;
      try {
        const result = publishComponentToLibrary(s.doc, node.id);
        if (!result.before || !result.after) return s;
        done = true;
        return {
          ...s,
          doc: result.doc,
          past: [...s.past, { kind: 'patch', id: node.id, before: result.before, after: result.after } as HistoryEntry].slice(-200),
          future: [],
        };
      } catch {
        return s;
      }
    });
    return done;
  },

  createComponent() {
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!node || node.type !== 'frame' || node.locked || node.isComponent || node.componentOf) return s;
      const result = applyCommand(s.doc, { type: 'patch', id: node.id, patch: { isComponent: true } });
      if (!result.after) return s;
      return {
        ...s,
        doc: result.doc,
        past: [...s.past, { kind: 'patch', id: node.id, before: node, after: result.after } as HistoryEntry].slice(-200),
        future: [],
      };
    });
  },

  createVariantSetFromSelection() {
    set((s) => {
      const ids = topLevelSelection(s.doc, s.selectedIds);
      if (ids.length < 2) return s;
      try {
        const result = applyCommand(s.doc, { type: 'create-variant-set', ids, makeId: newNodeId });
        if (!result.node || !result.beforeNodes || !result.afterNodes) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: result.undoRemove ?? [],
          redoRemove: result.redoRemove ?? [],
          selectionBefore: ids,
          selectionAfter: [result.node.id],
        };
        return { ...withSelection(s, [result.node.id]), doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
      } catch {
        return s;
      }
    });
  },

  addVariant() {
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!node?.isComponent || !node.variantSetId) return s;
      try {
        const result = applyCommand(s.doc, { type: 'add-variant', id: node.id, makeId: newNodeId });
        if (!result.node || !result.beforeNodes || !result.afterNodes) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: result.undoRemove ?? [],
          redoRemove: result.redoRemove ?? [],
          selectionBefore: [node.id],
          selectionAfter: [result.node.id],
        };
        return { ...withSelection(s, [result.node.id]), doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
      } catch {
        return s;
      }
    });
  },

  addVariantProperty(name: string) {
    let changed = false;
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!node?.isVariantSet || node.locked) return s;
      try {
        const result = applyCommand(s.doc, { type: 'add-variant-property', setId: node.id, name });
        if (!result.node || !result.beforeNodes || !result.afterNodes) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: [],
          redoRemove: [],
          selectionBefore: [node.id],
          selectionAfter: [node.id],
        };
        changed = true;
        return { ...s, doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
      } catch {
        return s;
      }
    });
    return changed;
  },

  addVariantCombo(props: Record<string, string>, sourceId?: string) {
    let changed = false;
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      const setNode = node?.isVariantSet ? node : node?.variantSetId ? s.doc.nodes[node.variantSetId] : null;
      if (!setNode?.isVariantSet || setNode.locked) return s;
      try {
        const result = applyCommand(s.doc, { type: 'create-variant-combo', setId: setNode.id, props, makeId: newNodeId, sourceId });
        if (!result.node || !result.beforeNodes || !result.afterNodes) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: result.undoRemove ?? [],
          redoRemove: result.redoRemove ?? [],
          selectionBefore: [setNode.id],
          selectionAfter: [setNode.id],
        };
        changed = true;
        return { ...s, doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
      } catch {
        return s;
      }
    });
    return changed;
  },

  switchVariant(targetId: string) {
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!node?.componentOf || node.type !== 'frame') return s;
      try {
        const result = applyCommand(s.doc, { type: 'switch-variant', id: node.id, targetId, makeId: newNodeId });
        if (!result.node || !result.beforeNodes || !result.afterNodes) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: result.undoRemove ?? [],
          redoRemove: result.redoRemove ?? [],
          selectionBefore: [node.id],
          selectionAfter: [node.id],
        };
        return { ...s, doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
      } catch {
        return s;
      }
    });
  },

  swapComponentInstance(targetId: string) {
    set((s) => {
      const selected = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!selected) return s;
      const node = selected.componentOf ? selected : ancestorInstance(s.doc, selected.id);
      if (!node?.componentOf || node.type !== 'frame') return s;
      try {
        const result = applyCommand(s.doc, { type: 'swap-instance', id: node.id, targetId, makeId: newNodeId });
        if (!result.node || !result.beforeNodes || !result.afterNodes) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: result.undoRemove ?? [],
          redoRemove: result.redoRemove ?? [],
          selectionBefore: [selected.id],
          selectionAfter: [node.id],
        };
        return { ...s, doc: result.doc, selectedId: node.id, selectedIds: [node.id], past: [...s.past, entry].slice(-200), future: [] };
      } catch {
        return s;
      }
    });
  },

  renameVariantProperty(prop: string, value: string) {
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!node?.variantSetId || !node.isComponent || node.locked) return s;
      const key = prop.trim();
      if (!key || !value.trim()) return s;
      const nextProps = { ...(node.variantProps ?? {}), [key]: value.trim() };
      const result = applyCommand(s.doc, { type: 'patch', id: node.id, patch: { variantProps: nextProps } });
      if (!result.after) return s;
      const entry: HistoryEntry = { kind: 'patch', id: node.id, before: node, after: result.after };
      return { ...s, doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
    });
  },

  createComponentInstance() {
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!node?.isComponent || node.type !== 'frame') return s;
      try {
        const result = applyCommand(s.doc, {
          type: 'create-instance',
          id: node.id,
          makeId: newNodeId,
        });
        if (!result.node || !result.parentId || result.index === undefined) return s;
        const entry: HistoryEntry = {
          kind: 'add',
          node: result.node,
          parentId: result.parentId,
          index: result.index,
          subtree: result.subtree,
        };
        return { ...withSelection(s, [result.node.id]), doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
      } catch {
        return s;
      }
    });
  },

  syncComponentInstance() {
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!node?.componentOf || node.type !== 'frame') return s;
      try {
        const result = applyCommand(s.doc, { type: 'sync-instance', id: node.id, makeId: newNodeId });
        if (!result.node || !result.beforeNodes || !result.afterNodes) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: result.undoRemove ?? [],
          redoRemove: result.redoRemove ?? [],
          selectionBefore: [node.id],
          selectionAfter: [node.id],
        };
        return { ...s, doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
      } catch {
        return s;
      }
    });
  },

  syncComponentInstances() {
    set((s) => {
      const master = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!master?.isComponent || master.type !== 'frame') return s;
      const instanceIds = Object.values(s.doc.nodes)
        .filter((node) => node.componentOf === master.id && node.type === 'frame')
        .map((node) => node.id);
      if (instanceIds.length === 0) return s;
      let next = s.doc;
      const beforeNodes: Record<string, SceneNode> = {};
      const afterNodes: Record<string, SceneNode> = {};
      const undoRemove: string[] = [];
      const redoRemove: string[] = [];
      for (const id of instanceIds) {
        try {
          const result = applyCommand(next, { type: 'sync-instance', id, makeId: newNodeId });
          next = result.doc;
          Object.assign(beforeNodes, result.beforeNodes ?? {});
          Object.assign(afterNodes, result.afterNodes ?? {});
          undoRemove.push(...(result.undoRemove ?? []));
          redoRemove.push(...(result.redoRemove ?? []));
        } catch {
          // 单个实例失效不应阻断其余实例
        }
      }
      if (Object.keys(afterNodes).length === 0) return s;
      const entry: HistoryEntry = {
        kind: 'structure',
        beforeNodes,
        afterNodes,
        undoRemove,
        redoRemove,
        selectionBefore: [master.id],
        selectionAfter: [master.id],
      };
      return { ...s, doc: next, past: [...s.past, entry].slice(-200), future: [] };
    });
  },

  resetInstanceOverride() {
    set((s) => {
      const id = s.selectedId;
      const node = id ? s.doc.nodes[id] : null;
      if (!node) return s;
      const instance = ancestorInstance(s.doc, node.id);
      if (!instance) return s;
      const path = instancePath(s.doc, instance.id, node.id);
      if (!path || !instance.instanceOverrides?.[path]) return s;
      const overrides = { ...instance.instanceOverrides };
      delete overrides[path];
      const nextOverrides = Object.keys(overrides).length > 0 ? overrides : undefined;
      let doc = s.doc;
      const past = [...s.past];
      const patch = applyCommand(doc, { type: 'patch', id: instance.id, patch: { instanceOverrides: nextOverrides } });
      if (!patch.after) return s;
      doc = patch.doc;
      past.push({ kind: 'patch', id: instance.id, before: patch.before ?? instance, after: patch.after });
      const sync = applyCommand(doc, { type: 'sync-instance', id: instance.id, makeId: newNodeId });
      if (!sync.node) {
        return { ...s, doc, past: past.slice(-200), future: [] };
      }
      const rootAfter = sync.doc.nodes[instance.id] ?? sync.node;
      past.push({
        kind: 'structure',
        beforeNodes: sync.beforeNodes ?? {},
        afterNodes: sync.afterNodes ?? {},
        undoRemove: sync.undoRemove ?? [],
        redoRemove: sync.redoRemove ?? [],
        selectionBefore: [node.id],
        selectionAfter: [rootAfter.id],
      });
      return {
        ...s,
        doc: sync.doc,
        selectedId: rootAfter.id,
        selectedIds: [rootAfter.id],
        past: past.slice(-200),
        future: [],
      };
    });
  },

  detachComponentInstance() {
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      if (!node?.componentOf || node.locked) return s;
      const result = applyCommand(s.doc, { type: 'patch', id: node.id, patch: { componentOf: undefined, instanceOverrides: undefined } });
      if (!result.after) return s;
      return {
        ...s,
        doc: result.doc,
        past: [...s.past, { kind: 'patch', id: node.id, before: node, after: result.after } as HistoryEntry].slice(-200),
        future: [],
      };
    });
  },

  selectComponentMaster() {
    const node = state.selectedId ? state.doc.nodes[state.selectedId] : null;
    const master = node?.componentOf ? state.doc.nodes[node.componentOf] : null;
    if (master) editor.select(master.id);
  },

  setPrototypeTarget(id: string, targetId: string) {
    set((s) => {
      const node = s.doc.nodes[id];
      const target = targetId ? s.doc.nodes[targetId] : null;
      if (!node || node.locked) return s;
      if (targetId && (!target || target.type !== 'frame')) return s;
      const patch = { prototype: targetId ? { targetId, trigger: 'click' as const } : undefined };
      const result = applyCommand(s.doc, { type: 'patch', id, patch });
      if (!result.after) return s;
      return {
        ...s,
        doc: result.doc,
        past: [...s.past, { kind: 'patch', id, before: node, after: result.after } as HistoryEntry].slice(-200),
        future: [],
      };
    });
  },

  openPrototype(startId?: string) {
    const current = state;
    const page = current.doc.pages.find((item) => item.id === current.pageId) ?? current.doc.pages[0];
    const explicit = startId ? current.doc.nodes[startId] : null;
    const start = explicit?.type === 'frame' ? explicit : prototypeStart(current.doc, page, current.selectedId);
    if (!start || start.type !== 'frame') return;
    set((s) => ({ ...s, prototypeStartId: start.id }));
  },

  closePrototype() {
    set((s) => ({ ...s, prototypeStartId: null }));
  },

  moveLayoutOrder(direction: -1 | 1) {
    set((s) => {
      const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
      const parent = node?.parentId ? s.doc.nodes[node.parentId] : null;
      if (!node || !parent?.layout) return s;
      const index = parent.children.indexOf(node.id);
      if (index < 0) return s;
      const target = index + direction;
      if (target < 0 || target >= parent.children.length) return s;
      const result = applyCommand(s.doc, { type: 'reorder', id: node.id, toIndex: target });
      if (!result.beforeNodes || !result.afterNodes) return s;
      const entry: HistoryEntry = {
        kind: 'structure',
        beforeNodes: result.beforeNodes,
        afterNodes: result.afterNodes,
        undoRemove: [],
        redoRemove: [],
        selectionBefore: [node.id],
        selectionAfter: [node.id],
      };
      return { ...s, doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
    });
  },

  /** 图层树拖拽换父级；世界位置保持不变，整棵子树跟着移动。 */
  reparentNode(id: string, parentId: string, toIndex: number) {
    set((s) => {
      try {
        const result = applyCommand(s.doc, { type: 'reparent', id, parentId, toIndex });
        if (!result.beforeNodes || !result.afterNodes || Object.keys(result.beforeNodes).length === 0) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: [],
          redoRemove: [],
          selectionBefore: s.selectedIds,
          selectionAfter: s.selectedIds,
        };
        return { ...s, doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
      } catch {
        return s;
      }
    });
  },

  /** 上移/下移一层；同级多选保持相对顺序，整批只进一条撤销。 */
  moveSelectedLayer(direction: -1 | 1) {
    set((s) => {
      const ids = topLevelSelection(s.doc, s.selectedIds).filter((id) => {
        const node = s.doc.nodes[id];
        return Boolean(node && !node.locked && node.parentId && s.doc.nodes[node.parentId]);
      });
      if (ids.length === 0) return s;
      const groups = new Map<string, string[]>();
      for (const id of ids) {
        const parentId = s.doc.nodes[id]?.parentId;
        if (!parentId) continue;
        const list = groups.get(parentId) ?? [];
        list.push(id);
        groups.set(parentId, list);
      }
      let next = s.doc;
      const beforeNodes: Record<string, SceneNode> = {};
      const afterNodes: Record<string, SceneNode> = {};
      let changed = false;
      for (const [parentId, group] of groups) {
        const parent = next.nodes[parentId];
        if (!parent) continue;
        const ordered = [...group].sort((a, b) => parent.children.indexOf(a) - parent.children.indexOf(b));
        if (direction === 1) ordered.reverse();
        for (const id of ordered) {
          const currentParent = next.nodes[parentId];
          if (!currentParent) continue;
          const index = currentParent.children.indexOf(id);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= currentParent.children.length) continue;
          const result = applyCommand(next, { type: 'reorder', id, toIndex: target });
          if (!result.beforeNodes || !result.afterNodes || Object.keys(result.beforeNodes).length === 0) continue;
          for (const [key, node] of Object.entries(result.beforeNodes)) {
            if (!(key in beforeNodes)) beforeNodes[key] = node;
          }
          for (const [key, node] of Object.entries(result.afterNodes)) afterNodes[key] = node;
          next = result.doc;
          changed = true;
        }
      }
      if (!changed) return s;
      const entry: HistoryEntry = {
        kind: 'structure',
        beforeNodes,
        afterNodes,
        undoRemove: [],
        redoRemove: [],
        selectionBefore: s.selectedIds,
        selectionAfter: s.selectedIds,
      };
      return { ...s, doc: next, past: [...s.past, entry].slice(-200), future: [] };
    });
  },

  /** 置顶 / 置底；同级多选保持原有相对顺序，整批只进一条撤销。 */
  moveSelectedToEdge(edge: 'front' | 'back') {
    set((s) => {
      const ids = topLevelSelection(s.doc, s.selectedIds);
      if (ids.length === 0) return s;
      const groups = new Map<string, string[]>();
      for (const id of ids) {
        const parent = s.doc.nodes[s.doc.nodes[id]?.parentId ?? ''];
        if (!parent) continue;
        const list = groups.get(parent.id) ?? [];
        list.push(id);
        groups.set(parent.id, list);
      }
      if (groups.size === 0) return s;
      let next = s.doc;
      const beforeNodes: Record<string, SceneNode> = {};
      const afterNodes: Record<string, SceneNode> = {};
      let changed = false;
      for (const [parentId, group] of groups) {
        const parent = next.nodes[parentId];
        if (!parent) continue;
        const ordered = [...group].sort((a, b) => parent.children.indexOf(a) - parent.children.indexOf(b));
        if (edge === 'back') ordered.reverse();
        for (const id of ordered) {
          const currentParent = next.nodes[parentId];
          if (!currentParent) continue;
          const target = edge === 'front' ? currentParent.children.length - 1 : 0;
          const result = applyCommand(next, { type: 'reorder', id, toIndex: target });
          if (!result.beforeNodes || !result.afterNodes || Object.keys(result.beforeNodes).length === 0) continue;
          for (const [key, node] of Object.entries(result.beforeNodes)) {
            if (!(key in beforeNodes)) beforeNodes[key] = node;
          }
          for (const [key, node] of Object.entries(result.afterNodes)) afterNodes[key] = node;
          next = result.doc;
          changed = true;
        }
      }
      if (!changed) return s;
      const entry: HistoryEntry = {
        kind: 'structure',
        beforeNodes,
        afterNodes,
        undoRemove: [],
        redoRemove: [],
        selectionBefore: s.selectedIds,
        selectionAfter: s.selectedIds,
      };
      return { ...s, doc: next, past: [...s.past, entry].slice(-200), future: [] };
    });
  },

  nudgeSelected(dx: number, dy: number) {
    set((s) => {
      const ids = topLevelSelection(s.doc, s.selectedIds).filter((id) => !isAutoLayoutChild(s.doc, id));
      const patches = ids.map((id) => {
        const node = s.doc.nodes[id];
        return { id, patch: { x: (node?.x ?? 0) + dx, y: (node?.y ?? 0) + dy } };
      });
      const result = patchItems(s.doc, patches);
      if (result.items.length === 0) return s;
      return {
        ...s,
        doc: result.doc,
        past: [...s.past, { kind: 'batch', items: result.items } as HistoryEntry].slice(-200),
        future: [],
      };
    });
  },

  alignSelection(mode: AlignMode) {
    set((s) => {
      const top = topLevelSelection(s.doc, s.selectedIds);
      const deltas = top.length === 1 ? alignToParentDeltas(s.doc, top[0], mode) : alignDeltas(s.doc, s.selectedIds, mode);
      if (deltas.length === 0) return s;
      const result = patchItems(
        s.doc,
        deltas.map(({ id, dx, dy }) => {
          const node = s.doc.nodes[id];
          return { id, patch: { x: (node?.x ?? 0) + dx, y: (node?.y ?? 0) + dy } };
        }),
      );
      if (result.items.length === 0) return s;
      return {
        ...s,
        doc: result.doc,
        past: [...s.past, { kind: 'batch', items: result.items } as HistoryEntry].slice(-200),
        future: [],
      };
    });
  },

  distributeSelection(mode: DistributeMode) {
    set((s) => {
      const deltas = distributeDeltas(s.doc, s.selectedIds, mode);
      if (deltas.length === 0) return s;
      const result = patchItems(
        s.doc,
        deltas.map(({ id, dx, dy }) => {
          const node = s.doc.nodes[id];
          return { id, patch: { x: (node?.x ?? 0) + dx, y: (node?.y ?? 0) + dy } };
        }),
      );
      if (result.items.length === 0) return s;
      return {
        ...s,
        doc: result.doc,
        past: [...s.past, { kind: 'batch', items: result.items } as HistoryEntry].slice(-200),
        future: [],
      };
    });
  },

  booleanSelected(op: BooleanOp): boolean {
    return editor.booleanGroupSelected(op);
  },

  booleanGroupSelected(op: BooleanOp): boolean {
    let changed = false;
    set((s) => {
      try {
        const result = applyCommand(s.doc, {
          type: 'boolean',
          ids: s.selectedIds,
          op,
          makeId: newNodeId,
        });
        if (!result.node || !result.beforeNodes || !result.afterNodes) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: [result.node.id],
          redoRemove: [],
          selectionBefore: s.selectedIds,
          selectionAfter: [result.node.id],
        };
        changed = true;
        return {
          ...withSelection(s, [result.node.id]),
          doc: result.doc,
          past: [...s.past, entry].slice(-200),
          future: [],
        };
      } catch {
        return s;
      }
    });
    return changed;
  },

  setBooleanOp(op: BooleanOp): boolean {
    const current = getState();
    const node = current.selectedIds.length === 1 ? current.doc.nodes[current.selectedIds[0]] : undefined;
    if (!node || node.type !== 'boolean' || node.booleanOp === op) return false;
    editor.applyPatch(node.id, { booleanOp: op });
    return true;
  },

  vectorSelected(action: VectorAction): boolean {
    if (action === 'union' || action === 'subtract' || action === 'intersect' || action === 'exclude') {
      return editor.booleanGroupSelected(action);
    }
    let changed = false;
    set((s) => {
      const build = vectorActionBuild(s.doc, s.selectedIds, action, () => newNodeId('path'));
      if ('error' in build) return s;
      const nodes = { ...s.doc.nodes };
      const beforeNodes: Record<string, SceneNode> = {};
      const afterNodes: Record<string, SceneNode> = {};
      const parentIds = new Set<string>();
      const removeIds = new Set(build.removeSourceIds);
      for (const removedId of [...removeIds]) {
        const removed = s.doc.nodes[removedId];
        if (removed?.type === 'boolean') {
          for (const descendantId of Object.keys(collectSubtree(s.doc, removedId))) removeIds.add(descendantId);
        }
      }
      for (const sourceId of build.sourceIds) {
        const source = s.doc.nodes[sourceId];
        if (!source?.parentId) return s;
        beforeNodes[sourceId] = source;
        parentIds.add(source.parentId);
      }
      for (const removedId of removeIds) {
        const removed = s.doc.nodes[removedId];
        if (removed) beforeNodes[removedId] = removed;
      }
      for (const parentId of parentIds) {
        const parent = s.doc.nodes[parentId];
        if (!parent) return s;
        beforeNodes[parentId] = parent;
      }
      for (const sourceId of removeIds) delete nodes[sourceId];
      for (const [sourceId, patched] of Object.entries(build.sourcePatches)) {
        nodes[sourceId] = patched;
        afterNodes[sourceId] = patched;
      }
      for (const parentId of parentIds) {
        const parent = s.doc.nodes[parentId];
        const children = parent.children.filter((childId) => !removeIds.has(childId));
        const firstIndex = parent.children.indexOf(build.sourceIds[0]);
        const insertIndex = build.replaceSources
          ? children.filter((childId) => parent.children.indexOf(childId) < firstIndex).length
          : children.filter((childId) => {
              const index = parent.children.indexOf(childId);
              return index >= 0 && index <= Math.max(...build.sourceIds.map((id) => parent.children.indexOf(id)));
            }).length;
        children.splice(insertIndex, 0, ...build.nodes.map((node) => node.id));
        nodes[parentId] = { ...parent, children };
        afterNodes[parentId] = nodes[parentId];
      }
      for (const node of build.nodes) {
        nodes[node.id] = node;
        afterNodes[node.id] = node;
      }
      const entry: HistoryEntry = {
        kind: 'structure',
        beforeNodes,
        afterNodes,
        undoRemove: build.nodes.map((node) => node.id),
        redoRemove: [...removeIds],
        selectionBefore: s.selectedIds,
        selectionAfter: build.nodes.map((node) => node.id),
      };
      changed = true;
      return {
        ...withSelection(s, build.nodes.map((node) => node.id)),
        doc: { ...s.doc, nodes },
        past: [...s.past, entry].slice(-200),
        future: [],
      };
    });
    return changed;
  },

  groupSelected() {
    set((s) => {
      if (s.selectedIds.length < 2) return s;
      try {
        const result = applyCommand(s.doc, {
          type: 'group',
          ids: s.selectedIds,
          makeId: newNodeId,
        });
        if (!result.node || !result.beforeNodes || !result.afterNodes) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: result.undoRemove ?? [],
          redoRemove: result.redoRemove ?? [],
          selectionBefore: s.selectedIds,
          selectionAfter: [result.node.id],
        };
        return { ...withSelection(s, [result.node.id]), doc: result.doc, past: [...s.past, entry].slice(-200), future: [] };
      } catch {
        return s;
      }
    });
  },

  ungroupSelected() {
    set((s) => {
      if (s.selectedIds.length !== 1) return s;
      const node = s.doc.nodes[s.selectedIds[0]];
      if (!node || (node.type !== 'group' && node.type !== 'boolean')) return s;
      try {
        const result = applyCommand(s.doc, { type: 'ungroup', id: node.id });
        if (!result.childIds || !result.beforeNodes || !result.afterNodes || !result.parentId) return s;
        const entry: HistoryEntry = {
          kind: 'structure',
          beforeNodes: result.beforeNodes,
          afterNodes: result.afterNodes,
          undoRemove: result.undoRemove ?? [],
          redoRemove: result.redoRemove ?? [node.id],
          selectionBefore: [node.id],
          selectionAfter: result.childIds,
        };
        return {
          ...withSelection(s, result.childIds),
          doc: result.doc,
          past: [...s.past, entry].slice(-200),
          future: [],
        };
      } catch {
        return s;
      }
    });
  },

  undo() {
    stopViewportAnimation();
    set((s) => {
      const entry = s.past[s.past.length - 1];
      if (!entry) return s;
      const doc = applyEntry(s.doc, entry, 'undo');
      const pageId = pageIdAfterEntry(entry, 'undo', s.pageId);
      const safePageId = doc.pages.some((page) => page.id === pageId) ? pageId : doc.pages[0].id;
      const preferred = selectionAfterEntry(entry, 'undo', s.selectedIds);
      const ids = selectionOnPage(doc, safePageId, validSelection(doc, preferred ?? s.selectedIds));
      let next: EditorState = {
        ...withSelection(s, ids),
        doc,
        pageId: safePageId,
        past: s.past.slice(0, -1),
        future: [...s.future, entry],
      };
      if (safePageId !== s.pageId) next = pageViewportState(next, safePageId);
      return next;
    });
  },

  redo() {
    stopViewportAnimation();
    set((s) => {
      const entry = s.future[s.future.length - 1];
      if (!entry) return s;
      const doc = applyEntry(s.doc, entry, 'redo');
      const pageId = pageIdAfterEntry(entry, 'redo', s.pageId);
      const safePageId = doc.pages.some((page) => page.id === pageId) ? pageId : doc.pages[0].id;
      const preferred = selectionAfterEntry(entry, 'redo', s.selectedIds);
      const ids = selectionOnPage(doc, safePageId, validSelection(doc, preferred ?? s.selectedIds));
      let next: EditorState = {
        ...withSelection(s, ids),
        doc,
        pageId: safePageId,
        past: [...s.past, entry].slice(-200),
        future: s.future.slice(0, -1),
      };
      if (safePageId !== s.pageId) next = pageViewportState(next, safePageId);
      return next;
    });
  },

  newDoc(name = '未命名设计', width = 1440, height = 900, frameName?: string, withFrame = true) {
    stopViewportAnimation();
    const doc = createDoc(name, width, height, frameName, withFrame);
    transaction = null;
    set((s) => {
      const next: EditorState = {
        ...s,
        doc,
        pageId: doc.pages[0].id,
        selectedId: null,
        selectedIds: [],
        projectId: null,
        saveState: 'local',
        cropId: null,
        needsFit: true,
        viewports: {},
        past: [],
        future: [],
      };
      if (s.viewSize.w > 0 && s.viewSize.h > 0) {
        next.viewport = computeFit(next);
        next.needsFit = false;
      }
      return next;
    });
  },
};

export function selectedNode(s: EditorState): SceneNode | null {
  return s.selectedId ? (s.doc.nodes[s.selectedId] ?? null) : null;
}

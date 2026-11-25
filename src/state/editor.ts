import { useSyncExternalStore } from 'react';
import { createDoc } from '../core/doc';
import { applyCommand, type NodePatch, type SceneCommand } from '../core/commands';
import {
  addPage as addPageToDoc,
  duplicatePage as duplicatePageInDoc,
  movePage as movePageInDoc,
  pageContainsNode,
  removePage as removePageFromDoc,
  renamePage as renamePageInDoc,
} from '../core/pages';
import type { GromaDoc, Guide, ImageAsset, NodeType, PathAnchor, Rect, SceneNode, Stroke } from '../core/types';
import { clampScale, fitRect, zoomAt, type Viewport } from '../core/viewport';
import type { ProjectUiState } from './project-ui';
import type { ImportedNode, SvgImport } from '../io/importSvg';
import { alignDeltas, distributeDeltas, type AlignMode, type DistributeMode } from '../core/align';
import { absolutePosition, absoluteRect, deepestFrame, topLevelSelection } from '../core/geometry';
import { shapePath, type ShapeKind } from '../core/shapes';
import { nodePathContours, penContoursGeometry, type PenAnchor, type PenContour } from '../core/pen';
import { booleanPathNode, type BooleanOp } from '../core/boolean';

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
  leftOpen: boolean;
  rightOpen: boolean;
  needsFit: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

interface Transaction {
  items: Record<string, SceneNode>;
}

let state: EditorState;
let transaction: Transaction | null = null;
let idSeq = 0;
let viewportAnimFrame = 0;

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
    leftOpen: true,
    rightOpen: true,
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
  return { ...s, selectedIds: ids, selectedId: ids[0] ?? null };
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

function patchItems(
  doc: GromaDoc,
  patches: Array<{ id: string; patch: NodePatch }>,
): { doc: GromaDoc; items: PatchItem[] } {
  let next = doc;
  const items: PatchItem[] = [];
  for (const { id, patch } of patches) {
    try {
      const result = applyCommand(next, { type: 'patch', id, patch });
      if (!result.before || !result.after) continue;
      if (JSON.stringify(result.before) !== JSON.stringify(result.after)) {
        items.push({ id, before: result.before, after: result.after });
      }
      next = result.doc;
    } catch {
      // 单个节点补丁失败不应让整批操作停在中途
    }
  }
  return { doc: next, items };
}

function patchForTarget(from: SceneNode, target: SceneNode): NodePatch {
  const patch = { ...target } as Record<string, unknown>;
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

  selectMany(ids: string[]) {
    set((s) => withSelection(s, validSelection(s.doc, [...new Set(ids)])));
  },

  clearSelection() {
    set((s) => (s.selectedIds.length === 0 ? s : withSelection(s, [])));
  },

  toggleSelected(id: string) {
    editor.select(id, true);
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
      const result = patchItems(s.doc, [{ id, patch }]);
      if (result.items.length === 0) return { ...s, doc: result.doc };
      return {
        ...s,
        doc: result.doc,
        past: [...s.past, { kind: 'batch', items: result.items } as HistoryEntry].slice(-200),
        future: [],
      };
    });
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
      const patch = rename ? { assetId: asset.id, name: asset.name } : { assetId: asset.id };
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
    for (const id of topLevelSelection(state.doc, ids)) {
      const node = state.doc.nodes[id];
      if (node) items[id] = node;
    }
    transaction = Object.keys(items).length > 0 ? { items } : null;
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
    set((s) => ({
      ...s,
      past: [
        ...s.past,
        items.length === 1
          ? ({ kind: 'patch', ...items[0] } as HistoryEntry)
          : ({ kind: 'batch', items } as HistoryEntry),
      ].slice(-200),
      future: [],
    }));
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

  duplicateSelected() {
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
            dx: 12,
            dy: 12,
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

  nudgeSelected(dx: number, dy: number) {
    set((s) => {
      const ids = topLevelSelection(s.doc, s.selectedIds);
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
      const deltas = alignDeltas(s.doc, s.selectedIds, mode);
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
    let changed = false;
    set((s) => {
      const build = booleanPathNode(s.doc, s.selectedIds, op, newNodeId('path'));
      if ('error' in build) return s;
      const nodes = { ...s.doc.nodes };
      const beforeNodes: Record<string, SceneNode> = {};
      const afterNodes: Record<string, SceneNode> = {};
      const parentIds = new Set<string>();
      for (const sourceId of build.sourceIds) {
        const source = s.doc.nodes[sourceId];
        if (!source?.parentId) return s;
        beforeNodes[sourceId] = source;
        parentIds.add(source.parentId);
      }
      for (const parentId of parentIds) {
        const parent = s.doc.nodes[parentId];
        if (!parent) return s;
        beforeNodes[parentId] = parent;
      }
      for (const sourceId of build.sourceIds) delete nodes[sourceId];
      for (const parentId of parentIds) {
        const parent = s.doc.nodes[parentId];
        const children = parent.children.filter((childId) => !build.sourceIds.includes(childId));
        if (parentId === build.parentId) {
          const firstIndex = parent.children.indexOf(build.sourceIds[0]);
          children.splice(Math.max(0, Math.min(firstIndex, children.length)), 0, build.node.id);
        }
        nodes[parentId] = { ...parent, children };
        afterNodes[parentId] = nodes[parentId];
      }
      nodes[build.node.id] = build.node;
      afterNodes[build.node.id] = build.node;
      const entry: HistoryEntry = {
        kind: 'structure',
        beforeNodes,
        afterNodes,
        undoRemove: [build.node.id],
        redoRemove: build.sourceIds,
        selectionBefore: s.selectedIds,
        selectionAfter: [build.node.id],
      };
      changed = true;
      return {
        ...withSelection(s, [build.node.id]),
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
      if (!node || node.type !== 'group') return s;
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

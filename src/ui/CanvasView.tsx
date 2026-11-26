import { useEffect, useRef, useState } from 'react';
import { RULER, drawEditor, drawRulers, type DrawStats } from '../render/draw';import { screenToWorld } from '../core/viewport';
import { hitTestGuide, guideScreenPosition } from '../core/guides';
import { arrowGeometry } from '../core/arrow';
import { lineGeometry } from '../core/line';
import {
  insertPenAnchor,
  nearestOnPenPath,
  pathContoursToWorld,
  penGeometry,
  penPathData,
  removePenVertex,
  syncSharedPenVertex,
  togglePenAnchorType,
  type PenAnchor,
  type PenContour,
} from '../core/pen';
import { shapePath } from '../core/shapes';
import {
  absolutePosition,
  absoluteRect,
  deepestFrameOrSection,
  deepestFrame,
  hitTest,
  hitTestDeep,
  marqueeSelection,
  selectionBounds,
  topLevelSelection,
} from '../core/geometry';
import {
  collectSnapTargets,
  snapResizeRect,
  snapSelectionBounds,
  type HorizontalSnapEdge,
  type SnapGuide,
  type VerticalSnapEdge,
} from '../core/snapping';
import { editor, getState, useEditor } from '../state/editor';
import { setPenAnchorSelection } from '../state/pen-selection';
import { setCursor } from '../state/cursor';
import { subscribeImages } from '../io/images';
import type { Guide, ImageCrop, Rect, SceneNode } from '../core/types';
import { imageCropOf, MIN_IMAGE_CROP } from '../core/image';

type Handle = 'tl' | 'tr' | 'bl' | 'br';

const SNAP_PX = 8;


interface PanDrag {
  pointerId: number;
  startX: number;
  startY: number;
  vx: number;
  vy: number;
  scale: number;
}

interface MoveDrag {
  pointerId: number;
  ids: string[];
  startWorld: { x: number; y: number };
  origins: Record<string, { x: number; y: number }>;
  startBounds: Rect;
  snapTargets: Rect[];
}

interface ResizeDrag {
  pointerId: number;
  id: string;
  handle: Handle;
  abs: { x: number; y: number; w: number; h: number };
  parentAbs: { x: number; y: number };
  snapTargets: Rect[];
}

interface CropDrag {
  pointerId: number;
  id: string;
  handle: Handle | 'move';
  abs: { x: number; y: number; w: number; h: number };
  startWorld: { x: number; y: number };
  crop: ImageCrop;
}

interface DrawDrag {
  pointerId: number;
  tool: 'frame' | 'section' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star' | 'slice';
  startWorld: { x: number; y: number };
  currentWorld: { x: number; y: number };
  parent: SceneNode;
  parentAbs: { x: number; y: number };
}

interface PenSession {
  parentId: string;
  parentAbs: { x: number; y: number };
  anchors: PenAnchor[];
  /** 已选钢笔节点：新轮廓追加到该节点，而不是新建节点。 */
  targetId?: string;
  /** 第一条新锚点落在世界坐标的落点，用于结束后换算节点包围盒。 */
  branch?: boolean;
}

interface PenAnchorRef {
  contour: number;
  index: number;
}

interface PenHandleDrag {
  pointerId: number;
  index: number;
  anchor: { x: number; y: number };
}

interface PenEditDrag {
  pointerId: number;
  id: string;
  kind: 'anchor' | 'in' | 'out';
  contour: number;
  index: number;
  contours: PenContour[];
  parentAbs: { x: number; y: number };
  startWorld: { x: number; y: number };
  moved: boolean;
}

interface GuideDrag {
  pointerId: number;
  mode: 'new' | 'move';
  axis: Guide['axis'];
  index?: number;
  position: number;
  overRuler: boolean;
}

interface GuideDraft {
  mode: 'new' | 'move';
  axis: Guide['axis'];
  index?: number;
  position: number;
  deleting: boolean;
}

interface MarqueeDrag {
  pointerId: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
  additive: boolean;
  base: string[];
}

interface Preview {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let penVertexSeq = 0;

function newPenVertexId(): string {
  penVertexSeq += 1;
  return `v${Date.now().toString(36)}-${penVertexSeq}`;
}

export function CanvasView() {
  const s = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<PanDrag | null>(null);
  const moveRef = useRef<MoveDrag | null>(null);
  const resizeRef = useRef<ResizeDrag | null>(null);
  const cropRef = useRef<CropDrag | null>(null);
  const drawRef = useRef<DrawDrag | null>(null);
  const penRef = useRef<PenSession | null>(null);
  const penHandleRef = useRef<PenHandleDrag | null>(null);
  const penEditRef = useRef<PenEditDrag | null>(null);
  const penAnchorIndexRef = useRef<PenAnchorRef | null>(null);
  const lastPenAnchorAtRef = useRef(0);
  const marqueeRef = useRef<MarqueeDrag | null>(null);
  const guideRef = useRef<GuideDrag | null>(null);
  const hoverGuideRef = useRef<number | null>(null);
  const spaceRef = useRef(false);
  const dprRef = useRef(1);
  const lastStatsRef = useRef<DrawStats | null>(null);
  const panCacheRef = useRef<{ canvas: HTMLCanvasElement; pageBg: string } | null>(null);
  const panRafRef = useRef(0);
  const panDeltaRef = useRef({ x: 0, y: 0 });
  const wheelRafRef = useRef(0);
  const wheelEndRef = useRef(0);
  const wheelRef = useRef<{ x: number; y: number; delta: number; ctrl: boolean } | null>(null);
  const interactingRef = useRef(false);
  const guidesKeyRef = useRef('');
  const [spaceDown, setSpaceDown] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [linePreview, setLinePreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [penHover, setPenHover] = useState<{ x: number; y: number } | null>(null);
  const [penAnchorIndex, setPenAnchorIndex] = useState<PenAnchorRef | null>(null);
  const [penHint, setPenHint] = useState<string | null>(null);
  const penHintTimerRef = useRef(0);
  const [, setPenTick] = useState(0);
  const [marquee, setMarquee] = useState<ScreenRect | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [dragSnapHint, setDragSnapHint] = useState(false);
  const [guideDraft, setGuideDraft] = useState<GuideDraft | null>(null);
  const [hoverGuide, setHoverGuide] = useState<number | null>(null);
  const [assetTick, setAssetTick] = useState(0);

  const { doc, pageId, viewport, selectedIds, viewSize } = s;
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0];
  const activePenNodeId = selectedIds.length === 1 ? selectedIds[0] : null;

  useEffect(() => {
    setPenAnchorSelection(
      activePenNodeId && penAnchorIndex
        ? { nodeId: activePenNodeId, contour: penAnchorIndex.contour, index: penAnchorIndex.index }
        : null,
    );
  }, [activePenNodeId, penAnchorIndex]);

  useEffect(() => () => {
    if (penHintTimerRef.current) window.clearTimeout(penHintTimerRef.current);
  }, []);

  function flashPenHint(text: string) {
    setPenHint(text);
    if (penHintTimerRef.current) window.clearTimeout(penHintTimerRef.current);
    penHintTimerRef.current = window.setTimeout(() => setPenHint(null), 2600);
  }

  function showSnapGuides(next: SnapGuide[]) {
    const key = next
      .map((guide) => `${guide.axis}:${guide.position}:${guide.start}:${guide.end}`)
      .join('|');
    if (key === guidesKeyRef.current) return;
    guidesKeyRef.current = key;
    setSnapGuides(next);
  }

  function clearSnapGuides() {
    if (guidesKeyRef.current === '') return;
    guidesKeyRef.current = '';
    setSnapGuides([]);
  }

  function pageGuides(current = getState()): Guide[] {
    const currentPage = current.doc.pages.find((pg) => pg.id === current.pageId) ?? current.doc.pages[0];
    return currentPage?.guides ?? [];
  }

  function setHoverGuideIndex(index: number | null) {
    if (hoverGuideRef.current === index) return;
    hoverGuideRef.current = index;
    setHoverGuide(index);
  }

  function guideAt(p: { x: number; y: number }, current = getState()): { index: number; guide: Guide } | null {
    if (current.tool !== 'move') return null;
    return hitTestGuide(pageGuides(current), p, current.viewport);
  }

  function startGuideDrag(
    e: React.PointerEvent<HTMLCanvasElement>,
    axis: Guide['axis'],
    mode: GuideDrag['mode'],
    index?: number,
    initialPosition?: number,
  ) {
    const p = contentPoint(e);
    const current = getState();
    const world = screenToWorld(current.viewport, p.x, p.y);
    const position = initialPosition ?? Math.round(axis === 'x' ? world.x : world.y);
    guideRef.current = {
      pointerId: e.pointerId,
      mode,
      axis,
      index,
      position,
      overRuler: p.x < 0 || p.y < 0,
    };
    setGuideDraft({ mode, axis, index, position, deleting: false });
    setInteracting(true);
  }

  function pickDpr(): number {
    const raw = window.devicePixelRatio || 1;
    const budget = Math.sqrt(8_000_000 / Math.max(1, viewSize.w * viewSize.h));
    return Math.max(1, Math.min(raw, 2, budget));
  }

  function capturePanCache() {
    const canvas = canvasRef.current;
    if (!canvas || viewSize.w < RULER + 1 || viewSize.h < RULER + 1) return;
    const dpr = dprRef.current;
    const contentW = viewSize.w - RULER;
    const contentH = viewSize.h - RULER;
    const cache = document.createElement('canvas');
    cache.width = Math.max(1, Math.round(contentW * dpr));
    cache.height = Math.max(1, Math.round(contentH * dpr));
    const ctx = cache.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      canvas,
      Math.round(RULER * dpr),
      Math.round(RULER * dpr),
      cache.width,
      cache.height,
      0,
      0,
      cache.width,
      cache.height,
    );
    panCacheRef.current = { canvas: cache, pageBg: page.background };
  }

  function drawPanPreview(dx: number, dy: number) {
    const cache = panCacheRef.current;
    const canvas = canvasRef.current;
    if (!cache || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = dprRef.current;
    const contentW = viewSize.w - RULER;
    const contentH = viewSize.h - RULER;
    const v = { ...getState().viewport, x: getState().viewport.x + dx, y: getState().viewport.y + dy };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = cache.pageBg;
    ctx.fillRect(0, 0, viewSize.w, viewSize.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(RULER, RULER, contentW, contentH);
    ctx.clip();
    ctx.drawImage(cache.canvas, RULER + dx, RULER + dy, contentW, contentH);
    ctx.restore();
    drawRulers(ctx, v, viewSize.w, viewSize.h);
  }

  function schedulePanPreview(dx: number, dy: number) {
    panDeltaRef.current = { x: dx, y: dy };
    if (panRafRef.current) return;
    panRafRef.current = window.requestAnimationFrame(() => {
      panRafRef.current = 0;
      drawPanPreview(panDeltaRef.current.x, panDeltaRef.current.y);
    });
  }

  useEffect(() => {
    return () => {
      if (panRafRef.current) window.cancelAnimationFrame(panRafRef.current);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      editor.setCanvasSize(Math.round(box.width), Math.round(box.height));
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return subscribeImages(() => setAssetTick((tick) => tick + 1));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewSize.w === 0 || viewSize.h === 0) return;
    canvas.style.width = `${viewSize.w}px`;
    canvas.style.height = `${viewSize.h}px`;
    const dpr = pickDpr();
    let raf = 0;
    const render = () => {
      raf = 0;
      const pw = Math.max(1, Math.round(viewSize.w * dpr));
      const ph = Math.max(1, Math.round(viewSize.h * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!ctx) return;
      dprRef.current = dpr;
      lastStatsRef.current = drawEditor(ctx, doc, page, viewport, { w: viewSize.w, h: viewSize.h, dpr }, selectedIds, {
        interactive: interacting,
        cropPreviewId: s.cropId,
      });
    };
    // 拖动/缩放时一次事件可能触发多次状态更新，合并到下一帧只画一次。
    raf = window.requestAnimationFrame(render);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [doc, page, viewport, selectedIds, viewSize.w, viewSize.h, interacting, assetTick, s.cropId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const finishWheel = () => {
      if (wheelEndRef.current) window.clearTimeout(wheelEndRef.current);
      wheelEndRef.current = window.setTimeout(() => {
        wheelEndRef.current = 0;
        interactingRef.current = false;
        setInteracting(false);
      }, 180);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (panRef.current || moveRef.current || resizeRef.current || drawRef.current) return;
      const r = canvas.getBoundingClientRect();
      const cx = e.clientX - r.left - RULER;
      const cy = e.clientY - r.top - RULER;
      if (cx < 0 || cy < 0) return;

      const pending = wheelRef.current;
      wheelRef.current = {
        x: cx,
        y: cy,
        delta: (pending?.delta ?? 0) + e.deltaY,
        ctrl: e.ctrlKey,
      };
      if (!interactingRef.current) {
        interactingRef.current = true;
        setInteracting(true);
      }
      finishWheel();

      if (wheelRafRef.current) return;
      wheelRafRef.current = window.requestAnimationFrame(() => {
        wheelRafRef.current = 0;
        const p = wheelRef.current;
        wheelRef.current = null;
        if (!p || panRef.current) return;
        const factor = Math.exp(-p.delta * (p.ctrl ? 0.003 : 0.0015));
        editor.zoomAtPoint(p.x, p.y, factor);
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      if (wheelRafRef.current) window.cancelAnimationFrame(wheelRafRef.current);
      if (wheelEndRef.current) window.clearTimeout(wheelEndRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!spaceRef.current) {
          spaceRef.current = true;
          setSpaceDown(true);
        }
      }
      if (penRef.current && (e.key === 'Enter' || e.key === 'Escape')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        finishPen(false);
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'Delete' || e.key === 'Backspace') &&
        penAnchorIndexRef.current !== null &&
        !penRef.current
      ) {
        if (deletePenContour()) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && penAnchorIndexRef.current !== null && !penRef.current) {
        if (deletePenAnchor()) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
      }
      const cropState = getState();
      if (e.key === 'Escape' && cropState.cropId) {
        e.preventDefault();
        e.stopImmediatePropagation();
        editor.exitImageCrop();
        return;
      }
      if (e.key === 'Enter' && !cropState.cropId && cropState.selectedIds.length === 1) {
        const node = cropState.doc.nodes[cropState.selectedIds[0]];
        if (node?.type === 'image' && !node.locked) {
          e.preventDefault();
          e.stopImmediatePropagation();
          editor.enterImageCrop(node.id);
          return;
        }
      }
      if (e.key === 'Escape' && penAnchorIndexRef.current !== null && !penEditRef.current) {
        penAnchorIndexRef.current = null;
        setPenAnchorIndex(null);
        bumpPen();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && hoverGuideRef.current !== null) {
        e.preventDefault();
        e.stopPropagation();
        editor.removeGuide(hoverGuideRef.current);
        setHoverGuideIndex(null);
        return;
      }
      if (e.key === 'Escape' && guideRef.current) {
        guideRef.current = null;
        setGuideDraft(null);
        setInteracting(false);
        interactingRef.current = false;
        return;
      }
      if (e.key === 'Escape' && drawRef.current) {
        drawRef.current = null;
        setPreview(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceRef.current = false;
      setSpaceDown(false);
    };
    const onBlur = () => {
      spaceRef.current = false;
      setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  function contentPoint(e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left - RULER, y: e.clientY - r.top - RULER };
  }

  function handleAt(worldX: number, worldY: number): Handle | null {
    const current = getState();
    if (current.selectedIds.length !== 1) return null;
    const sel = current.selectedIds[0];
    const node = current.doc.nodes[sel];
    if (!node || node.locked || node.type === 'group') return null;
    const r = absoluteRect(current.doc, sel);
    const v = current.viewport;
    const corners: Array<[Handle, number, number]> = [
      ['tl', r.x * v.scale + v.x, r.y * v.scale + v.y],
      ['tr', (r.x + r.w) * v.scale + v.x, r.y * v.scale + v.y],
      ['bl', r.x * v.scale + v.x, (r.y + r.h) * v.scale + v.y],
      ['br', (r.x + r.w) * v.scale + v.x, (r.y + r.h) * v.scale + v.y],
    ];
    const sx = worldX * v.scale + v.x;
    const sy = worldY * v.scale + v.y;
    for (const [name, cx, cy] of corners) {
      if (Math.abs(sx - cx) <= 7 && Math.abs(sy - cy) <= 7) return name;
    }
    return null;
  }

  function cropHitAt(current: ReturnType<typeof getState>, worldX: number, worldY: number): Handle | 'move' | null {
    if (!current.cropId) return null;
    const node = current.doc.nodes[current.cropId];
    if (!node || node.type !== 'image' || node.locked) return null;
    const r = absoluteRect(current.doc, node.id);
    if (worldX < r.x || worldY < r.y || worldX > r.x + r.w || worldY > r.y + r.h) return null;
    const crop = imageCropOf(node);
    const v = current.viewport;
    const sx = worldX * v.scale + v.x;
    const sy = worldY * v.scale + v.y;
    const left = (r.x + crop.x * r.w) * v.scale + v.x;
    const top = (r.y + crop.y * r.h) * v.scale + v.y;
    const right = (r.x + (crop.x + crop.w) * r.w) * v.scale + v.x;
    const bottom = (r.y + (crop.y + crop.h) * r.h) * v.scale + v.y;
    const corners: Array<[Handle, number, number]> = [
      ['tl', left, top],
      ['tr', right, top],
      ['bl', left, bottom],
      ['br', right, bottom],
    ];
    for (const [name, cx, cy] of corners) {
      if (Math.abs(sx - cx) <= 9 && Math.abs(sy - cy) <= 9) return name;
    }
    return 'move';
  }

  function cropNext(drag: CropDrag, worldX: number, worldY: number): ImageCrop {
    const node = getState().doc.nodes[drag.id];
    const w = Math.max(1, node?.w ?? drag.abs.w);
    const h = Math.max(1, node?.h ?? drag.abs.h);
    const px = (worldX - drag.abs.x) / w;
    const py = (worldY - drag.abs.y) / h;
    const start = drag.crop;
    const right = start.x + start.w;
    const bottom = start.y + start.h;
    if (drag.handle === 'move') {
      const x = Math.min(1 - start.w, Math.max(0, start.x + (worldX - drag.startWorld.x) / w));
      const y = Math.min(1 - start.h, Math.max(0, start.y + (worldY - drag.startWorld.y) / h));
      return { x, y, w: start.w, h: start.h };
    }
    let x = start.x;
    let y = start.y;
    let cw = start.w;
    let ch = start.h;
    if (drag.handle.includes('l')) {
      x = Math.min(right - MIN_IMAGE_CROP, Math.max(0, px));
      cw = right - x;
    } else {
      cw = Math.min(1 - start.x, Math.max(MIN_IMAGE_CROP, px - start.x));
    }
    if (drag.handle.includes('t')) {
      y = Math.min(bottom - MIN_IMAGE_CROP, Math.max(0, py));
      ch = bottom - y;
    } else {
      ch = Math.min(1 - start.y, Math.max(MIN_IMAGE_CROP, py - start.y));
    }
    return { x, y, w: cw, h: ch };
  }

  function cropRound(crop: ImageCrop): ImageCrop {
    const round = (v: number) => Math.round(v * 10000) / 10000;
    return { x: round(crop.x), y: round(crop.y), w: round(crop.w), h: round(crop.h) };
  }

  function bumpPen() {
    setPenTick((tick) => tick + 1);
  }

  function selectedPenPath(current: ReturnType<typeof getState>): SceneNode | null {
    if (current.tool !== 'pen' || current.selectedIds.length !== 1) return null;
    const node = current.doc.nodes[current.selectedIds[0]];
    if (!node || node.type !== 'path' || node.locked) return null;
    const count = node.pathContours?.reduce((sum, contour) => sum + contour.anchors.length, 0) ?? node.pathAnchors?.length ?? 0;
    return count >= 2 ? node : null;
  }

  function penParentAbs(current: ReturnType<typeof getState>, node: SceneNode): { x: number; y: number } {
    const parent = node.parentId ? current.doc.nodes[node.parentId] : undefined;
    return parent && parent.type !== 'page' ? absolutePosition(current.doc, parent.id) : { x: 0, y: 0 };
  }

  function penEditHit(
    current: ReturnType<typeof getState>,
    node: SceneNode,
    world: { x: number; y: number },
  ): { kind: PenEditDrag['kind']; contour: number; index: number } | null {
    const origin = absolutePosition(current.doc, node.id);
    const contours = pathContoursToWorld(node, origin);
    const scale = current.viewport.scale;
    for (let contour = 0; contour < contours.length; contour += 1) {
      const anchors = contours[contour].anchors;
      for (let index = 0; index < anchors.length; index += 1) {
        const anchor = anchors[index];
        if (Math.hypot(anchor.x - world.x, anchor.y - world.y) * scale <= 7) return { kind: 'anchor', contour, index };
      }
    }
    for (let contour = 0; contour < contours.length; contour += 1) {
      const anchors = contours[contour].anchors;
      for (let index = 0; index < anchors.length; index += 1) {
        const anchor = anchors[index];
        const inbound = { x: anchor.inX ?? anchor.x, y: anchor.inY ?? anchor.y };
        const outbound = { x: anchor.outX ?? anchor.x, y: anchor.outY ?? anchor.y };
        if (Math.hypot(inbound.x - anchor.x, inbound.y - anchor.y) > 0.5 && Math.hypot(inbound.x - world.x, inbound.y - world.y) * scale <= 6) {
          return { kind: 'in', contour, index };
        }
        if (Math.hypot(outbound.x - anchor.x, outbound.y - anchor.y) > 0.5 && Math.hypot(outbound.x - world.x, outbound.y - world.y) * scale <= 6) {
          return { kind: 'out', contour, index };
        }
      }
    }
    return null;
  }

  function beginPenEdit(
    e: React.PointerEvent<HTMLCanvasElement>,
    current: ReturnType<typeof getState>,
    node: SceneNode,
    hit: { kind: PenEditDrag['kind']; contour: number; index: number },
    world: { x: number; y: number },
  ) {
    const origin = absolutePosition(current.doc, node.id);
    penEditRef.current = {
      pointerId: e.pointerId,
      id: node.id,
      kind: hit.kind,
      contour: hit.contour,
      index: hit.index,
      contours: pathContoursToWorld(node, origin),
      parentAbs: penParentAbs(current, node),
      startWorld: world,
      moved: false,
    };
    penAnchorIndexRef.current = { contour: hit.contour, index: hit.index };
    setPenAnchorIndex({ contour: hit.contour, index: hit.index });
    editor.beginTransaction(node.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    bumpPen();
  }

  function insertPenAt(
    current: ReturnType<typeof getState>,
    node: SceneNode,
    world: { x: number; y: number },
  ): boolean {
    const origin = absolutePosition(current.doc, node.id);
    const contours = pathContoursToWorld(node, origin);
    let best: { contour: number; hit: NonNullable<ReturnType<typeof nearestOnPenPath>> } | null = null;
    for (let contour = 0; contour < contours.length; contour += 1) {
      const hit = nearestOnPenPath(contours[contour].anchors, contours[contour].closed, world);
      if (!hit) continue;
      if (!best || hit.distance < best.hit.distance) best = { contour, hit };
    }
    if (!best || best.hit.distance * current.viewport.scale > 6) return false;
    const next = contours.map((contour) => ({
      closed: contour.closed,
      anchors: contour.anchors.map((anchor) => ({ ...anchor })),
    }));
    const target = next[best.contour];
    const inserted = insertPenAnchor(target.anchors, target.closed, best.hit.segment, best.hit.t);
    const index = Math.min(best.hit.segment + 1, inserted.length - 1);
    inserted[index].vertexId = newPenVertexId();
    target.anchors = inserted;
    if (!editor.setPathContours(node.id, next)) return false;
    penAnchorIndexRef.current = { contour: best.contour, index };
    setPenAnchorIndex({ contour: best.contour, index });
    bumpPen();
    return true;
  }

  function deletePenAnchor(): boolean {
    const current = getState();
    const node = selectedPenPath(current);
    const selected = penAnchorIndexRef.current;
    if (!node || !selected) return false;
    const origin = absolutePosition(current.doc, node.id);
    const contours = pathContoursToWorld(node, origin);
    const contour = contours[selected.contour];
    if (!contour) {
      penAnchorIndexRef.current = null;
      setPenAnchorIndex(null);
      return true;
    }
    const next = removePenVertex(contours, selected);
    if (!next) return true;
    const nextContour = Math.min(selected.contour, next.length - 1);
    const nextRef: PenAnchorRef = {
      contour: nextContour,
      index: Math.min(selected.index, next[nextContour].anchors.length - 1),
    };
    if (!editor.setPathContours(node.id, next)) return true;
    penAnchorIndexRef.current = nextRef;
    setPenAnchorIndex(nextRef);
    bumpPen();
    return true;
  }

  function deletePenContour(): boolean {
    const current = getState();
    const node = selectedPenPath(current);
    const selected = penAnchorIndexRef.current;
    if (!node || !selected) return false;
    const origin = absolutePosition(current.doc, node.id);
    const contours = pathContoursToWorld(node, origin);
    if (contours.length <= 1) {
      flashPenHint('至少保留一条轮廓');
      return true;
    }
    const next = contours
      .filter((_, index) => index !== selected.contour)
      .map((contour) => ({ closed: contour.closed, anchors: contour.anchors.map((anchor) => ({ ...anchor })) }));
    const nextRef: PenAnchorRef = {
      contour: Math.min(selected.contour, next.length - 1),
      index: 0,
    };
    if (!editor.setPathContours(node.id, next)) return true;
    penAnchorIndexRef.current = nextRef;
    setPenAnchorIndex(nextRef);
    bumpPen();
    flashPenHint('已删除整条轮廓');
    return true;
  }


  function togglePenAnchorAt(e: React.MouseEvent<HTMLCanvasElement>): boolean {
    const current = getState();
    const node = selectedPenPath(current);
    if (!node) return false;
    const p = contentPoint(e);
    if (p.x < 0 || p.y < 0) return false;
    const world = screenToWorld(current.viewport, p.x, p.y);
    const hit = penEditHit(current, node, world);
    if (!hit || hit.kind !== 'anchor') return false;
    const origin = absolutePosition(current.doc, node.id);
    const contours = pathContoursToWorld(node, origin);
    const contour = contours[hit.contour];
    if (!contour) return false;
    const next = togglePenAnchorType(contour.anchors, contour.closed, hit.index);
    if (!next) return false;
    contour.anchors = next.anchors;
    const synced = syncSharedPenVertex(contours, { contour: hit.contour, index: hit.index });
    editor.setPathContours(node.id, synced);
    penAnchorIndexRef.current = { contour: hit.contour, index: hit.index };
    setPenAnchorIndex({ contour: hit.contour, index: hit.index });
    bumpPen();
    return true;
  }

  function finishPen(closed: boolean) {
    const session = penRef.current;
    penRef.current = null;
    penHandleRef.current = null;
    setPenHover(null);
    bumpPen();
    if (!session || session.anchors.length < 2) return;
    const closeIt = closed && session.anchors.length >= 3;
    if (session.targetId) {
      const current = getState();
      const node = current.doc.nodes[session.targetId];
      if (!node) return;
      const origin = absolutePosition(current.doc, node.id);
      const contours = pathContoursToWorld(node, origin);
      contours.push({
        closed: closeIt,
        anchors: session.anchors.map((anchor) => ({ ...anchor })),
      });
      editor.setPathContours(node.id, contours, false, !closeIt);
      editor.select(node.id);
      return;
    }
    const geometry = penGeometry(session.anchors, closed);
    if (!geometry) return;
    editor.addNode({
      type: 'path',
      parentId: session.parentId,
      x: geometry.x - session.parentAbs.x,
      y: geometry.y - session.parentAbs.y,
      w: geometry.w,
      h: geometry.h,
      pathData: geometry.pathData,
      pathW: geometry.pathW,
      pathH: geometry.pathH,
      pathAnchors: geometry.anchors,
      pathClosed: closeIt,
      fill: closeIt ? '#D9D9D9' : undefined,
      strokes: closeIt ? [] : undefined,
    });
    editor.setTool('move');
  }

  function penDown(
    e: React.PointerEvent<HTMLCanvasElement>,
    world: { x: number; y: number },
    current: ReturnType<typeof getState>,
    statePage: ReturnType<typeof getState>['doc']['pages'][number],
    root: SceneNode,
  ) {
    const session = penRef.current;
    const screenDistance = (point: { x: number; y: number }) =>
      Math.hypot(point.x - world.x, point.y - world.y) * current.viewport.scale;
    if (session && session.anchors.length >= 3 && screenDistance(session.anchors[0]) <= 8) {
      finishPen(true);
      return;
    }
    if (
      session &&
      session.anchors.length >= 2 &&
      screenDistance(session.anchors[session.anchors.length - 1]) <= 8 &&
      Date.now() - lastPenAnchorAtRef.current < 420
    ) {
      finishPen(false);
      return;
    }
    let active = session;
    if (!active) {
      const branchNode = e.altKey ? selectedPenPath(current) : null;
      if (branchNode) {
        active = {
          parentId: branchNode.parentId ?? statePage.rootId,
          parentAbs: penParentAbs(current, branchNode),
          anchors: [],
          targetId: branchNode.id,
        };
      } else {
        const parent = deepestFrame(current.doc, statePage, world.x, world.y) ?? root;
        const parentAbs = parent.type === 'page' ? { x: 0, y: 0 } : absolutePosition(current.doc, parent.id);
        active = { parentId: parent.id, parentAbs, anchors: [] };
      }
      penRef.current = active;
    }
    const anchor: PenAnchor = { x: world.x, y: world.y, vertexId: newPenVertexId() };
    active.anchors.push(anchor);
    lastPenAnchorAtRef.current = Date.now();
    penHandleRef.current = {
      pointerId: e.pointerId,
      index: active.anchors.length - 1,
      anchor: { x: world.x, y: world.y },
    };
    setPenHover(null);
    bumpPen();
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  useEffect(() => {
    if (s.tool !== 'pen' && penRef.current) finishPen(false);
  }, [s.tool]);

  useEffect(() => {
    const selected = penAnchorIndexRef.current;
    if (!selected) return;
    const node = s.selectedIds.length === 1 ? s.doc.nodes[s.selectedIds[0]] : undefined;
    const anchorCount =
      node?.type === 'path'
        ? node.pathContours?.[selected.contour]?.anchors.length ?? (selected.contour === 0 ? node.pathAnchors?.length ?? 0 : 0)
        : 0;
    const valid = s.tool === 'pen' && node?.type === 'path' && anchorCount > selected.index;
    if (!valid) {
      penAnchorIndexRef.current = null;
      setPenAnchorIndex(null);
    }
  }, [s.tool, s.selectedIds, s.doc]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = contentPoint(e);
    if (e.button === 0 && !spaceRef.current && (p.x < 0 || p.y < 0)) {
      const rulerState = getState();
      if (rulerState.tool === 'move') {
        const axis: Guide['axis'] | null = p.y < 0 && p.x >= 0 ? 'y' : p.x < 0 && p.y >= 0 ? 'x' : null;
        if (axis) {
          e.preventDefault();
          startGuideDrag(e, axis, 'new');
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
    }
    if (p.x < 0 || p.y < 0) return;
    const world = screenToWorld(viewport, p.x, p.y);
    const current = getState();
    const statePage = current.doc.pages.find((pg) => pg.id === current.pageId) ?? current.doc.pages[0];
    const root = current.doc.nodes[statePage.rootId];
    if (!root) return;

    if (e.button === 1 || spaceRef.current || current.tool === 'hand') {
      e.preventDefault();
      panRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        vx: current.viewport.x,
        vy: current.viewport.y,
        scale: current.viewport.scale,
      };
      capturePanCache();
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    if (current.tool === 'move' && current.cropId) {
      const cropHit = cropHitAt(current, world.x, world.y);
      if (cropHit) {
        const node = current.doc.nodes[current.cropId];
        if (!node) return;
        e.preventDefault();
        cropRef.current = {
          pointerId: e.pointerId,
          id: node.id,
          handle: cropHit,
          abs: absoluteRect(current.doc, node.id),
          startWorld: { x: world.x, y: world.y },
          crop: imageCropOf(node),
        };
        setHoverGuideIndex(null);
        editor.beginTransaction(node.id);
        setInteracting(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    if (current.tool === 'pen' && !penRef.current) {
      const editNode = selectedPenPath(current);
      if (editNode) {
        const hit = penEditHit(current, editNode, world);
        if (e.altKey && hit?.kind === 'anchor') {
          const origin = absolutePosition(current.doc, editNode.id);
          const contours = pathContoursToWorld(editNode, origin);
          const anchor = contours[hit.contour]?.anchors[hit.index];
          if (anchor) {
            e.preventDefault();
            const seedId = anchor.vertexId ?? newPenVertexId();
            if (!anchor.vertexId) {
              anchor.vertexId = seedId;
              editor.setPathContours(editNode.id, contours, true);
            }
            penRef.current = {
              parentId: editNode.parentId ?? statePage.rootId,
              parentAbs: penParentAbs(current, editNode),
              anchors: [{ x: anchor.x, y: anchor.y, vertexId: seedId }],
              targetId: editNode.id,
              branch: true,
            };
            penAnchorIndexRef.current = null;
            setPenAnchorIndex(null);
            setPenHover(null);
            bumpPen();
            return;
          }
        }
        if (hit) {
          e.preventDefault();
          beginPenEdit(e, current, editNode, hit, world);
          return;
        }
        if (insertPenAt(current, editNode, world)) {
          e.preventDefault();
          return;
        }
      }
    }

    if (current.tool === 'pen') {
      e.preventDefault();
      penDown(e, world, current, statePage, root);
      return;
    }

    if (current.tool === 'move') {
      const handle = handleAt(world.x, world.y);
      if (handle && current.selectedIds.length === 1) {
        const id = current.selectedIds[0];
        const node = current.doc.nodes[id];
        if (!node) return;
        resizeRef.current = {
          pointerId: e.pointerId,
          id,
          handle,
          abs: absoluteRect(current.doc, id),
          parentAbs: absolutePosition(current.doc, node.parentId ?? root.id),
          snapTargets: collectSnapTargets(current.doc, statePage, [id]),
        };
        setHoverGuideIndex(null);
        editor.beginTransaction(id);
        setInteracting(true);
        setDragSnapHint(true);
        clearSnapGuides();
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      const guide = guideAt(p, current);
      if (guide) {
        e.preventDefault();
        setHoverGuideIndex(null);
        startGuideDrag(e, guide.guide.axis, 'move', guide.index, guide.guide.position);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      const hit = hitTest(current.doc, statePage, world.x, world.y);
      if (hit && e.shiftKey) {
        editor.select(hit.id, true);
        return;
      }

      if (hit) {
        let ids = current.selectedIds.includes(hit.id) ? current.selectedIds : [hit.id];
        if (!current.selectedIds.includes(hit.id)) editor.select(hit.id);
        ids = topLevelSelection(current.doc, ids).filter((id) => {
          const node = current.doc.nodes[id];
          return Boolean(node && node.type !== 'page' && !node.locked);
        });
        if (ids.length > 0) {
          const origins: Record<string, { x: number; y: number }> = {};
          for (const id of ids) {
            const node = current.doc.nodes[id];
            if (node) origins[id] = { x: node.x, y: node.y };
          }
          const bounds = selectionBounds(current.doc, ids);
          if (!bounds) return;
          setHoverGuideIndex(null);
          moveRef.current = {
            pointerId: e.pointerId,
            ids,
            startWorld: world,
            origins,
            startBounds: bounds,
            snapTargets: collectSnapTargets(current.doc, statePage, ids),
          };
          editor.beginTransaction(ids);
          setInteracting(true);
          setDragSnapHint(true);
          clearSnapGuides();
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        return;
      }

      // 空白处按下：开始框选。Shift 框选为追加，不按 Shift 清空旧选区。
      setHoverGuideIndex(null);
      marqueeRef.current = {
        pointerId: e.pointerId,
        start: p,
        current: p,
        additive: e.shiftKey,
        base: e.shiftKey ? current.selectedIds : [],
      };
      setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (current.tool === 'text') {
      const parent = deepestFrame(current.doc, statePage, world.x, world.y) ?? root;
      const parentAbs = parent.type === 'page' ? { x: 0, y: 0 } : absolutePosition(current.doc, parent.id);
      const id = editor.addNode({
        type: 'text',
        parentId: parent.id,
        x: world.x - parentAbs.x,
        y: world.y - parentAbs.y,
        w: 240,
        h: 40,
      });
      editor.select(id);
      editor.setTool('move');
      return;
    }

    if (current.tool === 'frame' || current.tool === 'section' || current.tool === 'rect' || current.tool === 'ellipse' || current.tool === 'line' || current.tool === 'arrow' || current.tool === 'polygon' || current.tool === 'star' || current.tool === 'slice') {
      const parent =
        current.tool === 'frame'
          ? deepestFrameOrSection(current.doc, statePage, world.x, world.y) ?? root
          : current.tool === 'section'
            ? root
            : deepestFrame(current.doc, statePage, world.x, world.y) ?? root;
      const parentAbs = parent.type === 'page' ? { x: 0, y: 0 } : absolutePosition(current.doc, parent.id);
      drawRef.current = {
        pointerId: e.pointerId,
        tool: current.tool,
        startWorld: world,
        currentWorld: world,
        parent,
        parentAbs,
      };
      setInteracting(true);
      if (current.tool === 'line' || current.tool === 'arrow') {
        setPreview(null);
        setLinePreview({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      } else {
        setPreview({ x: p.x, y: p.y, w: 0, h: 0 });
      }
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const current = getState();
    const cropDrag = cropRef.current;
    if (cropDrag && cropDrag.pointerId === e.pointerId) {
      const p = contentPoint(e);
      const world = screenToWorld(current.viewport, p.x, p.y);
      editor.updateSilent(cropDrag.id, { imageCrop: cropRound(cropNext(cropDrag, world.x, world.y)) });
      return;
    }
    const edit = penEditRef.current;
    if (edit && edit.pointerId === e.pointerId) {
      const p = contentPoint(e);
      const world = screenToWorld(current.viewport, p.x, p.y);
      const nextContours: PenContour[] = edit.contours.map((contour) => ({
        closed: contour.closed,
        anchors: contour.anchors.map((anchor) => ({
          ...anchor,
          inX: anchor.inX ?? anchor.x,
          inY: anchor.inY ?? anchor.y,
          outX: anchor.outX ?? anchor.x,
          outY: anchor.outY ?? anchor.y,
        })),
      }));
      const target = nextContours[edit.contour];
      const original = edit.contours[edit.contour]?.anchors[edit.index];
      const anchor = target?.anchors[edit.index];
      if (target && original && anchor) {
        if (edit.kind === 'anchor') {
          const dx = world.x - edit.startWorld.x;
          const dy = world.y - edit.startWorld.y;
          anchor.x = original.x + dx;
          anchor.y = original.y + dy;
          anchor.inX = (original.inX ?? original.x) + dx;
          anchor.inY = (original.inY ?? original.y) + dy;
          anchor.outX = (original.outX ?? original.x) + dx;
          anchor.outY = (original.outY ?? original.y) + dy;
        } else if (edit.kind === 'out') {
          anchor.outX = world.x;
          anchor.outY = world.y;
          if (!e.altKey) {
            anchor.inX = anchor.x * 2 - world.x;
            anchor.inY = anchor.y * 2 - world.y;
          }
        } else {
          anchor.inX = world.x;
          anchor.inY = world.y;
          if (!e.altKey) {
            anchor.outX = anchor.x * 2 - world.x;
            anchor.outY = anchor.y * 2 - world.y;
          }
        }
        if (Math.hypot(world.x - edit.startWorld.x, world.y - edit.startWorld.y) > 1) edit.moved = true;
        const synced = syncSharedPenVertex(nextContours, { contour: edit.contour, index: edit.index });
        editor.setPathContours(edit.id, synced, true);
        bumpPen();
      }
      return;
    }
    if (penHandleRef.current?.pointerId === e.pointerId) {
      const p = contentPoint(e);
      const world = screenToWorld(current.viewport, p.x, p.y);
      const session = penRef.current;
      const drag = penHandleRef.current;
      const anchor = session?.anchors[drag.index];
      if (session && anchor) {
        const dx = world.x - drag.anchor.x;
        const dy = world.y - drag.anchor.y;
        if (Math.hypot(dx, dy) > 2) {
          anchor.outX = world.x;
          anchor.outY = world.y;
          anchor.inX = drag.anchor.x - dx;
          anchor.inY = drag.anchor.y - dy;
          bumpPen();
        }
      }
      return;
    }
    if (penRef.current) {
      const p = contentPoint(e);
      if (p.x >= 0 && p.y >= 0) {
        const world = screenToWorld(current.viewport, p.x, p.y);
        setPenHover((previous) => {
          if (previous && Math.hypot(previous.x - world.x, previous.y - world.y) < 0.5) return previous;
          return world;
        });
      }
    }
    const activeGuide = guideRef.current;
    if (activeGuide && activeGuide.pointerId === e.pointerId) {
      const gp = contentPoint(e);
      const world = screenToWorld(current.viewport, gp.x, gp.y);
      const overRuler = gp.x < 0 || gp.y < 0;
      const position = Math.round(activeGuide.axis === 'x' ? world.x : world.y);
      activeGuide.position = position;
      activeGuide.overRuler = overRuler;
      setGuideDraft({
        mode: activeGuide.mode,
        axis: activeGuide.axis,
        index: activeGuide.index,
        position,
        deleting: activeGuide.mode === 'move' && overRuler,
      });
      return;
    }

    const pan = panRef.current;
    if (pan && pan.pointerId === e.pointerId) {
      const dx = e.clientX - pan.startX;
      const dy = e.clientY - pan.startY;
      if (panCacheRef.current) {
        schedulePanPreview(dx, dy);
      } else {
        editor.setViewport({
          x: pan.vx + dx,
          y: pan.vy + dy,
          scale: pan.scale,
        });
      }
      return;
    }

    const p = contentPoint(e);
    if (p.x < 0 || p.y < 0) {
      setHoverGuideIndex(null);
      setCursor(null);
      return;
    }
    const world = screenToWorld(current.viewport, p.x, p.y);
    setHoverGuideIndex(guideAt(p, current)?.index ?? null);
    setCursor({ x: Math.round(world.x), y: Math.round(world.y) });

    const marq = marqueeRef.current;
    if (marq && marq.pointerId === e.pointerId) {
      marq.current = p;
      const x = Math.min(marq.start.x, p.x);
      const y = Math.min(marq.start.y, p.y);
      setMarquee({ x, y, w: Math.abs(p.x - marq.start.x), h: Math.abs(p.y - marq.start.y) });
      return;
    }

    const move = moveRef.current;
    if (move && move.pointerId === e.pointerId) {
      const rawDx = world.x - move.startWorld.x;
      const rawDy = world.y - move.startWorld.y;
      const proposed = {
        ...move.startBounds,
        x: move.startBounds.x + rawDx,
        y: move.startBounds.y + rawDy,
      };
      const snap = snapSelectionBounds(
        proposed,
        move.snapTargets,
        SNAP_PX / current.viewport.scale,
        e.altKey,
        pageGuides(current),
      );
      const dx = rawDx + snap.dx;
      const dy = rawDy + snap.dy;
      showSnapGuides(snap.guides);
      const patches: Array<{ id: string; patch: { x: number; y: number } }> = [];
      for (const id of move.ids) {
        const origin = move.origins[id];
        if (!origin) continue;
        patches.push({ id, patch: { x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) } });
      }
      editor.updateManySilent(patches);
      return;
    }

    const resize = resizeRef.current;
    if (resize && resize.pointerId === e.pointerId) {
      let { x, y, w, h } = resize.abs;
      if (resize.handle.includes('l')) {
        const nx = Math.min(world.x, x + w - 1);
        w = x + w - nx;
        x = nx;
      } else {
        w = Math.max(1, world.x - x);
      }
      if (resize.handle.includes('t')) {
        const ny = Math.min(world.y, y + h - 1);
        h = y + h - ny;
        y = ny;
      } else {
        h = Math.max(1, world.y - y);
      }

      const horizontalEdge: HorizontalSnapEdge = resize.handle.includes('l') ? 'left' : 'right';
      const verticalEdge: VerticalSnapEdge = resize.handle.includes('t') ? 'top' : 'bottom';
      const snap = snapResizeRect(
        { x, y, w, h },
        horizontalEdge,
        verticalEdge,
        resize.snapTargets,
        SNAP_PX / current.viewport.scale,
        e.altKey,
        pageGuides(current),
      );
      x = snap.rect.x;
      y = snap.rect.y;
      w = snap.rect.w;
      h = snap.rect.h;
      showSnapGuides(snap.guides);
      editor.updateSilent(resize.id, {
        x: Math.round(x - resize.parentAbs.x),
        y: Math.round(y - resize.parentAbs.y),
        w: Math.round(w),
        h: Math.round(h),
      });
      return;
    }

    const draft = drawRef.current;
    if (draft && draft.pointerId === e.pointerId) {
      draft.currentWorld = world;
      if (draft.tool === 'line' || draft.tool === 'arrow') {
        setLinePreview({
          x1: draft.startWorld.x * current.viewport.scale + current.viewport.x,
          y1: draft.startWorld.y * current.viewport.scale + current.viewport.y,
          x2: world.x * current.viewport.scale + current.viewport.x,
          y2: world.y * current.viewport.scale + current.viewport.y,
        });
        return;
      }
      const sx = Math.min(draft.startWorld.x, world.x);
      const sy = Math.min(draft.startWorld.y, world.y);
      const ex = Math.max(draft.startWorld.x, world.x);
      const ey = Math.max(draft.startWorld.y, world.y);
      setPreview({
        x: sx * current.viewport.scale + current.viewport.x,
        y: sy * current.viewport.scale + current.viewport.y,
        w: (ex - sx) * current.viewport.scale,
        h: (ey - sy) * current.viewport.scale,
      });
    }
  }

  function finish(e: React.PointerEvent<HTMLCanvasElement>) {
    if (cropRef.current?.pointerId === e.pointerId) {
      cropRef.current = null;
      editor.endTransaction();
      setInteracting(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }
    if (penEditRef.current?.pointerId === e.pointerId) {
      penEditRef.current = null;
      editor.endTransaction();
      bumpPen();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }
    if (penHandleRef.current?.pointerId === e.pointerId) {
      penHandleRef.current = null;
      bumpPen();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }
    const activeGuide = guideRef.current;
    if (activeGuide && activeGuide.pointerId === e.pointerId) {
      const gp = contentPoint(e);
      const overRuler = gp.x < 0 || gp.y < 0;
      guideRef.current = null;
      if (activeGuide.mode === 'new') {
        if (!overRuler) editor.addGuide(activeGuide.axis, activeGuide.position);
      } else if (activeGuide.index !== undefined) {
        if (overRuler) editor.removeGuide(activeGuide.index);
        else editor.moveGuide(activeGuide.index, activeGuide.position);
      }
      setGuideDraft(null);
      setHoverGuideIndex(null);
      setInteracting(false);
      interactingRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }

    const pan = panRef.current;
    if (pan && pan.pointerId === e.pointerId) {
      const dx = e.clientX - pan.startX;
      const dy = e.clientY - pan.startY;
      panRef.current = null;
      panCacheRef.current = null;
      if (panRafRef.current) {
        window.cancelAnimationFrame(panRafRef.current);
        panRafRef.current = 0;
      }
      editor.setViewport({
        x: pan.vx + dx,
        y: pan.vy + dy,
        scale: pan.scale,
      });
    }
    if (moveRef.current?.pointerId === e.pointerId) {
      moveRef.current = null;
      editor.endTransaction();
    }
    if (resizeRef.current?.pointerId === e.pointerId) {
      resizeRef.current = null;
      editor.endTransaction();
    }

    const marq = marqueeRef.current;
    if (marq && marq.pointerId === e.pointerId) {
      const current = getState();
      const statePage = current.doc.pages.find((pg) => pg.id === current.pageId) ?? current.doc.pages[0];
      const a = screenToWorld(current.viewport, marq.start.x, marq.start.y);
      const b = screenToWorld(current.viewport, marq.current.x, marq.current.y);
      const rect = {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x),
        h: Math.abs(b.y - a.y),
      };
      const found = marqueeSelection(current.doc, statePage, rect);
      const ids = marq.additive ? [...marq.base, ...found] : found;
      if (ids.length > 0) editor.selectMany(ids);
      else if (!marq.additive) editor.clearSelection();
      marqueeRef.current = null;
      setMarquee(null);
    }

    const draft = drawRef.current;
    if (draft && draft.pointerId === e.pointerId) {
      const cw = draft.currentWorld;
      if (draft.tool === 'line') {
        const line = lineGeometry(draft.startWorld, cw);
        editor.addNode({
          type: 'path',
          parentId: draft.parent.id,
          x: Math.round(line.x - draft.parentAbs.x),
          y: Math.round(line.y - draft.parentAbs.y),
          w: line.w,
          h: line.h,
          pathData: line.pathData,
          pathW: line.pathW,
          pathH: line.pathH,
        });
      } else if (draft.tool === 'arrow') {
        const arrow = arrowGeometry(draft.startWorld, cw);
        editor.addNode({
          type: 'path',
          parentId: draft.parent.id,
          x: Math.round(arrow.x - draft.parentAbs.x),
          y: Math.round(arrow.y - draft.parentAbs.y),
          w: arrow.w,
          h: arrow.h,
          pathData: arrow.pathData,
          pathW: arrow.pathW,
          pathH: arrow.pathH,
          shapeKind: 'arrow',
          arrowHeadData: arrow.arrowHeadData,
        });
      } else if (draft.tool === 'polygon' || draft.tool === 'star') {
        const kind = draft.tool;
        let sx = Math.min(draft.startWorld.x, cw.x);
        let sy = Math.min(draft.startWorld.y, cw.y);
        let w = Math.abs(cw.x - draft.startWorld.x);
        let h = Math.abs(cw.y - draft.startWorld.y);
        if (w < 3 || h < 3) {
          w = 120;
          h = 120;
          sx = draft.startWorld.x;
          sy = draft.startWorld.y;
        }
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
        editor.addNode({
          type: 'path',
          parentId: draft.parent.id,
          x: Math.round(sx - draft.parentAbs.x),
          y: Math.round(sy - draft.parentAbs.y),
          w,
          h,
          pathData: shapePath(kind, w, h, 5),
          pathW: w,
          pathH: h,
          shapeKind: kind,
          shapeSides: 5,
          fill: '#D9D9D9',
          strokes: [],
        });
      } else {
        let sx = Math.min(draft.startWorld.x, cw.x);
        let sy = Math.min(draft.startWorld.y, cw.y);
        let w = Math.abs(cw.x - draft.startWorld.x);
        let h = Math.abs(cw.y - draft.startWorld.y);

        if (w < 3 || h < 3) {
          w = draft.tool === 'frame' ? 1440 : draft.tool === 'section' ? 800 : draft.tool === 'slice' ? 160 : 120;
          h = draft.tool === 'frame' ? 900 : draft.tool === 'section' ? 600 : draft.tool === 'slice' ? 120 : 80;
          sx = draft.startWorld.x;
          sy = draft.startWorld.y;
        }

        editor.addNode({
          type: draft.tool,
          parentId: draft.parent.id,
          x: Math.round(sx - draft.parentAbs.x),
          y: Math.round(sy - draft.parentAbs.y),
          w: Math.round(w),
          h: Math.round(h),
        });
      }
      drawRef.current = null;
      setPreview(null);
      setLinePreview(null);
      editor.setTool('move');
    }

    setInteracting(false);
    interactingRef.current = false;
    setDragSnapHint(false);
    clearSnapGuides();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function cancel(e: React.PointerEvent<HTMLCanvasElement>) {
    if (cropRef.current) {
      cropRef.current = null;
      editor.cancelTransaction();
      setInteracting(false);
    }
    if (penEditRef.current) {
      penEditRef.current = null;
      editor.cancelTransaction();
      bumpPen();
    }
    if (penHandleRef.current) {
      penHandleRef.current = null;
      bumpPen();
    }
    if (panRef.current) {
      panRef.current = null;
      panCacheRef.current = null;
      if (panRafRef.current) {
        window.cancelAnimationFrame(panRafRef.current);
        panRafRef.current = 0;
      }
      editor.setViewport({ ...getState().viewport });
    }
    if (guideRef.current) {
      guideRef.current = null;
      setGuideDraft(null);
      setHoverGuideIndex(null);
    }
    if (moveRef.current) {
      moveRef.current = null;
      setInteracting(false);
      editor.cancelTransaction();
    }
    if (resizeRef.current) {
      resizeRef.current = null;
      setInteracting(false);
      editor.cancelTransaction();
    }
    if (drawRef.current) {
      drawRef.current = null;
      setPreview(null);
      setLinePreview(null);
    }
    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarquee(null);
    }
    setInteracting(false);
    interactingRef.current = false;
    setDragSnapHint(false);
    clearSnapGuides();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (togglePenAnchorAt(e)) return;
    const p = contentPoint(e);
    if (p.x < 0 || p.y < 0) return;
    const current = getState();
    const world = screenToWorld(current.viewport, p.x, p.y);
    const statePage = current.doc.pages.find((pg) => pg.id === current.pageId) ?? current.doc.pages[0];
    const hit = hitTestDeep(current.doc, statePage, world.x, world.y);
    if (!hit) return;
    editor.select(hit.id);
    if (hit.type === 'image' && getState().tool === 'move') {
      editor.enterImageCrop(hit.id);
      return;
    }
    if (hit.type === 'text') {
      window.setTimeout(() => {
        const el = document.getElementById('text-editor') as HTMLTextAreaElement | null;
        el?.focus();
        el?.select();
      }, 0);
    }
  }

  const hand = spaceDown || s.tool === 'hand';
  const hoveredGuide = hoverGuide !== null ? page.guides?.[hoverGuide] : undefined;
  const guideCursor = guideDraft
    ? guideDraft.axis === 'x'
      ? 'ew-resize'
      : 'ns-resize'
    : hoveredGuide
      ? hoveredGuide.axis === 'x'
        ? 'ew-resize'
        : 'ns-resize'
      : null;
  const cursor = s.cropId ? 'move' : hand ? 'grab' : s.tool === 'move' ? guideCursor ?? 'default' : 'crosshair';
  const selectedType = selectedIds.length === 1 ? doc.nodes[selectedIds[0]]?.type : null;
  const selectionCount = selectedIds.length;
  const selectedPenNode =
    s.tool === 'pen' && selectedIds.length === 1
      ? (() => {
          const node = doc.nodes[selectedIds[0]];
          const count = node?.pathContours?.reduce((sum, contour) => sum + contour.anchors.length, 0) ?? node?.pathAnchors?.length ?? 0;
          return node?.type === 'path' && count > 0 ? node : null;
        })()
      : null;
  const cropNode = s.cropId ? doc.nodes[s.cropId] : null;
  const activeCrop = cropNode?.type === 'image' ? imageCropOf(cropNode) : null;
  const cropAbs = cropNode ? absoluteRect(doc, cropNode.id) : null;
  const guideLabel = (guide: Guide | GuideDraft) =>
    `${guide.axis === 'x' ? 'X' : 'Y'} ${Math.round(guide.position)}`;

  return (
    <div className="canvas-host" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className="canvas"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onPointerLeave={() => {
          setHoverGuideIndex(null);
          setCursor(null);
          if (penRef.current) setPenHover(null);
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      {penHint && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          <strong>{penHint}</strong>
        </div>
      )}
      {(page.guides ?? []).map((guide, index) => {
        const dragging = guideDraft?.mode === 'move' && guideDraft.index === index;
        const deleting = dragging && guideDraft?.deleting;
        if (dragging && !deleting) return null;
        const screen = guideScreenPosition(guide, viewport);
        return (
          <div
            key={`manual-${index}-${guide.axis}-${guide.position}`}
            className={`manual-guide manual-guide-${guide.axis}${hoverGuide === index ? ' is-hover' : ''}${deleting ? ' is-deleting' : ''}`}
            aria-hidden="true"
            style={
              guide.axis === 'x'
                ? { left: RULER + screen, top: RULER, height: Math.max(1, viewSize.h - RULER) }
                : { left: RULER, top: RULER + screen, width: Math.max(1, viewSize.w - RULER) }
            }
          />
        );
      })}
      {guideDraft && !guideDraft.deleting && (
        <div
          className={`manual-guide manual-guide-${guideDraft.axis} is-draft`}
          aria-hidden="true"
          style={
            guideDraft.axis === 'x'
              ? {
                  left: RULER + guideDraft.position * viewport.scale + viewport.x,
                  top: RULER,
                  height: Math.max(1, viewSize.h - RULER),
                }
              : {
                  left: RULER,
                  top: RULER + guideDraft.position * viewport.scale + viewport.y,
                  width: Math.max(1, viewSize.w - RULER),
                }
          }
        />
      )}
      {snapGuides.map((guide, index) => {
        if (guide.axis === 'x') {
          const x = RULER + guide.position * viewport.scale + viewport.x;
          const y1 = RULER + guide.start * viewport.scale + viewport.y;
          const y2 = RULER + guide.end * viewport.scale + viewport.y;
          return (
            <div
              key={`snap-x-${index}`}
              className={`smart-guide smart-guide-x${guide.manual ? ' is-manual' : ''}`}
              style={{ left: x, top: Math.min(y1, y2), height: Math.max(1, Math.abs(y2 - y1)) }}
            />
          );
        }
        const y = RULER + guide.position * viewport.scale + viewport.y;
        const x1 = RULER + guide.start * viewport.scale + viewport.x;
        const x2 = RULER + guide.end * viewport.scale + viewport.x;
        return (
          <div
            key={`snap-y-${index}`}
            className={`smart-guide smart-guide-y${guide.manual ? ' is-manual' : ''}`}
            style={{ left: Math.min(x1, x2), top: y, width: Math.max(1, Math.abs(x2 - x1)) }}
          />
        );
      })}
      {activeCrop && cropAbs && (() => {
        const left = cropAbs.x * viewport.scale + viewport.x;
        const top = cropAbs.y * viewport.scale + viewport.y;
        const imageW = cropAbs.w * viewport.scale;
        const imageH = cropAbs.h * viewport.scale;
        const x = (cropAbs.x + activeCrop.x * cropAbs.w) * viewport.scale + viewport.x;
        const y = (cropAbs.y + activeCrop.y * cropAbs.h) * viewport.scale + viewport.y;
        const w = Math.max(1, activeCrop.w * cropAbs.w * viewport.scale);
        const h = Math.max(1, activeCrop.h * cropAbs.h * viewport.scale);
        const overlayW = Math.max(0, viewSize.w - RULER);
        const overlayH = Math.max(0, viewSize.h - RULER);
        const handles: Array<[number, number]> = [
          [x, y],
          [x + w, y],
          [x, y + h],
          [x + w, y + h],
        ];
        return (
          <svg
            className="crop-overlay"
            aria-hidden="true"
            width={overlayW}
            height={overlayH}
            viewBox={`0 0 ${overlayW} ${overlayH}`}
            style={{ left: RULER, top: RULER }}
          >
            <rect x={left} y={top} width={Math.max(0, imageW)} height={Math.max(0, y - top)} fill="rgba(20,16,8,0.54)" />
            <rect x={left} y={y + h} width={Math.max(0, imageW)} height={Math.max(0, top + imageH - y - h)} fill="rgba(20,16,8,0.54)" />
            <rect x={left} y={y} width={Math.max(0, x - left)} height={h} fill="rgba(20,16,8,0.54)" />
            <rect x={x + w} y={y} width={Math.max(0, left + imageW - x - w)} height={h} fill="rgba(20,16,8,0.54)" />
            <rect x={x} y={y} width={w} height={h} fill="none" stroke="#F2B70A" strokeWidth={1.5} />
            <line x1={x + w / 3} y1={y} x2={x + w / 3} y2={y + h} stroke="rgba(255,255,255,0.34)" strokeWidth={0.75} />
            <line x1={x + (w * 2) / 3} y1={y} x2={x + (w * 2) / 3} y2={y + h} stroke="rgba(255,255,255,0.34)" strokeWidth={0.75} />
            <line x1={x} y1={y + h / 3} x2={x + w} y2={y + h / 3} stroke="rgba(255,255,255,0.34)" strokeWidth={0.75} />
            <line x1={x} y1={y + (h * 2) / 3} x2={x + w} y2={y + (h * 2) / 3} stroke="rgba(255,255,255,0.34)" strokeWidth={0.75} />
            {handles.map(([hx, hy], index) => (
              <rect
                key={`crop-handle-${index}`}
                x={hx - 4}
                y={hy - 4}
                width={8}
                height={8}
                rx={1}
                fill="#FFFDF7"
                stroke="#F2B70A"
                strokeWidth={1.25}
              />
            ))}
          </svg>
        );
      })()}
      {(penRef.current || selectedPenNode) && (() => {
        const session = penRef.current;
        const localContours: PenContour[] = session
          ? [{ closed: false, anchors: session.anchors.map((anchor) => ({ ...anchor })) }]
          : selectedPenNode
            ? (selectedPenNode.pathContours?.length
                ? selectedPenNode.pathContours
                : selectedPenNode.pathAnchors?.length
                  ? [{ closed: Boolean(selectedPenNode.pathClosed), anchors: selectedPenNode.pathAnchors }]
                  : []
              ).map((contour) => ({
                closed: contour.closed,
                anchors: contour.anchors.map((anchor) => ({ ...anchor })),
              }))
            : [];
        let closeHint = false;
        if (session?.anchors.length && penHover) {
          closeHint =
            session.anchors.length >= 3 &&
            Math.hypot(session.anchors[0].x - penHover.x, session.anchors[0].y - penHover.y) * viewport.scale <= 8;
          if (closeHint) localContours[0].closed = true;
          else localContours[0].anchors.push({ x: penHover.x, y: penHover.y });
        }
        const origin = session
          ? { x: 0, y: 0 }
          : selectedPenNode
            ? absolutePosition(doc, selectedPenNode.id)
            : { x: 0, y: 0 };
        const anchorScale = session
          ? { x: 1, y: 1 }
          : selectedPenNode
            ? {
                x: selectedPenNode.w / Math.max(0.01, selectedPenNode.pathW ?? selectedPenNode.w),
                y: selectedPenNode.h / Math.max(0.01, selectedPenNode.pathH ?? selectedPenNode.h),
              }
            : { x: 1, y: 1 };
        const toScreen = (point: { x: number; y: number }) => ({
          x: (origin.x + point.x * anchorScale.x) * viewport.scale + viewport.x,
          y: (origin.y + point.y * anchorScale.y) * viewport.scale + viewport.y,
        });
        const screenContours = localContours.map((contour) => {
          const anchors = contour.anchors.map((anchor) => {
            const point = toScreen(anchor);
            const inbound = toScreen({ x: anchor.inX ?? anchor.x, y: anchor.inY ?? anchor.y });
            const outbound = toScreen({ x: anchor.outX ?? anchor.x, y: anchor.outY ?? anchor.y });
            return { point, inbound, outbound };
          });
          const preview = anchors.length >= 2
            ? penPathData(
                anchors.map(({ point, inbound, outbound }) => ({
                  x: point.x,
                  y: point.y,
                  inX: inbound.x,
                  inY: inbound.y,
                  outX: outbound.x,
                  outY: outbound.y,
                })),
                contour.closed,
              )
            : '';
          return { anchors, preview };
        });
        const overlayW = Math.max(0, viewSize.w - RULER);
        const overlayH = Math.max(0, viewSize.h - RULER);
        return (
          <svg
            className="pen-overlay"
            aria-hidden="true"
            width={overlayW}
            height={overlayH}
            viewBox={`0 0 ${overlayW} ${overlayH}`}
            style={{ left: RULER, top: RULER }}
          >
            {screenContours.map((contour, contourIndex) =>
              contour.preview ? <path key={`pen-preview-${contourIndex}`} className="pen-preview-path" d={contour.preview} /> : null,
            )}
            {screenContours.map((contour, contourIndex) =>
              contour.anchors.map(({ point, inbound, outbound }, index) => {
                const hasIn = Math.hypot(inbound.x - point.x, inbound.y - point.y) > 0.5;
                const hasOut = Math.hypot(outbound.x - point.x, outbound.y - point.y) > 0.5;
                const selected = !session && penAnchorIndex?.contour === contourIndex && penAnchorIndex.index === index;
                return (
                  <g key={`pen-anchor-${contourIndex}-${index}`}>
                    {hasIn && (
                      <>
                        <line className="pen-handle-line" x1={point.x} y1={point.y} x2={inbound.x} y2={inbound.y} />
                        <circle className="pen-handle-dot" cx={inbound.x} cy={inbound.y} r={2.5} />
                      </>
                    )}
                    {hasOut && (
                      <>
                        <line className="pen-handle-line" x1={point.x} y1={point.y} x2={outbound.x} y2={outbound.y} />
                        <circle className="pen-handle-dot" cx={outbound.x} cy={outbound.y} r={2.5} />
                      </>
                    )}
                    <rect
                      className={`pen-anchor${index === 0 ? ' is-first' : ''}${selected ? ' is-selected' : ''}`}
                      x={point.x - 3}
                      y={point.y - 3}
                      width={6}
                      height={6}
                    />
                  </g>
                );
              }),
            )}
          </svg>
        );
      })()}
      {linePreview && (() => {
        const dx = linePreview.x2 - linePreview.x1;
        const dy = linePreview.y2 - linePreview.y1;
        const length = Math.max(1, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);
        return (
          <div
            className="draw-line-preview"
            style={{
              left: RULER + (linePreview.x1 + linePreview.x2) / 2,
              top: RULER + (linePreview.y1 + linePreview.y2) / 2,
              width: length,
              transform: `translate(-50%, -50%) rotate(${angle}rad)`,
            }}
          />
        );
      })()}
      {preview && (
        <div
          className="draw-preview"
          style={{
            left: RULER + preview.x,
            top: RULER + preview.y,
            width: Math.max(1, preview.w),
            height: Math.max(1, preview.h),
          }}
        />
      )}
      {marquee && (
        <div
          className="marquee"
          style={{
            left: RULER + marquee.x,
            top: RULER + marquee.y,
            width: Math.max(1, marquee.w),
            height: Math.max(1, marquee.h),
          }}
        />
      )}
      <div className="canvas-tip">
        {activeCrop
          ? '拖动裁剪框移动 · 拖四角改可见区域 · Esc 退出'
          : hand
          ? '拖动平移 · 滚轮缩放'
          : s.tool === 'pen'
            ? penRef.current
              ? '单击加锚点 · 拖动出手柄 · 点首点闭合 · Enter 收尾'
              : selectedPenNode
                ? '拖动锚点/手柄改形 · 双击锚点切角/平滑 · 点线段加点 · Delete 删锚点 · Alt + 点锚点起分支/点空白加轮廓'
                : '单击放锚点 · 拖动出手柄 · Enter / 双击收尾 · 点首点闭合'
            : guideDraft
            ? guideDraft.deleting
              ? '松开删除参考线'
              : guideDraft.mode === 'new'
                ? `拖动放置参考线 · ${guideLabel(guideDraft)}`
                : `参考线 ${guideLabel(guideDraft)} · 拖回标尺删除`
            : hoveredGuide
              ? `参考线 ${guideLabel(hoveredGuide)} · 拖动移动 · Delete 删除`
              : dragSnapHint
                ? '拖动中 · 8px 吸附 · Alt 临时关闭'
                : selectedType === 'text'
                  ? '双击文本编辑内容 · 滚轮缩放'
                  : selectionCount > 1
                    ? `${selectionCount} 个图层 · 拖动一起移动`
                    : '从标尺拖参考线 · 空白拖动框选 · Shift 追加选择 · 空格拖动'}
      </div>
    </div>
  );
}

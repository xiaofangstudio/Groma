import { useEffect, useRef, useState } from 'react';
import { RULER, drawEditor, drawRulers, type DrawStats } from '../render/draw';
import { screenToWorld } from '../core/viewport';
import {
  absolutePosition,
  absoluteRect,
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
import { setCursor } from '../state/cursor';
import type { Guide, Rect, SceneNode } from '../core/types';

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

interface DrawDrag {
  pointerId: number;
  tool: 'frame' | 'rect' | 'ellipse';
  startWorld: { x: number; y: number };
  currentWorld: { x: number; y: number };
  parent: SceneNode;
  parentAbs: { x: number; y: number };
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

export function CanvasView() {
  const s = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<PanDrag | null>(null);
  const moveRef = useRef<MoveDrag | null>(null);
  const resizeRef = useRef<ResizeDrag | null>(null);
  const drawRef = useRef<DrawDrag | null>(null);
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
  const [marquee, setMarquee] = useState<ScreenRect | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [dragSnapHint, setDragSnapHint] = useState(false);
  const [guideDraft, setGuideDraft] = useState<GuideDraft | null>(null);
  const [hoverGuide, setHoverGuide] = useState<number | null>(null);

  const { doc, pageId, viewport, selectedIds, viewSize } = s;
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0];

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
    const list = pageGuides(current);
    const v = current.viewport;
    const tolerance = 4;
    for (let index = 0; index < list.length; index += 1) {
      const guide = list[index];
      if (guide.axis === 'x') {
        const sx = RULER + guide.position * v.scale + v.x;
        if (Math.abs(p.x - sx) <= tolerance) return { index, guide };
      } else {
        const sy = RULER + guide.position * v.scale + v.y;
        if (Math.abs(p.y - sy) <= tolerance) return { index, guide };
      }
    }
    return null;
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
      });
    };
    // 拖动/缩放时一次事件可能触发多次状态更新，合并到下一帧只画一次。
    raf = window.requestAnimationFrame(render);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [doc, page, viewport, selectedIds, viewSize.w, viewSize.h, interacting]);

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

    if (current.tool === 'frame' || current.tool === 'rect' || current.tool === 'ellipse') {
      const parent =
        current.tool === 'frame' ? root : deepestFrame(current.doc, statePage, world.x, world.y) ?? root;
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
      setPreview({ x: p.x, y: p.y, w: 0, h: 0 });
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const current = getState();
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
      let sx = Math.min(draft.startWorld.x, cw.x);
      let sy = Math.min(draft.startWorld.y, cw.y);
      let w = Math.abs(cw.x - draft.startWorld.x);
      let h = Math.abs(cw.y - draft.startWorld.y);

      if (w < 3 || h < 3) {
        w = draft.tool === 'frame' ? 1440 : 120;
        h = draft.tool === 'frame' ? 900 : 80;
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
      drawRef.current = null;
      setPreview(null);
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
    const p = contentPoint(e);
    if (p.x < 0 || p.y < 0) return;
    const current = getState();
    const world = screenToWorld(current.viewport, p.x, p.y);
    const statePage = current.doc.pages.find((pg) => pg.id === current.pageId) ?? current.doc.pages[0];
    const hit = hitTestDeep(current.doc, statePage, world.x, world.y);
    if (!hit) return;
    editor.select(hit.id);
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
  const cursor = hand ? 'grab' : s.tool === 'move' ? guideCursor ?? 'default' : 'crosshair';
  const selectedType = selectedIds.length === 1 ? doc.nodes[selectedIds[0]]?.type : null;
  const selectionCount = selectedIds.length;
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
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      {(page.guides ?? []).map((guide, index) => {
        const dragging = guideDraft?.mode === 'move' && guideDraft.index === index;
        const deleting = dragging && guideDraft?.deleting;
        if (dragging && !deleting) return null;
        const px = RULER + guide.position * viewport.scale + viewport.x;
        const py = RULER + guide.position * viewport.scale + viewport.y;
        return (
          <div
            key={`manual-${index}-${guide.axis}-${guide.position}`}
            className={`manual-guide manual-guide-${guide.axis}${hoverGuide === index ? ' is-hover' : ''}${deleting ? ' is-deleting' : ''}`}
            aria-hidden="true"
            style={
              guide.axis === 'x'
                ? { left: px, top: RULER, height: Math.max(1, viewSize.h - RULER) }
                : { left: RULER, top: py, width: Math.max(1, viewSize.w - RULER) }
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
        {hand
          ? '拖动平移 · 滚轮缩放'
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

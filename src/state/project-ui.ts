import type { Viewport } from '../core/viewport';

export interface ProjectUiState {
  pageId?: string;
  viewports?: Record<string, Viewport>;
}

const PREFIX = 'groma:project-ui:v1:';

function storage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    const local = (globalThis as { localStorage?: Storage }).localStorage;
    return local ?? null;
  } catch {
    return null;
  }
}

function isViewport(value: unknown): value is Viewport {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.scale) && Number(v.scale) > 0;
}

export function loadProjectUi(projectId: string): ProjectUiState | undefined {
  const store = storage();
  if (!store || !projectId) return undefined;
  try {
    const raw = store.getItem(PREFIX + projectId);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return undefined;
    const viewports: Record<string, Viewport> = {};
    if (parsed.viewports && typeof parsed.viewports === 'object') {
      for (const [pageId, viewport] of Object.entries(parsed.viewports as Record<string, unknown>)) {
        if (!isViewport(viewport)) continue;
        viewports[pageId] = { x: viewport.x, y: viewport.y, scale: viewport.scale };
      }
    }
    return {
      pageId: typeof parsed.pageId === 'string' ? parsed.pageId : undefined,
      viewports,
    };
  } catch {
    return undefined;
  }
}

export function saveProjectUi(projectId: string, ui: ProjectUiState): void {
  const store = storage();
  if (!store || !projectId) return;
  try {
    store.setItem(
      PREFIX + projectId,
      JSON.stringify({ pageId: ui.pageId, viewports: ui.viewports ?? {} }),
    );
  } catch {
    // 本地 UI 记忆不是设计内容，写入失败不应影响编辑与保存。
  }
}

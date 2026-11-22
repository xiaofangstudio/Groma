import { invoke } from '@tauri-apps/api/core';
import type { GromaDoc } from '../core/types';
import { serializeDoc, deserializeDoc } from '../core/serialize';

export interface ProjectEntry {
  id: string;
  name: string;
  updatedAt: number;
  bytes: number;
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);
}

export async function listProjects(): Promise<ProjectEntry[]> {
  if (!isDesktop()) return [];
  return invoke<ProjectEntry[]>('groma_list_projects');
}

export async function createProject(name: string): Promise<string> {
  if (!isDesktop()) throw new Error('当前不在桌面端，无法落盘');
  return invoke<string>('groma_create_project', { name });
}

const saveChains = new Map<string, Promise<void>>();

export async function saveProject(id: string, doc: GromaDoc): Promise<void> {
  if (!isDesktop()) throw new Error('当前不在桌面端，无法落盘');
  const sceneJson = serializeDoc(doc);
  const previous = saveChains.get(id) ?? Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(() => invoke('groma_save_project', { id, sceneJson }))
    .then(() => undefined);
  // 同一工程的写入串行化：旧保存即使晚返回，也不可能覆盖新保存。
  saveChains.set(id, task.catch(() => undefined));
  return task;
}

export async function loadProject(id: string): Promise<GromaDoc> {
  if (!isDesktop()) throw new Error('当前不在桌面端，无法读取工程');
  const text = await invoke<string>('groma_load_project', { id });
  return deserializeDoc(text);
}

export async function exportPng(id: string, suggestedName: string, dataUrl: string): Promise<string> {
  if (!isDesktop()) throw new Error('当前不在桌面端，无法导出');
  return invoke<string>('groma_export_png', { id, suggestedName, dataUrl });
}

export async function renameProject(id: string, name: string): Promise<void> {
  if (!isDesktop()) return;
  await invoke('groma_rename_project', { id, name });
}

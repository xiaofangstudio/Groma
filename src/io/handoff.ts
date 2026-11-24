import { invoke } from '@tauri-apps/api/core';
import { isDesktop, type ExportFormat } from './project';

/** Groma 的两个交接目标：位图去 Strata，矢量去 Vexa。 */
export type HandoffTarget = 'strata' | 'vexa';

export interface HandoffInfo {
  target: HandoffTarget;
  exe: string;
  file: string;
}

/** 格式映射固定，不把 PNG/JPG 塞给 Vexa，也不把 SVG 塞给 Strata。 */
export function handoffTargetForFormat(format: ExportFormat): HandoffTarget {
  return format === 'svg' ? 'vexa' : 'strata';
}

export function handoffLabel(target: HandoffTarget): string {
  return target === 'strata' ? 'Strata' : 'Vexa';
}

export function handoffDescription(target: HandoffTarget): string {
  return target === 'strata' ? 'PNG/JPG 位图精修' : 'SVG 矢量编辑';
}

export async function openExportInApp(target: HandoffTarget, file: string): Promise<HandoffInfo> {
  if (!isDesktop()) throw new Error('当前不在桌面端，无法启动外部应用');
  return invoke<HandoffInfo>('groma_open_in_app', { target, file });
}

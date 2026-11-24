import type { SvgImport } from './importSvg';
import { writeAsset } from './project';
import { registerImageAsset } from './images';
import { editor } from '../state/editor';

export interface SvgImportResult {
  ids: string[];
  count: number;
  warnings: string[];
}

/**
 * 把解析后的 SVG 图形真正落进当前画面。
 * 内嵌图片先写入工程 assets，再注册到渲染缓存；没有工程时只保留本次会话可用的数据。
 */
export async function applySvgImport(parsed: SvgImport, projectId: string | null): Promise<SvgImportResult> {
  const warnings = [...parsed.warnings];
  const imageAssets = parsed.assets ?? [];
  for (const item of imageAssets) {
    const comma = item.dataUrl.indexOf(',');
    const base64 = comma >= 0 ? item.dataUrl.slice(comma + 1) : '';
    if (projectId && base64) {
      try {
        const ext = item.asset.mime === 'image/png' ? 'png' : item.asset.mime === 'image/webp' ? 'webp' : 'jpg';
        const stored = await writeAsset(
          projectId,
          `${item.asset.name || '图片'}.${ext}`,
          item.asset.mime,
          base64,
        );
        item.asset.file = stored.file;
        item.asset.bytes = stored.bytes;
      } catch {
        warnings.push('图片资产未落盘，重新打开工程后可能丢失');
      }
    } else if (base64) {
      warnings.push('当前没有工程，图片只在本次会话可见');
    }
    await registerImageAsset(item.asset, item.dataUrl);
  }
  const ids = editor.importFrames(parsed);
  const count = parsed.frames.reduce(
    (sum, frame) => sum + frame.children.reduce((childSum, child) => childSum + 1 + child.children.length, 0),
    0,
  );
  return { ids, count: Math.max(count, ids.length), warnings };
}

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { editor, useEditor } from '../state/editor';
import { renameProject } from '../io/project';
import { parseSvgDrawing } from '../io/importSvg';
import { applySvgImport } from '../io/applySvgImport';
import { importImageAsset, isImageFile } from '../io/images';
import { ExportDialog } from './ExportDialog';
import { VersionHistory } from './VersionHistory';
import {
  IconCursor,
  IconEllipse,
  IconExport,
  IconFit,
  IconFrame,
  IconHand,
  IconHistory,
  IconImport,
  IconArrow,
  IconLine,
  IconMinus,
  IconPen,
  IconPlus,
  IconPolygon,
  IconRect,
  IconRedo,
  IconSection,
  IconSlice,
  IconStar,
  IconText,
  IconUndo,
} from './icons';

export function TopBar() {
  const s = useEditor();
  const [name, setName] = useState(s.doc.name);
  const [exportOpen, setExportOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; detail: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(s.doc.name);
  }, [s.doc.name]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const scalePct = Math.round(s.viewport.scale * 100);

  function commitName() {
    const next = name.trim() || '未命名设计';
    setName(next);
    if (next !== s.doc.name) {
      editor.renameDoc(next);
      if (s.projectId) {
        void renameProject(s.projectId, next).catch(() => undefined);
      }
    }
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      if (isImageFile(file)) {
        if (!s.projectId) throw new Error('先保存工程，再把图片放进 assets');
        const { asset } = await importImageAsset(s.projectId, file);
        editor.insertImage(asset);
        setToast({
          title: '已导入图片',
          detail: `${asset.name} · ${asset.w} × ${asset.h}`,
        });
        return;
      }
      const isSvg = /\.svg$/i.test(file.name) || file.type === 'image/svg+xml';
      if (!isSvg) throw new Error('只支持 SVG / PNG / JPG / WebP');
      const text = await file.text();
      const parsed = parseSvgDrawing(text, file.name.replace(/\.svg$/i, '') || 'Vexa 图形');
      if (parsed.frames.every((frame) => frame.children.length === 0)) {
        throw new Error('SVG 里没有可导入的图形');
      }
      const result = await applySvgImport(parsed, s.projectId);
      setToast({
        title: `已导入 ${result.count} 个图层`,
        detail: result.warnings.length ? result.warnings.join(' · ') : file.name,
      });
    } catch (error) {
      setToast({
        title: '导入失败',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <img className="topbar-logo" src="/groma-icon.png" alt="" draggable={false} />
          <span className="topbar-wordmark">Groma</span>
          <span className="topbar-sep" />
          <input
            className="doc-name"
            value={name}
            spellCheck={false}
            aria-label="工程名称"
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setName(s.doc.name);
                e.currentTarget.blur();
              }
            }}
          />
        </div>

        <div className="topbar-tools" role="toolbar" aria-label="工具">
          <button
            className={`tool-btn${s.tool === 'move' ? ' is-active' : ''}`}
            title="移动工具 V"
            aria-label="移动工具"
            onClick={() => editor.setTool('move')}
          >
            <IconCursor size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'frame' ? ' is-active' : ''}`}
            title="画板工具 F"
            aria-label="画板工具"
            onClick={() => editor.setTool('frame')}
          >
            <IconFrame size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'section' ? ' is-active' : ''}`}
            title="区块工具 S"
            aria-label="区块工具"
            onClick={() => editor.setTool('section')}
          >
            <IconSection size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'rect' ? ' is-active' : ''}`}
            title="矩形工具 R"
            aria-label="矩形工具"
            onClick={() => editor.setTool('rect')}
          >
            <IconRect size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'ellipse' ? ' is-active' : ''}`}
            title="椭圆工具 O"
            aria-label="椭圆工具"
            onClick={() => editor.setTool('ellipse')}
          >
            <IconEllipse size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'line' ? ' is-active' : ''}`}
            title="直线工具 L"
            aria-label="直线工具"
            onClick={() => editor.setTool('line')}
          >
            <IconLine size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'arrow' ? ' is-active' : ''}`}
            title="箭头工具 A"
            aria-label="箭头工具"
            onClick={() => editor.setTool('arrow')}
          >
            <IconArrow size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'polygon' ? ' is-active' : ''}`}
            title="多边形工具 G"
            aria-label="多边形工具"
            onClick={() => editor.setTool('polygon')}
          >
            <IconPolygon size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'star' ? ' is-active' : ''}`}
            title="星形工具 Y"
            aria-label="星形工具"
            onClick={() => editor.setTool('star')}
          >
            <IconStar size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'pen' ? ' is-active' : ''}`}
            title="钢笔工具 P"
            aria-label="钢笔工具"
            onClick={() => editor.setTool('pen')}
          >
            <IconPen size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'slice' ? ' is-active' : ''}`}
            title="切片工具 K"
            aria-label="切片工具"
            onClick={() => editor.setTool('slice')}
          >
            <IconSlice size={15} />
          </button>
          <button
            className={`tool-btn${s.tool === 'text' ? ' is-active' : ''}`}
            title="文字工具 T"
            aria-label="文字工具"
            onClick={() => editor.setTool('text')}
          >
            <IconText size={15} />
          </button>
          <span className="tool-sep" />
          <button
            className={`tool-btn${s.tool === 'hand' ? ' is-active' : ''}`}
            title="抓手工具 H"
            aria-label="抓手工具"
            onClick={() => editor.setTool('hand')}
          >
            <IconHand size={15} />
          </button>
          <span className="tool-sep" />
          <button
            className="tool-btn"
            title="撤销 Ctrl+Z"
            aria-label="撤销"
            disabled={s.past.length === 0}
            onClick={() => editor.undo()}
          >
            <IconUndo size={15} />
          </button>
          <button
            className="tool-btn"
            title="重做 Ctrl+Shift+Z"
            aria-label="重做"
            disabled={s.future.length === 0}
            onClick={() => editor.redo()}
          >
            <IconRedo size={15} />
          </button>
        </div>

        <div className="topbar-right">
          <input
            ref={fileRef}
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => void onImportFile(e)}
          />
          <button
            className="export-btn"
            title="导入 SVG 图形或图片"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            <IconImport size={14} />
            <span>{importing ? '导入中…' : '导入'}</span>
          </button>
          <button
            className="version-btn"
            title="版本历史"
            aria-label="版本历史"
            disabled={!s.projectId}
            onClick={() => setVersionOpen(true)}
          >
            <IconHistory size={14} />
            <span>版本</span>
          </button>
          <button className="export-btn" title="导出 PNG / JPG / SVG" onClick={() => setExportOpen(true)}>
            <IconExport size={14} />
            <span>导出</span>
          </button>
          <span className="topbar-sep" />
          <button className="zoom-btn" title="缩小" aria-label="缩小" onClick={() => editor.setZoomPercent(scalePct * 0.8)}>
            <IconMinus size={14} />
          </button>
          <button className="zoom-value" title="缩放到 100%" onClick={() => editor.setZoomPercent(100)}>
            {scalePct}%
          </button>
          <button className="zoom-btn" title="放大" aria-label="放大" onClick={() => editor.setZoomPercent(scalePct * 1.25)}>
            <IconPlus size={14} />
          </button>
          <button className="zoom-btn" title="适应画板 Shift+1" aria-label="适应画板" onClick={() => editor.fitAll()}>
            <IconFit size={14} />
          </button>
        </div>
      </header>

      {exportOpen && (
        <ExportDialog
          onClose={() => setExportOpen(false)}
          onDone={(title, detail) => {
            setExportOpen(false);
            setToast({ title, detail });
          }}
        />
      )}

      {versionOpen && <VersionHistory onClose={() => setVersionOpen(false)} />}

      {toast && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          <strong>{toast.title}</strong>
          <span className="toast-path" title={toast.detail}>{toast.detail}</span>
        </div>
      )}
    </>
  );
}


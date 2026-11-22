import { useEffect, useState } from 'react';
import { editor, useEditor } from '../state/editor';
import { renameProject } from '../io/project';
import { ExportDialog } from './ExportDialog';
import {
  IconCursor,
  IconEllipse,
  IconExport,
  IconFit,
  IconFrame,
  IconHand,
  IconMinus,
  IconPlus,
  IconRect,
  IconRedo,
  IconText,
  IconUndo,
} from './icons';

export function TopBar() {
  const s = useEditor();
  const [name, setName] = useState(s.doc.name);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
          <button className="export-btn" title="导出 PNG" onClick={() => setExportOpen(true)}>
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
          onDone={(path) => {
            setExportOpen(false);
            setToast(path);
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          <strong>PNG 已导出</strong>
          <span className="toast-path" title={toast}>{toast}</span>
        </div>
      )}
    </>
  );
}


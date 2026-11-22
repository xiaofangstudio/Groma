import { useEditor } from '../state/editor';
import { useCursor } from '../state/cursor';

export function StatusBar() {
  const s = useEditor();
  const cursor = useCursor();
  const page = s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
  const root = s.doc.nodes[page.rootId];
  const frames = root ? root.children.length : 0;
  const selected = s.selectedId ? s.doc.nodes[s.selectedId] : null;

  const saveLabel = !s.projectId
    ? '未落盘'
    : s.saveState === 'saving'
      ? '保存中…'
      : s.saveState === 'error'
        ? '保存失败'
        : s.saveState === 'saved'
          ? '已保存'
          : '本地';

  return (
    <footer className="statusbar">
      <div className="status-left">
        <span className="status-page">{page.name}</span>
        <span className="status-sep" />
        <span>{frames} 个画板</span>
        {s.selectedIds.length > 1 ? (
          <>
            <span className="status-sep" />
            <span className="status-page">已选 {s.selectedIds.length} 个图层</span>
          </>
        ) : selected && (selected.type === 'frame' || selected.type === 'group') ? (
          <>
            <span className="status-sep" />
            <span className="status-page">{selected.name}</span>
          </>
        ) : null}
      </div>

      <div className="status-center">
        <span>X {cursor ? cursor.x : '—'}</span>
        <span>Y {cursor ? cursor.y : '—'}</span>
      </div>

      <div className="status-right">
        <span className={`status-save${s.saveState === 'error' ? ' is-error' : ''}`}>{saveLabel}</span>
        <span className="status-zoom">{Math.round(s.viewport.scale * 100)}%</span>
      </div>
    </footer>
  );
}

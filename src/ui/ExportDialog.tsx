import { useEffect, useMemo, useState } from 'react';
import { useEditor } from '../state/editor';
import { exportPng } from '../io/project';
import { renderFramePng } from '../render/draw';
import type { GromaDoc, Page, SceneNode } from '../core/types';

function pickFrame(doc: GromaDoc, page: Page, selectedId: string | null): SceneNode | null {
  if (selectedId) {
    let node: SceneNode | undefined = doc.nodes[selectedId];
    while (node && node.type !== 'frame') {
      node = node.parentId ? doc.nodes[node.parentId] : undefined;
    }
    if (node && node.type === 'frame') return node;
  }
  const root = doc.nodes[page.rootId];
  if (!root) return null;
  for (const id of root.children) {
    const node = doc.nodes[id];
    if (node && node.type === 'frame') return node;
  }
  return null;
}

interface Props {
  onClose: () => void;
  onDone: (path: string) => void;
}

export function ExportDialog({ onClose, onDone }: Props) {
  const s = useEditor();
  const page = s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
  const frame = useMemo(() => pickFrame(s.doc, page, s.selectedId), [s.doc, page, s.selectedId]);
  const [scale, setScale] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function run() {
    if (!frame) {
      setError('当前页面没有画板，先画一个画板再导出。');
      return;
    }
    if (!s.projectId) {
      setError('工程尚未落盘，无法导出。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rendered = renderFramePng(s.doc, frame.id, scale, transparent);
      if (!rendered) throw new Error('画板渲染失败');
      const suffix = transparent ? '-透明' : '';
      const path = await exportPng(s.projectId, `${frame.name}@${scale}x${suffix}`, rendered.dataUrl);
      onDone(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && onClose()}>
      <div className="modal-card export-card" role="dialog" aria-modal="true" aria-label="导出 PNG" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-title">导出 PNG</div>
        <div className="dialog-sub">
          {frame ? `画板 · ${frame.name}` : '当前页面没有画板'}
        </div>

        <div className="export-section">
          <div className="export-label">倍数</div>
          <div className="export-scales">
            <button className={`export-scale${scale === 1 ? ' is-on' : ''}`} onClick={() => setScale(1)} disabled={busy}>
              <strong>1×</strong>
              <span>{frame ? `${Math.round(frame.w)} × ${Math.round(frame.h)}` : '—'}</span>
            </button>
            <button className={`export-scale${scale === 2 ? ' is-on' : ''}`} onClick={() => setScale(2)} disabled={busy}>
              <strong>2×</strong>
              <span>{frame ? `${Math.round(frame.w * 2)} × ${Math.round(frame.h * 2)}` : '—'}</span>
            </button>
          </div>
        </div>

        <label className="export-check">
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} disabled={busy} />
          <span>透明背景</span>
          <em>保留画板上的透明区域</em>
        </label>

        <div className="export-hint">PNG 会保存到该工程的 exports 目录，与场景文件放在一起。</div>
        {error && <div className="export-error">{error}</div>}

        <div className="modal-actions export-actions">
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>取消</button>
          <button className="btn btn-primary" onClick={run} disabled={busy || !frame} autoFocus>
            {busy ? '导出中…' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}

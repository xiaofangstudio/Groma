import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../state/editor';
import { exportFile, type ExportFormat } from '../io/project';
import { renderFrameJpg, renderFramePng } from '../render/draw';
import { renderFrameSvg } from '../render/svg';
import type { GromaDoc, Page, SceneNode } from '../core/types';

function pickFrame(doc: GromaDoc, page: Page, selectedId: string | null): SceneNode | null {
  if (selectedId) {
    let node: SceneNode | undefined = doc.nodes[selectedId];
    while (node && node.type !== 'frame' && node.type !== 'section') {
      node = node.parentId ? doc.nodes[node.parentId] : undefined;
    }
    if (node && (node.type === 'frame' || node.type === 'section')) return node;
  }
  const root = doc.nodes[page.rootId];
  if (!root) return null;
  for (const id of root.children) {
    const node = doc.nodes[id];
    if (node && (node.type === 'frame' || node.type === 'section')) return node;
  }
  return null;
}

function topLevelTargets(doc: GromaDoc, page: Page): SceneNode[] {
  const root = doc.nodes[page.rootId];
  if (!root) return [];
  return root.children
    .map((id) => doc.nodes[id])
    .filter((node): node is SceneNode => Boolean(node && (node.type === 'frame' || node.type === 'section')));
}

function parentDir(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index >= 0 ? path.slice(0, index) : path;
}

interface Props {
  onClose: () => void;
  onDone: (title: string, detail: string) => void;
}

export function ExportDialog({ onClose, onDone }: Props) {
  const s = useEditor();
  const page = s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
  const frame = useMemo(() => pickFrame(s.doc, page, s.selectedId), [s.doc, page, s.selectedId]);
  const allTargets = useMemo(() => topLevelTargets(s.doc, page), [s.doc, page]);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scope, setScope] = useState<'single' | 'page'>('single');
  const [scale, setScale] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (format === 'jpg') setTransparent(false);
  }, [format]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const targets = scope === 'page' ? allTargets : frame ? [frame] : [];
  const single = targets.length === 1 ? targets[0] : null;

  async function run() {
    if (running.current) return;
    if (targets.length === 0) {
      setError('当前页面没有画板或区块，先画一个画板再导出。');
      return;
    }
    if (!s.projectId) {
      setError('工程尚未落盘，无法导出。');
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const paths: string[] = [];
      for (const target of targets) {
        if (format === 'svg') {
          const rendered = renderFrameSvg(s.doc, target.id, transparent, 1);
          if (!rendered) throw new Error(`${target.name} 渲染失败`);
          paths.push(await exportFile(s.projectId, target.name, 'svg', rendered.svg));
        } else {
          const rendered = format === 'jpg'
            ? renderFrameJpg(s.doc, target.id, scale, false)
            : renderFramePng(s.doc, target.id, scale, transparent);
          if (!rendered) throw new Error(`${target.name} 渲染失败`);
          const suffix = format === 'jpg' ? '' : transparent ? '-透明' : '';
          const ext = format === 'jpg' ? 'jpg' : 'png';
          const base = `${target.name}@${scale}x${suffix}`;
          paths.push(await exportFile(s.projectId, base, ext, rendered.dataUrl));
        }
      }
      if (paths.length === 1) {
        onDone(`${format.toUpperCase()} 已导出`, paths[0]);
      } else {
        onDone(`已导出 ${paths.length} 个文件`, parentDir(paths[paths.length - 1]));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      running.current = false;
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && onClose()}>
      <div className="modal-card export-card" role="dialog" aria-modal="true" aria-label="导出画板" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-title">导出</div>
        <div className="dialog-sub">
          {single ? `${single.type === 'section' ? '区块' : '画板'} · ${single.name}` : `本页 ${targets.length} 个画板/区块`}
        </div>

        <div className="export-body">
        <div className="export-section">
          <div className="export-label">格式</div>
          <div className="export-formats" role="group" aria-label="导出格式">
            <button className={`export-format${format === 'png' ? ' is-on' : ''}`} aria-pressed={format === 'png'} onClick={() => setFormat('png')} disabled={busy}>
              <strong>PNG</strong>
              <span>透明位图</span>
            </button>
            <button className={`export-format${format === 'jpg' ? ' is-on' : ''}`} aria-pressed={format === 'jpg'} onClick={() => setFormat('jpg')} disabled={busy}>
              <strong>JPG</strong>
              <span>体积更小</span>
            </button>
            <button className={`export-format${format === 'svg' ? ' is-on' : ''}`} aria-pressed={format === 'svg'} onClick={() => setFormat('svg')} disabled={busy}>
              <strong>SVG</strong>
              <span>矢量可缩放</span>
            </button>
          </div>
        </div>

        {allTargets.length > 1 && (
          <div className="export-section">
            <div className="export-label">范围</div>
            <div className="export-scopes" role="group" aria-label="导出范围">
              <button className={`export-scope${scope === 'single' ? ' is-on' : ''}`} aria-pressed={scope === 'single'} onClick={() => setScope('single')} disabled={busy}>
                当前选中
              </button>
              <button className={`export-scope${scope === 'page' ? ' is-on' : ''}`} aria-pressed={scope === 'page'} onClick={() => setScope('page')} disabled={busy}>
                本页全部 ({allTargets.length})
              </button>
            </div>
          </div>
        )}

        {format !== 'svg' && (
          <div className="export-section">
            <div className="export-label">倍数</div>
            <div className="export-scales">
              <button className={`export-scale${scale === 1 ? ' is-on' : ''}`} onClick={() => setScale(1)} disabled={busy}>
                <strong>1×</strong>
                <span>{single ? `${Math.round(single.w)} × ${Math.round(single.h)}` : '逐块输出'}</span>
              </button>
              <button className={`export-scale${scale === 2 ? ' is-on' : ''}`} onClick={() => setScale(2)} disabled={busy}>
                <strong>2×</strong>
                <span>{single ? `${Math.round(single.w * 2)} × ${Math.round(single.h * 2)}` : '逐块输出'}</span>
              </button>
            </div>
          </div>
        )}

        <label className={`export-check${format === 'jpg' ? ' is-disabled' : ''}`}>
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
            disabled={busy || format === 'jpg'}
          />
          <span>透明背景</span>
          <em>{format === 'jpg' ? 'JPG 不支持透明，自动填白' : '保留画板上的透明区域'}</em>
        </label>

        <div className="export-hint">
          {format === 'svg' ? 'SVG 1× 矢量写入 exports。' : `${format.toUpperCase()} 写入 exports。`}
          {targets.length > 1 ? ' 批量逐个写入，重名自动编号。' : ''}
        </div>
        {error && <div className="export-error">{error}</div>}
        </div>

        <div className="modal-actions export-actions">
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>取消</button>
          <button className="btn btn-primary" onClick={run} disabled={busy || targets.length === 0} autoFocus>
            {busy ? '导出中…' : targets.length > 1 ? `导出 ${targets.length} 个` : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../state/editor';
import { exportFile, type ExportFormat } from '../io/project';
import { preloadDocImages } from '../io/images';
import { renderFrameJpg, renderFramePng, renderNodePng, renderSliceJpg, renderSlicePng } from '../render/draw';
import { renderFrameSvg, renderNodeSvg, renderSliceSvg } from '../render/svg';
import type { GromaDoc, Page, SceneNode } from '../core/types';

function pickTarget(doc: GromaDoc, page: Page, selectedId: string | null): SceneNode | null {
  if (selectedId) {
    const node = doc.nodes[selectedId];
    if (node && node.type !== 'page') return node;
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
    .filter((node): node is SceneNode =>
      Boolean(node && (node.type === 'frame' || node.type === 'section' || node.type === 'slice')),
    );
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
  const frame = useMemo(() => pickTarget(s.doc, page, s.selectedId), [s.doc, page, s.selectedId]);
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
  const formatNote =
    format === 'png'
      ? '无损位图，支持透明背景'
      : format === 'jpg'
        ? '体积更小，自动填白底'
        : '矢量输出，固定 1×';
  const outputSummary =
    targets.length > 1
      ? `${format.toUpperCase()} · ${format === 'svg' ? '1×' : `${scale}×`} · ${targets.length} 个文件`
      : single
        ? `${format.toUpperCase()} · ${format === 'svg' ? '1×' : `${scale}×`} · ${Math.round(
            single.w * (format === 'svg' ? 1 : scale),
          )} × ${Math.round(single.h * (format === 'svg' ? 1 : scale))}`
        : '当前没有可导出的画板、区块或切片';

  async function run() {
    if (running.current) return;
    if (targets.length === 0) {
      setError('当前页面没有画板、区块或切片，先画一个画板再导出。');
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
      await preloadDocImages(s.doc);
      const paths: string[] = [];
      for (const target of targets) {
        const sliced = target.type === 'slice';
        const frameLike = target.type === 'frame' || target.type === 'section';
        if (format === 'svg') {
          const rendered = sliced
            ? renderSliceSvg(s.doc, target.id, transparent, 1)
            : frameLike
              ? renderFrameSvg(s.doc, target.id, transparent, 1)
              : renderNodeSvg(s.doc, target.id, transparent, 1);
          if (!rendered) throw new Error(`${target.name} 渲染失败`);
          paths.push(await exportFile(s.projectId, target.name, 'svg', rendered.svg));
        } else {
          const rendered = sliced
            ? format === 'jpg'
              ? renderSliceJpg(s.doc, target.id, scale, false)
              : renderSlicePng(s.doc, target.id, scale, transparent)
            : frameLike
              ? format === 'jpg'
                ? renderFrameJpg(s.doc, target.id, scale, false)
                : renderFramePng(s.doc, target.id, scale, transparent)
              : renderNodePng(s.doc, target.id, scale, transparent);
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
          {single
            ? `${single.type === 'section' ? '区块' : single.type === 'slice' ? '切片' : single.type === 'frame' ? '画板' : '图层'} · ${single.name}`
            : `本页 ${targets.length} 个画板/区块/切片`}
        </div>

        <div className="export-body">
          <div className="export-section">
            <div className="export-label">格式</div>
            <div className="export-seg" role="group" aria-label="导出格式">
              {(['png', 'jpg', 'svg'] as const).map((f) => (
                <button
                  key={f}
                  className={`export-seg-btn${format === f ? ' is-on' : ''}`}
                  aria-pressed={format === f}
                  onClick={() => setFormat(f)}
                  disabled={busy}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="export-note">{formatNote}</div>
          </div>

          {allTargets.length > 1 && (
            <div className="export-section">
              <div className="export-label">范围</div>
              <div className="export-seg" role="group" aria-label="导出范围">
                <button
                  className={`export-seg-btn${scope === 'single' ? ' is-on' : ''}`}
                  aria-pressed={scope === 'single'}
                  onClick={() => setScope('single')}
                  disabled={busy}
                >
                  当前选中
                </button>
                <button
                  className={`export-seg-btn${scope === 'page' ? ' is-on' : ''}`}
                  aria-pressed={scope === 'page'}
                  onClick={() => setScope('page')}
                  disabled={busy}
                >
                  本页全部 · {allTargets.length}
                </button>
              </div>
            </div>
          )}

          {format !== 'svg' && (
            <div className="export-section">
              <div className="export-label">倍数</div>
              <div className="export-scale-row">
                <div className="export-seg export-seg-scale" role="group" aria-label="导出倍数">
                  {[1, 2].map((n) => (
                    <button
                      key={n}
                      className={`export-seg-btn${scale === n ? ' is-on' : ''}`}
                      aria-pressed={scale === n}
                      onClick={() => setScale(n)}
                      disabled={busy}
                    >
                      {n}×
                    </button>
                  ))}
                </div>
                <span className="export-output-size">
                  {single ? `${Math.round(single.w * scale)} × ${Math.round(single.h * scale)}` : '逐块输出'}
                </span>
              </div>
            </div>
          )}

          <label className={`export-toggle${format === 'jpg' ? ' is-disabled' : ''}`}>
            <span className="export-toggle-copy">
              <strong>透明背景</strong>
              <em>{format === 'jpg' ? 'JPG 不支持透明，自动填白' : '保留画板上的透明区域'}</em>
            </span>
            <span className="export-toggle-control">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
                disabled={busy || format === 'jpg'}
              />
              <span className="export-switch" aria-hidden="true" />
            </span>
          </label>

          <div className="export-summary">
            <span>{outputSummary}</span>
            <span>写入 exports · 重名自动编号</span>
          </div>
          {error && <div className="export-error">{error}</div>}
        </div>

        <div className="modal-actions export-actions">
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>取消</button>
          <button className="btn btn-primary" onClick={() => void run()} disabled={busy || targets.length === 0} autoFocus>
            {busy ? '导出中…' : targets.length > 1 ? `导出 ${targets.length} 个` : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { editor, useEditor } from '../state/editor';
import {
  createSnapshot,
  listSnapshots,
  loadSnapshot,
  restoreSnapshot,
  saveProject,
  type SnapshotEntry,
} from '../io/project';
import type { GromaDoc, Page } from '../core/types';
import { diffDocs, diffSummary } from '../core/diff';
import { drawPageThumbnail } from '../render/draw';

const PREVIEW_W = 416;
const PREVIEW_H = 234;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const year = date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}/`;
  return `${year}${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
}

function countNodes(doc: GromaDoc): number {
  return Math.max(0, Object.keys(doc.nodes).length - doc.pages.length);
}

function SnapshotPreview({ doc, page }: { doc: GromaDoc; page: Page }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawPageThumbnail(canvas, doc, page, PREVIEW_W, PREVIEW_H);
  }, [doc, page]);

  return <canvas ref={canvasRef} className="version-preview-canvas" aria-label="版本预览" />;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function VersionHistory({ onClose }: { onClose: () => void }) {
  const s = useEditor();
  const projectId = s.projectId;
  const [snapshots, setSnapshots] = useState<SnapshotEntry[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<GromaDoc | null>(null);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!projectId) {
      setSnapshots([]);
      return () => {
        alive = false;
      };
    }
    listSnapshots(projectId)
      .then((list) => {
        if (!alive) return;
        setSnapshots(list);
        setSelected(list[0]?.timestamp ?? null);
      })
      .catch((e) => {
        if (!alive) return;
        setSnapshots([]);
        setListError(`读取版本列表失败：${errorText(e)}`);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    if (!projectId || selected === null) {
      setPreview(null);
      setPreviewPageId(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return () => {
        alive = false;
      };
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setConfirming(false);
    loadSnapshot(projectId, selected)
      .then((doc) => {
        if (!alive) return;
        setPreview(doc);
        setPreviewPageId(doc.pages[0]?.id ?? null);
        setPreviewLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setPreview(null);
        setPreviewError(`读取版本内容失败：${errorText(e)}`);
        setPreviewLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId, selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !restoring && !creating) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating, onClose, restoring]);

  const previewPage = preview?.pages.find((page) => page.id === previewPageId) ?? preview?.pages[0] ?? null;
  const diff = useMemo(() => (preview ? diffDocs(preview, s.doc) : null), [preview, s.doc]);
  const diffNames = useMemo(() => {
    if (!diff || diff.identical) return '';
    const list = [
      ...diff.addedNames.map((name) => `+ ${name}`),
      ...diff.removedNames.map((name) => `- ${name}`),
      ...diff.changedNames.map((name) => `~ ${name}`),
    ];
    return list.slice(0, 4).join(' · ') + (list.length > 4 ? ` · 还有 ${list.length - 4} 个` : '');
  }, [diff]);
  const busy = creating || restoring;

  async function saveNow() {
    if (!projectId) return;
    setCreating(true);
    setListError(null);
    editor.setSaveState('saving');
    try {
      await saveProject(projectId, s.doc, false);
      editor.setSaveState('saved');
      const entry = await createSnapshot(projectId);
      const list = await listSnapshots(projectId);
      setSnapshots(list);
      setSelected(entry.timestamp);
    } catch (e) {
      editor.setSaveState('error');
      setListError(`保存版本失败：${errorText(e)}`);
    } finally {
      setCreating(false);
    }
  }

  async function restore() {
    if (!projectId || selected === null) return;
    setRestoring(true);
    setListError(null);
    editor.setSaveState('saving');
    try {
      // 先把内存里的最新改动落盘，再由 Rust 在恢复前把这份 scene 留底；
      // 否则用户刚改完就恢复，未落盘的改动不会进入“恢复前版本”。
      await saveProject(projectId, s.doc, false);
      const doc = await restoreSnapshot(projectId, selected);
      editor.loadDoc(doc, projectId);
      onClose();
    } catch (e) {
      editor.setSaveState('error');
      setListError(`恢复失败：${errorText(e)}`);
      setRestoring(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal-card version-card"
        role="dialog"
        aria-modal="true"
        aria-label="版本历史"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="version-head">
          <div>
            <div className="dialog-title">版本历史</div>
            <div className="dialog-sub">自动保存前留快照，重开也能找回；每个工程保留最近 20 个。</div>
          </div>
          <button className="btn btn-quiet version-save" onClick={saveNow} disabled={busy || !projectId}>
            {creating ? '保存中…' : '存一个版本'}
          </button>
        </div>

        <div className="version-body">
          <div className="version-side">
            <div className="version-side-head">
              <span>历史版本</span>
              {snapshots && <span className="version-count">{snapshots.length}</span>}
            </div>
            <div className="version-list" role="listbox" aria-label="历史版本列表">
              {snapshots === null ? (
                <div className="version-empty">正在读取版本…</div>
              ) : snapshots.length === 0 ? (
                <div className="version-empty">
                  <strong>还没有历史版本</strong>
                  <span>第一次自动保存后会在这里出现，也可以先存一个版本。</span>
                </div>
              ) : (
                snapshots.map((entry) => (
                  <button
                    key={entry.timestamp}
                    className={`version-row${selected === entry.timestamp ? ' is-selected' : ''}`}
                    role="option"
                    aria-selected={selected === entry.timestamp}
                    onClick={() => setSelected(entry.timestamp)}
                    disabled={busy}
                  >
                    <span className="version-time">{formatTime(entry.timestamp)}</span>
                    <span className="version-meta">{formatBytes(entry.bytes)}</span>
                  </button>
                ))
              )}
            </div>
            {listError && <div className="version-error">{listError}</div>}
          </div>

          <div className="version-detail">
            {previewLoading ? (
              <div className="version-detail-empty">正在读取这个版本…</div>
            ) : previewError ? (
              <div className="version-detail-empty is-error">{previewError}</div>
            ) : preview && previewPage ? (
              <>
                <div className="version-preview-frame">
                  <SnapshotPreview doc={preview} page={previewPage} />
                </div>
                <div className="version-detail-title">{previewPage.name}</div>
                <div className="version-detail-meta">
                  {preview.pages.length} 页 · {countNodes(preview)} 个图层 · {formatBytes(selected ? snapshots?.find((entry) => entry.timestamp === selected)?.bytes ?? 0 : 0)}
                </div>
                {diff && (
                  <div className={`version-diff${diff.identical ? ' is-same' : ''}`}>
                    <div className="version-diff-sum">相对当前：{diffSummary(diff)}</div>
                    {diffNames && <div className="version-diff-names">{diffNames}</div>}
                  </div>
                )}
                {preview.pages.length > 1 && (
                  <div className="version-pages" aria-label="预览页面">
                    {preview.pages.map((page) => (
                      <button
                        key={page.id}
                        className={`version-page${previewPage.id === page.id ? ' is-selected' : ''}`}
                        onClick={() => setPreviewPageId(page.id)}
                        disabled={busy}
                      >
                        {page.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="version-detail-empty">选择一个版本查看预览</div>
            )}
          </div>
        </div>

        <div className="version-actions">
          <div className="version-action-note">
            {confirming ? (
              <span className="version-warn">恢复会用这个版本替换当前场景；恢复前的状态会先留一份版本。</span>
            ) : (
              <span>预览是只读的，不会改动当前工程。</span>
            )}
          </div>
          <div className="version-action-buttons">
            <button className="btn btn-quiet" onClick={onClose} disabled={busy} autoFocus>
              关闭
            </button>
            {confirming ? (
              <>
                <button className="btn btn-quiet" onClick={() => setConfirming(false)} disabled={busy}>
                  取消
                </button>
                <button className="btn btn-primary" onClick={restore} disabled={busy || !preview}>
                  {restoring ? '恢复中…' : '确认恢复'}
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setConfirming(true)}
                disabled={busy || !preview || selected === null}
              >
                恢复到此版本
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

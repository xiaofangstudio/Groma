import { useEffect, useMemo, useState } from 'react';
import { prototypeHotspots } from '../core/prototype';
import { preloadDocImages } from '../io/images';
import { renderFramePng } from '../render/draw';
import { editor, useEditor } from '../state/editor';

export function PrototypePlayer() {
  const s = useEditor();
  const startId = s.prototypeStartId;
  const [currentId, setCurrentId] = useState(startId);
  const [history, setHistory] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => setCurrentId(startId), [startId]);
  useEffect(() => {
    let alive = true;
    void preloadDocImages(s.doc).then(() => {
      if (alive) setTick((value) => value + 1);
    });
    return () => {
      alive = false;
    };
  }, [s.doc]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        editor.closePrototype();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);

  const frame = currentId ? s.doc.nodes[currentId] : null;
  const image = useMemo(() => {
    if (!frame || frame.type !== 'frame') return null;
    const scale = Math.min(2, Math.max(0.5, 1600 / Math.max(frame.w, frame.h)));
    return renderFramePng(s.doc, frame.id, scale, false);
  }, [frame, s.doc, tick]);
  const hotspots = useMemo(() => (frame ? prototypeHotspots(s.doc, frame.id) : []), [frame, s.doc]);

  if (!frame || frame.type !== 'frame') return null;

  const navigate = (targetId: string) => {
    const target = s.doc.nodes[targetId];
    if (!target || target.type !== 'frame' || target.id === frame.id) return;
    setHistory((items) => [...items, frame.id]);
    setCurrentId(target.id);
  };

  return (
    <div className="proto-backdrop" role="dialog" aria-modal="true" aria-label="原型演示">
      <div className="proto-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="proto-bar">
          <button
            type="button"
            className="proto-icon-btn"
            title="返回上一屏"
            aria-label="返回上一屏"
            disabled={history.length === 0}
            onClick={() => {
              const previous = history[history.length - 1];
              if (!previous) return;
              setHistory((items) => items.slice(0, -1));
              setCurrentId(previous);
            }}
          >
            ←
          </button>
          <span className="proto-name">{frame.name}</span>
          <span className="proto-count">{hotspots.length} 个热区</span>
          <button type="button" className="proto-close" title="关闭演示" aria-label="关闭演示" onClick={() => editor.closePrototype()}>
            ×
          </button>
        </div>
        <div className="proto-stage">
          <div
            className="proto-frame"
            style={{
              aspectRatio: `${frame.w} / ${frame.h}`,
              width: `min(92vw, 1400px, ${(84 * frame.w) / frame.h}vh)`,
            }}
          >
            {image ? (
              <img src={image.dataUrl} alt={frame.name} draggable={false} />
            ) : (
              <div className="proto-error">画板渲染失败</div>
            )}
            {hotspots.map(({ node, targetId, rect }) => {
              const target = s.doc.nodes[targetId];
              const ok = Boolean(target?.type === 'frame');
              return (
                <button
                  key={node.id}
                  type="button"
                  className="proto-hotspot"
                  title={ok ? `跳转到 ${target.name}` : '目标画板已失效'}
                  aria-label={ok ? `跳转到 ${target.name}` : '目标画板已失效'}
                  disabled={!ok}
                  onClick={() => navigate(targetId)}
                  style={{
                    left: `${(rect.x / frame.w) * 100}%`,
                    top: `${(rect.y / frame.h) * 100}%`,
                    width: `${(rect.w / frame.w) * 100}%`,
                    height: `${(rect.h / frame.h) * 100}%`,
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="proto-hint">点击蓝色虚线热区跳转 · Esc 退出 · 返回键逐步回退</div>
      </div>
    </div>
  );
}

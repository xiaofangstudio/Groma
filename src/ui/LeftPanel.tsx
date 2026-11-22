import { useEffect, useState } from 'react';
import { editor, useEditor } from '../state/editor';
import { childrenOf } from '../core/doc';
import type { GromaDoc, SceneNode } from '../core/types';
import {
  IconChevronLeft,
  IconChevronRight,
  IconEllipse,
  IconEye,
  IconEyeOff,
  IconFrame,
  IconGroup,
  IconLock,
  IconPage,
  IconRect,
  IconText,
  IconUnlock,
} from './icons';

function NodeIcon({ type }: { type: SceneNode['type'] }) {
  if (type === 'frame') return <IconFrame size={14} />;
  if (type === 'rect') return <IconRect size={14} />;
  if (type === 'ellipse') return <IconEllipse size={14} />;
  if (type === 'text') return <IconText size={14} />;
  if (type === 'group') return <IconGroup size={14} />;
  return <IconPage size={14} />;
}

function LayerNode({
  node,
  depth,
  doc,
  selectedIds,
  dimmed,
  expanded,
  onToggle,
}: {
  node: SceneNode;
  depth: number;
  doc: GromaDoc;
  selectedIds: Set<string>;
  dimmed: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const children = childrenOf(doc, node.id);
  const dim = dimmed || !node.visible;
  const open = expanded.has(node.id);
  const selected = selectedIds.has(node.id);

  return (
    <>
      <div
        className={`layer-row${selected ? ' is-selected' : ''}${dim ? ' is-hidden' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={(e) => editor.select(node.id, e.shiftKey)}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-expanded={children.length > 0 ? open : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            editor.select(node.id);
          }
        }}
      >
        <button
          className={`layer-caret${children.length === 0 ? ' is-empty' : ''}${open ? ' is-open' : ''}`}
          title={children.length === 0 ? '' : open ? '折叠图层' : '展开图层'}
          aria-label={children.length === 0 ? '' : open ? '折叠图层' : '展开图层'}
          tabIndex={children.length === 0 ? -1 : 0}
          onClick={(e) => {
            e.stopPropagation();
            if (children.length > 0) onToggle(node.id);
          }}
        >
          {children.length > 0 && <IconChevronRight size={11} />}
        </button>
        <NodeIcon type={node.type} />
        <span className="layer-name" title={node.name}>{node.name}</span>
        <span className="layer-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className={`layer-act${node.visible ? '' : ' is-on'}`}
            title={node.visible ? '隐藏' : '显示'}
            aria-label={node.visible ? '隐藏' : '显示'}
            onClick={() => editor.applyPatch(node.id, { visible: !node.visible })}
          >
            {node.visible ? <IconEye size={13} /> : <IconEyeOff size={13} />}
          </button>
          <button
            className={`layer-act${node.locked ? ' is-on' : ''}`}
            title={node.locked ? '解锁' : '锁定'}
            aria-label={node.locked ? '解锁' : '锁定'}
            onClick={() => editor.applyPatch(node.id, { locked: !node.locked })}
          >
            {node.locked ? <IconLock size={13} /> : <IconUnlock size={13} />}
          </button>
        </span>
      </div>
      {open && children.map((child) => (
        <LayerNode
          key={child.id}
          node={child}
          depth={depth + 1}
          doc={doc}
          selectedIds={selectedIds}
          dimmed={dim}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

export function LeftPanel() {
  const s = useEditor();
  const page = s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
  const root = s.doc.nodes[page.rootId];
  const top = root ? childrenOf(s.doc, root.id) : [];
  const frames = top.filter((n) => n.type === 'frame');
  const total = Object.keys(s.doc.nodes).length - 1;
  const selectedIds = new Set(s.selectedIds);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // 选中画布里的深层节点时，展开所有选中节点到当前页面的祖先路径。
  useEffect(() => {
    if (s.selectedIds.length === 0) return;
    const ids: string[] = [];
    for (const selectedId of s.selectedIds) {
      let cursor = s.doc.nodes[selectedId]?.parentId;
      while (cursor) {
        const node = s.doc.nodes[cursor];
        if (!node || node.type === 'page') break;
        ids.push(cursor);
        cursor = node.parentId;
      }
    }
    if (ids.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [s.selectedIds]);

  const toggleLayer = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!s.leftOpen) {
    return (
      <aside className="panel-rail panel-rail-left">
        <button className="rail-btn" title="展开图层面板" aria-label="展开图层面板" onClick={() => editor.toggleLeft()}>
          <IconChevronRight size={14} />
        </button>
        <span className="rail-label">图层</span>
        <IconFrame size={14} />
      </aside>
    );
  }

  return (
    <aside className="left-panel">
      <div className="panel-head">
        <span className="panel-title">图层</span>
        <button className="icon-btn" title="收起图层面板" aria-label="收起图层面板" onClick={() => editor.toggleLeft()}>
          <IconChevronLeft size={14} />
        </button>
      </div>

      <div className="layer-scroll">
        <button
          className={`layer-page${selectedIds.has(root?.id ?? '') ? ' is-selected' : ''}`}
          onClick={() => editor.select(root?.id ?? null)}
        >
          <IconPage size={14} />
          <span className="layer-name">页面 1</span>
          <span className="layer-count">{top.length}</span>
        </button>

        {top.map((node) => (
          <LayerNode
            key={node.id}
            node={node}
            depth={0}
            doc={s.doc}
            selectedIds={selectedIds}
            dimmed={false}
            expanded={expanded}
            onToggle={toggleLayer}
          />
        ))}

        {top.length === 0 && <div className="layer-empty">这一页还没有画板</div>}
      </div>

      <div className="panel-foot">
        <span>{frames.length} 个画板</span>
        <span className="panel-foot-dim">{total} 个图层</span>
      </div>
    </aside>
  );
}

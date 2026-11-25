import { useEffect, useMemo, useRef, useState } from 'react';
import { editor, useEditor } from '../state/editor';
import { childrenOf, countArtboards } from '../core/doc';
import { searchPageNodes, type NodeSearchHit } from '../core/search';
import type { GromaDoc, NodeType, Page, SceneNode } from '../core/types';
import { PageThumbnail } from './PageThumbnail';
import {
  IconChevronLeft,
  IconChevronRight,
  IconEllipse,
  IconEye,
  IconEyeOff,
  IconFrame,
  IconGroup,
  IconImage,
  IconLock,
  IconMore,
  IconPage,
  IconPath,
  IconPen,
  IconPlus,
  IconRect,
  IconSearch,
  IconSection,
  IconSlice,
  IconText,
  IconUnlock,
} from './icons';

function NodeIcon({ node, type }: { node?: SceneNode; type?: NodeType }) {
  const kind = node?.type ?? type;
  if (kind === 'frame') return <IconFrame size={14} />;
  if (kind === 'section') return <IconSection size={14} />;
  if (kind === 'rect') return <IconRect size={14} />;
  if (kind === 'ellipse') return <IconEllipse size={14} />;
  if (kind === 'text') return <IconText size={14} />;
  if (kind === 'path') return (node?.pathAnchors?.length ?? 0) > 0 ? <IconPen size={14} /> : <IconPath size={14} />;
  if (kind === 'image') return <IconImage size={14} />;
  if (kind === 'group') return <IconGroup size={14} />;
  if (kind === 'slice') return <IconSlice size={14} />;
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
        <NodeIcon node={node} />
        <span className="layer-name" title={node.name}>{node.name}</span>
        {node.isMask && <span className="mask-chip">蒙版</span>}
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

function countType(doc: GromaDoc, id: string, type: SceneNode['type']): number {
  const node = doc.nodes[id];
  if (!node) return 0;
  let total = node.type === type ? 1 : 0;
  for (const childId of node.children) total += countType(doc, childId, type);
  return total;
}

export function LeftPanel() {
  const s = useEditor();
  const page = s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
  const root = s.doc.nodes[page.rootId];
  const top = root ? childrenOf(s.doc, root.id) : [];
  const frameCount = countType(s.doc, page.rootId, 'frame');
  const sectionCount = countType(s.doc, page.rootId, 'section');
  const total = Object.keys(s.doc.nodes).length - s.doc.pages.length;
  const selectedIds = new Set(s.selectedIds);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [menu, setMenu] = useState<{ pageId: string; x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropLine, setDropLine] = useState<{ y: number; left: number; width: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const pageRows = useRef(new Map<string, HTMLDivElement>());
  const pageListRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef<string | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchPopRef = useRef<HTMLDivElement>(null);
  const cancelRenameRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const searchResults = useMemo(
    () => (searchOpen ? searchPageNodes(s.doc, searchQuery, 30) : []),
    [searchOpen, searchQuery, s.doc],
  );
  const queryActive = searchQuery.trim().length > 0;

  function focusPage(pageId: string) {
    requestAnimationFrame(() => pageRows.current.get(pageId)?.focus());
  }

  function openSearch() {
    setMenu(null);
    setSearchOpen(true);
  }

  function closeSearch(restoreFocus = true) {
    setSearchOpen(false);
    setSearchQuery('');
    if (restoreFocus) requestAnimationFrame(() => searchButtonRef.current?.focus());
  }

  function goToSearchHit(hit: NodeSearchHit) {
    setSearchOpen(false);
    setSearchQuery('');
    if (hit.pageId !== s.pageId) editor.setPage(hit.pageId);
    editor.select(hit.nodeId);
    focusPage(hit.pageId);
  }

  function beginRename(target: Page) {
    cancelRenameRef.current = false;
    setRenameId(target.id);
    setRenameDraft(target.name);
    setMenu(null);
  }

  function finishRename(restoreFocus = false) {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      return;
    }
    if (!renameId) return;
    editor.renamePage(renameId, renameDraft);
    const id = renameId;
    setRenameId(null);
    setRenameDraft('');
    if (restoreFocus) focusPage(id);
  }

  function cancelRename() {
    cancelRenameRef.current = true;
    const id = renameId;
    setRenameId(null);
    setRenameDraft('');
    if (id) focusPage(id);
  }

  function openMenu(pageId: string, x: number, y: number) {
    setSearchOpen(false);
    const width = 156;
    const height = 160;
    setMenu({
      pageId,
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }

  function openMenuFromButton(e: React.MouseEvent<HTMLButtonElement>, pageId: string) {
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    openMenu(pageId, rect.right - 4, rect.bottom + 4);
  }

  function beginPageDrag(item: Page, e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || renameId || s.doc.pages.length < 2) return;
    if (e.target instanceof Element && e.target.closest('button, input')) return;
    dragCleanupRef.current?.();

    const list = pageListRef.current;
    if (!list) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const order = s.doc.pages.map((page) => page.id);
    let active = false;
    let target: number | null = null;

    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (dragCleanupRef.current === detach) dragCleanupRef.current = null;
    };

    const cleanup = () => {
      detach();
      setDraggingId(null);
      setDropLine(null);
    };

    const onMove = (event: PointerEvent) => {
      if (!active) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) < 5) return;
        active = true;
        setDraggingId(item.id);
      }
      const rect = list.getBoundingClientRect();
      if (event.clientY < rect.top + 18) list.scrollTop -= 8;
      else if (event.clientY > rect.bottom - 18) list.scrollTop += 8;

      const others = order.filter((id) => id !== item.id);
      let nextTarget = others.length;
      let lineY = rect.top;
      for (let i = 0; i < others.length; i += 1) {
        const row = pageRows.current.get(others[i]);
        if (!row) continue;
        const rowRect = row.getBoundingClientRect();
        if (event.clientY < rowRect.top + rowRect.height / 2) {
          nextTarget = i;
          lineY = rowRect.top;
          break;
        }
        lineY = rowRect.bottom;
      }
      target = nextTarget;
      setDropLine({
        y: lineY,
        left: rect.left + 8,
        width: Math.max(48, rect.width - 16),
      });
    };

    const onUp = () => {
      const from = order.indexOf(item.id);
      const to = target;
      cleanup();
      if (!active || to === null || from < 0 || to === from) return;
      if (!editor.movePage(item.id, to)) return;
      suppressClickRef.current = item.id;
      window.setTimeout(() => {
        if (suppressClickRef.current === item.id) suppressClickRef.current = null;
      }, 0);
    };

    const onCancel = () => cleanup();
    dragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

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

  useEffect(() => {
    if (!renameId) return;
    renameInput.current?.focus();
    renameInput.current?.select();
  }, [renameId]);

  useEffect(() => {
    const row = pageRows.current.get(s.pageId);
    row?.scrollIntoView({ block: 'nearest' });
  }, [s.pageId]);

  useEffect(() => {
    if (!searchOpen) return;
    const input = searchInput.current;
    input?.focus();
    input?.select();
  }, [searchOpen]);

  useEffect(() => {
    if (!s.leftOpen && searchOpen) setSearchOpen(false);
  }, [s.leftOpen, searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return;
      if (searchPopRef.current?.contains(e.target) || searchButtonRef.current?.contains(e.target)) return;
      closeSearch(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeSearch(true);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [searchOpen]);

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'f') return;
      e.preventDefault();
      if (!s.leftOpen) editor.toggleLeft();
      setMenu(null);
      setSearchOpen(true);
      requestAnimationFrame(() => {
        searchInput.current?.focus();
        searchInput.current?.select();
      });
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [s.leftOpen]);

  useEffect(() => () => dragCleanupRef.current?.(), []);

  useEffect(() => {
    if (!menu) return;
    const menuEl = menuRef.current;
    menuEl?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      const pageId = menu.pageId;
      setMenu(null);
      focusPage(pageId);
    };
    const onResize = () => setMenu(null);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [menu]);

  const toggleLayer = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const menuPage = menu ? s.doc.pages.find((p) => p.id === menu.pageId) : null;

  if (!s.leftOpen) {
    return (
      <aside className="panel-rail panel-rail-left">
        <button className="rail-btn" title="展开页面与图层面板" aria-label="展开页面与图层面板" onClick={() => editor.toggleLeft()}>
          <IconChevronRight size={14} />
        </button>
        <span className="rail-label">页面</span>
        <IconFrame size={14} />
      </aside>
    );
  }

  return (
    <aside className="left-panel">
      <div className="panel-head">
        <span className="panel-title">页面</span>
        <span className="page-total">{s.doc.pages.length}</span>
        <div className="panel-head-actions">
          <button
            ref={searchButtonRef}
            className={`icon-btn${searchOpen ? ' is-active' : ''}`}
            title="搜索图层（Ctrl+F）"
            aria-label="搜索图层"
            aria-expanded={searchOpen}
            onClick={() => (searchOpen ? closeSearch(true) : openSearch())}
          >
            <IconSearch size={14} />
          </button>
          <button
            className="icon-btn"
            title="新建页面"
            aria-label="新建页面"
            onClick={() => {
              const id = editor.addPage();
              focusPage(id);
            }}
          >
            <IconPlus size={14} />
          </button>
          <button className="icon-btn" title="收起图层面板" aria-label="收起图层面板" onClick={() => editor.toggleLeft()}>
            <IconChevronLeft size={14} />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div
          ref={searchPopRef}
          className="page-search"
          role="dialog"
          aria-label="跨页面图层搜索"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closeSearch(true);
            }
          }}
        >
          <div className="page-search-head">
            <IconSearch size={13} />
            <input
              ref={searchInput}
              className="page-search-input"
              value={searchQuery}
              placeholder="搜索图层名"
              aria-label="搜索图层名"
              spellCheck={false}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="page-search-results" role="listbox" aria-label="搜索结果">
            {!queryActive ? (
              <div className="page-search-hint">输入图层名称，跨页面查找</div>
            ) : searchResults.length === 0 ? (
              <div className="page-search-hint">没有匹配的图层</div>
            ) : (
              searchResults.map((hit) => (
                <button
                  key={`${hit.pageId}:${hit.nodeId}`}
                  className="page-search-row"
                  role="option"
                  aria-selected={hit.pageId === s.pageId && hit.nodeId === s.selectedId}
                  title={`${hit.pageName} / ${hit.path} / ${hit.nodeName}`}
                  onClick={() => goToSearchHit(hit)}
                >
                  <NodeIcon type={hit.nodeType} />
                  <span className="page-search-main">
                    <span className="page-search-name">{hit.nodeName}</span>
                    <span className="page-search-path">{hit.path}</span>
                  </span>
                  <span className="page-search-page">{hit.pageName}</span>
                </button>
              ))
            )}
          </div>
          <div className="page-search-foot">
            {queryActive ? <span>{searchResults.length} 个结果</span> : <span>跨页面</span>}
            <span className="page-search-kbd">
              <kbd>Esc</kbd> 关闭
            </span>
          </div>
        </div>
      )}

      <div
        ref={pageListRef}
        className={`page-list${draggingId ? ' is-dragging' : ''}`}
        aria-label="页面列表"
      >
        {s.doc.pages.map((item, pageIndex) => {
          const current = item.id === s.pageId;
          const count = countArtboards(s.doc, item.rootId);
          const editing = renameId === item.id;
          return (
            <div
              key={item.id}
              className={`page-row${current ? ' is-current' : ''}${draggingId === item.id ? ' is-dragging' : ''}`}
              role="button"
              tabIndex={editing ? -1 : 0}
              aria-current={current ? 'page' : undefined}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              data-page-id={item.id}
              ref={(node) => {
                if (node) pageRows.current.set(item.id, node);
                else pageRows.current.delete(item.id);
              }}
              onPointerDown={(e) => beginPageDrag(item, e)}
              onClick={() => {
                if (suppressClickRef.current === item.id) {
                  suppressClickRef.current = null;
                  return;
                }
                if (!editing) editor.setPage(item.id);
              }}
              onDoubleClick={() => {
                if (!editing) beginRename(item);
              }}
              onContextMenu={(e) => {
                if (editing) return;
                e.preventDefault();
                openMenu(item.id, e.clientX, e.clientY);
              }}
              onKeyDown={(e) => {
                if (editing) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  editor.setPage(item.id);
                } else if (e.key === 'F2') {
                  e.preventDefault();
                  beginRename(item);
                } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                  e.preventDefault();
                  e.stopPropagation();
                  const id = editor.duplicatePage(item.id);
                  if (id) focusPage(id);
                } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                  e.preventDefault();
                  const index = s.doc.pages.findIndex((page) => page.id === item.id);
                  const to = e.key === 'ArrowUp' ? index - 1 : index + 1;
                  if (to < 0 || to >= s.doc.pages.length) return;
                  if (editor.movePage(item.id, to)) focusPage(item.id);
                } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  openMenu(item.id, rect.left + 12, rect.bottom + 4);
                }
              }}
            >
              <PageThumbnail doc={s.doc} page={item} active={current} index={pageIndex} />
              {editing ? (
                <input
                  ref={renameInput}
                  className="page-rename"
                  value={renameDraft}
                  maxLength={80}
                  aria-label="页面名称"
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => finishRename(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      finishRename(true);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                />
              ) : (
                <span className="page-name" title={item.name}>
                  {item.name}
                </span>
              )}
              <span className="page-count">{count}</span>
              {!editing && (
                <button
                  className="page-menu-btn"
                  title="页面操作"
                  aria-label={`${item.name} 页面操作`}
                  aria-haspopup="menu"
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => openMenuFromButton(e, item.id)}
                >
                  <IconMore size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {dropLine && (
        <div
          className="page-drop-line"
          style={{ top: dropLine.y, left: dropLine.left, width: dropLine.width }}
          aria-hidden="true"
        />
      )}

      <div className="layer-head">
        <span>图层</span>
        <span className="layer-head-count">{top.length} 个顶层</span>
      </div>

      <div className="layer-scroll">
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

        {top.length === 0 && <div className="layer-empty">这一页还没有图层</div>}
      </div>

      <div className="panel-foot">
        <span>
          {frameCount} 个画板{sectionCount > 0 ? ` · ${sectionCount} 个区块` : ''}
        </span>
        <span className="panel-foot-dim">{total} 个图层</span>
      </div>

      {menu && menuPage && (
        <div
          ref={menuRef}
          className="page-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          aria-label={`${menuPage.name} 页面操作`}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            const pageId = menuPage.id;
            setMenu(null);
            focusPage(pageId);
          }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              beginRename(menuPage);
            }}
          >
            重命名<span className="page-menu-key">F2</span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              const id = editor.duplicatePage(menuPage.id);
              if (id) focusPage(id);
            }}
          >
            复制页面<span className="page-menu-key">Ctrl+D</span>
          </button>
          <button
            role="menuitem"
            className="is-danger"
            disabled={s.doc.pages.length <= 1}
            title={s.doc.pages.length <= 1 ? '至少保留一个页面' : '删除这个页面'}
            onClick={() => {
              if (s.doc.pages.length <= 1) return;
              setMenu(null);
              const pageIndex = s.doc.pages.findIndex((page) => page.id === menuPage.id);
              const focusId =
                menuPage.id === s.pageId
                  ? s.doc.pages[pageIndex + 1]?.id ?? s.doc.pages[pageIndex - 1]?.id ?? null
                  : s.pageId;
              editor.deletePage(menuPage.id);
              if (focusId) focusPage(focusId);
            }}
          >
            删除页面
          </button>
          {s.doc.pages.length <= 1 && <div className="page-menu-note">至少保留一个页面</div>}
        </div>
      )}
    </aside>
  );
}

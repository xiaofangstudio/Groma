import { useEffect, useRef, useState } from 'react';
import { editor, useEditor } from '../state/editor';
import type { SceneNode } from '../core/types';
import { absolutePosition, absoluteRect, selectionBounds, topLevelSelection } from '../core/geometry';
import {
  IconAlignBottom,
  IconAlignHCenter,
  IconAlignLeft,
  IconAlignRight,
  IconAlignTop,
  IconAlignVCenter,
  IconChevronLeft,
  IconChevronRight,
  IconDistributeH,
  IconDistributeV,
  IconEllipse,
  IconFrame,
  IconGroup,
  IconPage,
  IconRect,
  IconText,
  IconUngroup,
} from './icons';

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

interface NumFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onCommit: (n: number) => void;
}

function NumField({ label, value, min = -1e6, max = 1e6, disabled, onCommit }: NumFieldProps) {
  const [draft, setDraft] = useState(fmt(value));
  const skip = useRef(false);

  useEffect(() => {
    setDraft(fmt(value));
  }, [value]);

  function commit(raw: string) {
    if (skip.current) {
      skip.current = false;
      setDraft(fmt(value));
      return;
    }
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n)) {
      setDraft(fmt(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(fmt(clamped));
    if (clamped !== value) onCommit(clamped);
  }

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            skip.current = true;
            setDraft(fmt(value));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function normalizeHex(raw: string): string | null {
  let h = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return `#${h.toUpperCase()}`;
}

function ColorField({ color, disabled, onCommit }: { color: string; disabled?: boolean; onCommit: (hex: string) => void }) {
  const [draft, setDraft] = useState(color.toUpperCase());
  useEffect(() => setDraft(color.toUpperCase()), [color]);

  function commit(raw: string) {
    const hex = normalizeHex(raw);
    if (!hex) {
      setDraft(color.toUpperCase());
      return;
    }
    setDraft(hex);
    if (hex !== color.toUpperCase()) onCommit(hex);
  }

  return (
    <div className="color-field">
      <input
        type="color"
        className="color-swatch"
        value={normalizeHex(draft) ?? '#FFFFFF'}
        disabled={disabled}
        aria-label="填充颜色"
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onBlur={(e) => commit(e.target.value)}
      />
      <input
        className="field-input hex-input"
        value={draft}
        disabled={disabled}
        spellCheck={false}
        aria-label="填充色值"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(color.toUpperCase());
            e.currentTarget.blur();
          }
        }}
      />
      <span className="color-alpha">100%</span>
    </div>
  );
}

function TextField({ value, disabled, onCommit }: { value: string; disabled?: boolean; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState(value);
  const skip = useRef(false);
  useEffect(() => setDraft(value), [value]);

  return (
    <textarea
      className="text-field"
      id="text-editor"
      value={draft}
      disabled={disabled}
      spellCheck={false}
      rows={3}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (skip.current) {
          skip.current = false;
          setDraft(value);
          return;
        }
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          skip.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function typeLabel(type: SceneNode['type']): string {
  if (type === 'frame') return '画板';
  if (type === 'rect') return '矩形';
  if (type === 'ellipse') return '椭圆';
  if (type === 'text') return '文本';
  if (type === 'group') return '分组';
  return '节点';
}

function TypeIcon({ type, size = 14 }: { type: SceneNode['type']; size?: number }) {
  if (type === 'frame') return <IconFrame size={size} />;
  if (type === 'rect') return <IconRect size={size} />;
  if (type === 'ellipse') return <IconEllipse size={size} />;
  if (type === 'text') return <IconText size={size} />;
  if (type === 'group') return <IconGroup size={size} />;
  return <IconPage size={size} />;
}

function NameField({ node }: { node: SceneNode }) {
  const [draft, setDraft] = useState(node.name);
  const skip = useRef(false);

  useEffect(() => setDraft(node.name), [node.name]);

  function commit() {
    if (skip.current) {
      skip.current = false;
      setDraft(node.name);
      return;
    }
    const next = draft.trim().slice(0, 40);
    if (!next) {
      setDraft(node.name);
      return;
    }
    if (next !== node.name) editor.applyPatch(node.id, { name: next });
  }

  return (
    <input
      className="inspector-name-input"
      value={draft}
      spellCheck={false}
      aria-label="图层名称"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          skip.current = true;
          setDraft(node.name);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function FrameInspector({ node }: { node: SceneNode }) {
  const fill = node.fills[0];

  return (
    <>
      <div className="inspector-sel">
        <IconFrame size={14} />
        <NameField node={node} />
        <span className="type-chip">画板</span>
      </div>

      <section className="ins-section">
        <h3 className="ins-title">对齐与变换</h3>
        <div className="field-grid">
          <NumField label="X" value={node.x} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { x: n })} />
          <NumField label="Y" value={node.y} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { y: n })} />
          <NumField label="W" value={node.w} min={1} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { w: n })} />
          <NumField label="H" value={node.h} min={1} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { h: n })} />
        </div>
      </section>

      <section className="ins-section">
        <h3 className="ins-title">圆角与透明度</h3>
        <div className="field-grid">
          <NumField label="圆角" value={node.cornerRadius} min={0} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { cornerRadius: n })} />
          <NumField
            label="透明"
            value={Math.round(node.opacity * 100)}
            min={0}
            max={100}
            disabled={node.locked}
            onCommit={(n) => editor.applyPatch(node.id, { opacity: n / 100 })}
          />
        </div>
      </section>

      <section className="ins-section">
        <h3 className="ins-title">填充</h3>
        <ColorField
          color={fill?.color ?? '#FFFFFF'}
          disabled={node.locked}
          onCommit={(hex) =>
            editor.applyPatch(node.id, {
              fills: [{ type: 'solid', color: hex, opacity: fill?.opacity ?? 1 }],
            })
          }
        />
        <Row label="混合" value="正常" />
      </section>

      <div className="ins-hint">{node.locked ? '画板已锁定，属性编辑已停用' : 'Ctrl+Z 撤销 · Shift+1 适应画板'}</div>
    </>
  );
}

function ShapeInspector({ node }: { node: SceneNode }) {
  const fill = node.fills[0];
  const isText = node.type === 'text';
  const isRect = node.type === 'rect';

  return (
    <>
      <div className="inspector-sel">
        <TypeIcon type={node.type} />
        <NameField node={node} />
        <span className="type-chip">{typeLabel(node.type)}</span>
      </div>

      <section className="ins-section">
        <h3 className="ins-title">对齐与变换</h3>
        <div className="field-grid">
          <NumField label="X" value={node.x} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { x: n })} />
          <NumField label="Y" value={node.y} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { y: n })} />
          <NumField label="W" value={node.w} min={1} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { w: n })} />
          <NumField label="H" value={node.h} min={1} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { h: n })} />
        </div>
      </section>

      {isText && (
        <section className="ins-section">
          <h3 className="ins-title">文本</h3>
          <TextField
            value={node.text ?? '文本'}
            disabled={node.locked}
            onCommit={(text) => editor.applyPatch(node.id, { text })}
          />
          <div className="field-grid text-meta">
            <NumField
              label="字号"
              value={node.fontSize ?? 24}
              min={4}
              max={512}
              disabled={node.locked}
              onCommit={(n) => editor.applyPatch(node.id, { fontSize: n })}
            />
            <NumField
              label="字重"
              value={node.fontWeight ?? 600}
              min={100}
              max={900}
              disabled={node.locked}
              onCommit={(n) => editor.applyPatch(node.id, { fontWeight: n })}
            />
          </div>
        </section>
      )}

      <section className="ins-section">
        <h3 className="ins-title">填充</h3>
        <ColorField
          color={fill?.color ?? (isText ? '#221C00' : '#D9D9D9')}
          disabled={node.locked}
          onCommit={(hex) =>
            editor.applyPatch(node.id, {
              fills: [{ type: 'solid', color: hex, opacity: fill?.opacity ?? 1 }],
            })
          }
        />
      </section>

      <section className="ins-section">
        <h3 className="ins-title">外观</h3>
        <div className="field-grid">
          {isRect && (
            <NumField
              label="圆角"
              value={node.cornerRadius}
              min={0}
              max={100000}
              disabled={node.locked}
              onCommit={(n) => editor.applyPatch(node.id, { cornerRadius: n })}
            />
          )}
          <NumField
            label="透明"
            value={Math.round(node.opacity * 100)}
            min={0}
            max={100}
            disabled={node.locked}
            onCommit={(n) => editor.applyPatch(node.id, { opacity: n / 100 })}
          />
        </div>
      </section>

      <div className="ins-hint">{node.locked ? '节点已锁定，属性编辑已停用' : '拖动移动 · 角点缩放 · Delete 删除'}</div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="ins-row">
      <span className="ins-row-label">{label}</span>
      <span className="ins-row-value">{value}</span>
    </div>
  );
}

const ALIGN_ACTIONS = [
  { mode: 'left', label: '左对齐', icon: <IconAlignLeft size={15} /> },
  { mode: 'hcenter', label: '水平居中', icon: <IconAlignHCenter size={15} /> },
  { mode: 'right', label: '右对齐', icon: <IconAlignRight size={15} /> },
  { mode: 'top', label: '顶部对齐', icon: <IconAlignTop size={15} /> },
  { mode: 'vcenter', label: '垂直居中', icon: <IconAlignVCenter size={15} /> },
  { mode: 'bottom', label: '底部对齐', icon: <IconAlignBottom size={15} /> },
] as const;

function MultiInspector({ ids }: { ids: string[] }) {
  const s = useEditor();
  const top = topLevelSelection(s.doc, ids);
  const bounds = selectionBounds(s.doc, ids);
  const parentId = top.length > 0 ? s.doc.nodes[top[0]]?.parentId : null;
  const canGroup =
    top.length >= 2 &&
    Boolean(parentId) &&
    top.every((id) => {
      const node = s.doc.nodes[id];
      return Boolean(node && node.type !== 'page' && !node.locked && node.parentId === parentId);
    });

  return (
    <>
      <div className="inspector-sel">
        <IconGroup size={14} />
        <span className="inspector-name">已选择 {ids.length} 个图层</span>
        <span className="type-chip">多选</span>
      </div>

      <section className="ins-section">
        <h3 className="ins-title">选区</h3>
        <div className="selection-metrics">
          <div>
            <span>W</span>
            <b>{bounds ? fmt(bounds.w) : '—'}</b>
          </div>
          <div>
            <span>H</span>
            <b>{bounds ? fmt(bounds.h) : '—'}</b>
          </div>
          <div>
            <span>X</span>
            <b>{bounds ? fmt(bounds.x) : '—'}</b>
          </div>
          <div>
            <span>Y</span>
            <b>{bounds ? fmt(bounds.y) : '—'}</b>
          </div>
        </div>
      </section>

      <section className="ins-section">
        <h3 className="ins-title">对齐</h3>
        <div className="align-grid">
          {ALIGN_ACTIONS.map((action) => (
            <button
              key={action.mode}
              className="align-btn"
              title={action.label}
              aria-label={action.label}
              disabled={top.length < 2}
              onClick={() => editor.alignSelection(action.mode)}
            >
              {action.icon}
            </button>
          ))}
        </div>
        <div className="align-grid align-grid-distribute">
          <button
            className="align-btn"
            title={top.length < 3 ? '至少选择 3 个图层才能等间距' : '水平等间距'}
            aria-label="水平等间距"
            disabled={top.length < 3}
            onClick={() => editor.distributeSelection('horizontal')}
          >
            <IconDistributeH size={15} />
          </button>
          <button
            className="align-btn"
            title={top.length < 3 ? '至少选择 3 个图层才能等间距' : '垂直等间距'}
            aria-label="垂直等间距"
            disabled={top.length < 3}
            onClick={() => editor.distributeSelection('vertical')}
          >
            <IconDistributeV size={15} />
          </button>
        </div>
        <p className="ins-note">对齐按选区外接框计算；分布至少需要 3 个图层。</p>
      </section>

      <section className="ins-section">
        <h3 className="ins-title">整理</h3>
        <button
          className="wide-action"
          disabled={!canGroup}
          title={canGroup ? '成组（Ctrl+G）' : '需选择同一父级的至少 2 个未锁定图层'}
          onClick={() => editor.groupSelected()}
        >
          <IconGroup size={15} />
          <span>成组</span>
          <kbd>Ctrl+G</kbd>
        </button>
      </section>

      <div className="ins-hint">Shift 点击追加或取消 · 拖动一起移动 · Esc 取消选择</div>
    </>
  );
}

function GroupInspector({ node }: { node: SceneNode }) {
  const s = useEditor();
  const childCount = node.children.length;
  const abs = absoluteRect(s.doc, node.id);
  const parentAbs = node.parentId ? absolutePosition(s.doc, node.parentId) : { x: 0, y: 0 };
  const displayX = abs.x - parentAbs.x;
  const displayY = abs.y - parentAbs.y;

  return (
    <>
      <div className="inspector-sel">
        <IconGroup size={14} />
        <NameField node={node} />
        <span className="type-chip">分组</span>
      </div>

      <section className="ins-section">
        <h3 className="ins-title">对齐与变换</h3>
        <div className="field-grid">
          <NumField
            label="X"
            value={displayX}
            disabled={node.locked}
            onCommit={(n) => editor.applyPatch(node.id, { x: node.x + (n - displayX) })}
          />
          <NumField
            label="Y"
            value={displayY}
            disabled={node.locked}
            onCommit={(n) => editor.applyPatch(node.id, { y: node.y + (n - displayY) })}
          />
        </div>
        <Row label="宽高" value={`${fmt(abs.w)} × ${fmt(abs.h)}`} />
        <Row label="子图层" value={`${childCount} 个`} />
      </section>

      <section className="ins-section">
        <h3 className="ins-title">整理</h3>
        <button className="wide-action" onClick={() => editor.ungroupSelected()}>
          <IconUngroup size={15} />
          <span>解散分组</span>
          <kbd>Ctrl+Shift+G</kbd>
        </button>
      </section>

      <div className="ins-hint">{node.locked ? '分组已锁定，属性编辑已停用' : '拖动分组会一起移动子图层'}</div>
    </>
  );
}


function PageInspector() {
  const s = useEditor();
  const page = s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
  const root = s.doc.nodes[page.rootId];
  const frames = root ? root.children.length : 0;

  return (
    <>
      <div className="inspector-sel">
        <IconPage size={14} />
        <span className="inspector-name">{page.name}</span>
        <span className="type-chip">页面</span>
      </div>

      <section className="ins-section">
        <h3 className="ins-title">页面</h3>
        <Row label="名称" value={page.name} />
        <Row label="画板" value={`${frames} 个`} />
        <div className="page-bg-row">
          <span className="ins-row-label">背景</span>
          <span className="page-bg-swatch" style={{ background: page.background }} />
          <span className="ins-row-value">{page.background}</span>
        </div>
      </section>

      <section className="ins-section">
        <h3 className="ins-title">提示</h3>
        <p className="ins-note">在画布上点选画板，或在上面的图层里选择，可编辑位置、尺寸、圆角、透明度与填充。</p>
      </section>
    </>
  );
}

export function RightPanel() {
  const s = useEditor();
  const node = s.selectedId ? (s.doc.nodes[s.selectedId] ?? null) : null;
  const multiple = s.selectedIds.length > 1;

  if (!s.rightOpen) {
    return (
      <aside className="panel-rail panel-rail-right">
        <button className="rail-btn" title="展开设计面板" aria-label="展开设计面板" onClick={() => editor.toggleRight()}>
          <IconChevronLeft size={14} />
        </button>
        <span className="rail-label">设计</span>
        <IconFrame size={14} />
      </aside>
    );
  }

  return (
    <aside className="right-panel">
      <div className="panel-head">
        <span className="panel-title">设计</span>
        <button className="icon-btn" title="收起设计面板" aria-label="收起设计面板" onClick={() => editor.toggleRight()}>
          <IconChevronRight size={14} />
        </button>
      </div>
      <div className="inspector-scroll">
        {multiple ? (
          <MultiInspector ids={s.selectedIds} />
        ) : !node || node.type === 'page' ? (
          <PageInspector />
        ) : node.type === 'frame' ? (
          <FrameInspector node={node} />
        ) : node.type === 'group' ? (
          <GroupInspector node={node} />
        ) : (
          <ShapeInspector node={node} />
        )}
      </div>
    </aside>
  );
}

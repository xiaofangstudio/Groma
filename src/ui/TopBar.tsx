import { Fragment, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { editor, getState, useEditor, type Tool } from '../state/editor';
import { vectorActionEligibility, type VectorAction } from '../core/boolean';
import { renameProject } from '../io/project';
import { parseSvgDrawing } from '../io/importSvg';
import { applySvgImport } from '../io/applySvgImport';
import { topLevelFrames } from '../core/prototype';
import { importImageAsset, isImageFile } from '../io/images';
import { ExportDialog } from './ExportDialog';
import { VersionHistory } from './VersionHistory';
import { VariablesDialog } from './VariablesDialog';
import {
  IconCursor,
  IconComponent,
  IconEllipse,
  IconExport,
  IconFit,
  IconFrame,
  IconHand,
  IconHistory,
  IconImport,
  IconArrow,
  IconLine,
  IconMinus,
  IconPen,
  IconPlay,
  IconPlus,
  IconPolygon,
  IconRect,
  IconRedo,
  IconSection,
  IconSlice,
  IconStar,
  IconText,
  IconUndo,
} from './icons';

const BOOLEAN_ACTIONS: Array<{ action: VectorAction; label: string; hint: string }> = [
  { action: 'union', label: '并集', hint: '合并所选闭合对象' },
  { action: 'subtract', label: '差集', hint: '从底层对象减去其余对象' },
  { action: 'intersect', label: '交集', hint: '只保留所有对象的重叠部分' },
  { action: 'exclude', label: '排除', hint: '保留所有对象不重叠的部分' },
];

const EXTRA_ACTIONS: Array<{ action: VectorAction; label: string; hint: string }> = [
  { action: 'divide', label: '分割', hint: '按所有重叠边界拆成多个区域' },
  { action: 'flatten', label: '拍平', hint: '合并为一个多轮廓路径' },
  { action: 'outline', label: '描边', hint: '把实线描边转为填色路径' },
];

const VECTOR_ACTIONS = [...BOOLEAN_ACTIONS, ...EXTRA_ACTIONS];

interface ToolItem {
  tool: Tool;
  label: string;
  key: string;
  icon: ReactNode;
}

interface ToolGroup {
  id: 'move' | 'frame' | 'shape';
  label: string;
  tools: ToolItem[];
}

const MOVE_TOOLS: ToolItem[] = [
  { tool: 'move', label: '移动工具', key: 'V', icon: <IconCursor size={15} /> },
  { tool: 'hand', label: '抓手工具', key: 'H', icon: <IconHand size={15} /> },
];

const FRAME_TOOLS: ToolItem[] = [
  { tool: 'frame', label: '画板工具', key: 'F', icon: <IconFrame size={15} /> },
  { tool: 'section', label: '区块工具', key: 'S', icon: <IconSection size={15} /> },
  { tool: 'slice', label: '切片工具', key: 'K', icon: <IconSlice size={15} /> },
];

const SHAPE_TOOLS: ToolItem[] = [
  { tool: 'rect', label: '矩形工具', key: 'R', icon: <IconRect size={15} /> },
  { tool: 'line', label: '直线工具', key: 'L', icon: <IconLine size={15} /> },
  { tool: 'arrow', label: '箭头工具', key: 'A', icon: <IconArrow size={15} /> },
  { tool: 'ellipse', label: '椭圆工具', key: 'O', icon: <IconEllipse size={15} /> },
  { tool: 'polygon', label: '多边形工具', key: 'G', icon: <IconPolygon size={15} /> },
  { tool: 'star', label: '星形工具', key: 'Y', icon: <IconStar size={15} /> },
];

const TOOL_GROUPS: ToolGroup[] = [
  { id: 'move', label: '移动与抓手', tools: MOVE_TOOLS },
  { id: 'frame', label: '画板与区块', tools: FRAME_TOOLS },
  { id: 'shape', label: '形状', tools: SHAPE_TOOLS },
];

const BARE_TOOLS: ToolItem[] = [
  { tool: 'text', label: '文字工具', key: 'T', icon: <IconText size={15} /> },
  { tool: 'pen', label: '钢笔工具', key: 'P', icon: <IconPen size={15} /> },
];

export function TopBar() {
  const s = useEditor();
  const page = s.doc.pages.find((item) => item.id === s.pageId) ?? s.doc.pages[0];
  const canPresent = page ? topLevelFrames(s.doc, page).length > 0 : false;
  const [name, setName] = useState(s.doc.name);
  const [exportOpen, setExportOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; detail: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [boolMenuOpen, setBoolMenuOpen] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState<ToolGroup['id'] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(s.doc.name);
  }, [s.doc.name]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      const item = [...(event.clipboardData?.items ?? [])].find(
        (entry) => entry.kind === 'file' && entry.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      if (!s.projectId) {
        setToast({ title: '无法粘贴图片', detail: '先保存工程，再把图片放进 assets' });
        return;
      }
      setImporting(true);
      importImageAsset(s.projectId, file)
        .then(({ asset }) => {
          const current = getState();
          const target = current.selectedId ? current.doc.nodes[current.selectedId] : null;
          if (target && !target.locked && (target.type === 'rect' || target.type === 'ellipse' || target.type === 'path' || target.type === 'boolean')) {
            editor.applyPatch(target.id, {
              imageFill: { assetId: asset.id, mode: 'fill', focusX: 0.5, focusY: 0.5, opacity: 1 },
            });
            setToast({ title: '已填充形状', detail: `${target.name} · ${asset.name}` });
          } else {
            editor.insertImage(asset);
            setToast({ title: '已粘贴图片', detail: `${asset.name} · ${asset.w} × ${asset.h}` });
          }
        })
        .catch((error) => {
          setToast({ title: '粘贴失败', detail: error instanceof Error ? error.message : String(error) });
        })
        .finally(() => setImporting(false));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [s.projectId]);

  const scalePct = Math.round(s.viewport.scale * 100);
  const booleanReady = vectorActionEligibility(s.doc, s.selectedIds, 'union');
  const selectedBooleanNode =
    s.selectedIds.length === 1 && s.doc.nodes[s.selectedIds[0]]?.type === 'boolean'
      ? s.doc.nodes[s.selectedIds[0]]
      : null;
  const showVector = s.selectedIds.length >= 1;
  const readiness = (action: VectorAction) =>
    selectedBooleanNode &&
    (action === 'union' || action === 'subtract' || action === 'intersect' || action === 'exclude')
      ? { ok: true as const, reason: '' }
      : action === 'divide' || action === 'flatten' || action === 'outline'
        ? vectorActionEligibility(s.doc, s.selectedIds, action)
        : booleanReady;

  useEffect(() => {
    if (!showVector) setBoolMenuOpen(false);
  }, [showVector]);

  useEffect(() => {
    if (!boolMenuOpen && toolMenuOpen === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBoolMenuOpen(false);
        setToolMenuOpen(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [boolMenuOpen, toolMenuOpen]);

  function runVector(action: VectorAction) {
    const ready = readiness(action);
    if (!ready.ok) {
      setToast({ title: '无法执行矢量操作', detail: ready.reason });
      return;
    }
    const booleanLabels: Record<'union' | 'subtract' | 'intersect' | 'exclude', string> = {
      union: '并集',
      subtract: '差集',
      intersect: '交集',
      exclude: '排除',
    };
    if (
      selectedBooleanNode &&
      (action === 'union' || action === 'subtract' || action === 'intersect' || action === 'exclude')
    ) {
      if (editor.setBooleanOp(action)) {
        setToast({ title: `已切换为${booleanLabels[action]}`, detail: '子图层保留，可继续展开编辑' });
      }
      return;
    }
    if (editor.vectorSelected(action)) {
      const titles: Record<VectorAction, string> = {
        union: '并集完成',
        subtract: '差集完成',
        intersect: '交集完成',
        exclude: '排除完成',
        divide: '分割完成',
        flatten: '拍平完成',
        outline: '描边转形状完成',
      };
      const details: Record<VectorAction, string> = {
        union: '已生成可展开布尔组',
        subtract: '已生成可展开布尔组',
        intersect: '已生成可展开布尔组',
        exclude: '已生成可展开布尔组',
        divide: '已拆成独立区域路径',
        flatten: '已合并为单个多轮廓路径',
        outline: '描边已转为填色路径',
      };
      setToast({ title: titles[action], detail: details[action] });
    } else {
      setToast({ title: '无法执行矢量操作', detail: '结果为空或对象没有父级' });
    }
  }

  function renderToolMenu(group: ToolGroup) {
    if (toolMenuOpen !== group.id) return null;
    return (
      <>
        <button
          className="bool-menu-shade"
          aria-label={`关闭${group.label}菜单`}
          tabIndex={-1}
          onClick={() => setToolMenuOpen(null)}
        />
        <div className={`bool-menu tool-menu tool-menu-${group.id}`} role="menu" aria-label={group.label}>
          {group.tools.map((item) => (
            <button
              key={item.tool}
              className={`bool-menu-item tool-menu-item${s.tool === item.tool ? ' is-on' : ''}`}
              role="menuitem"
              data-tool={item.tool}
              onClick={() => {
                editor.setTool(item.tool);
                setToolMenuOpen(null);
              }}
            >
              <span className="tool-menu-glyph">{item.icon}</span>
              <span>{item.label.replace('工具', '')}</span>
              <kbd>{item.key}</kbd>
            </button>
          ))}
        </div>
      </>
    );
  }

  function renderVectorMenu(actions: typeof VECTOR_ACTIONS, label: string) {
    if (!boolMenuOpen) return null;
    const blocked = actions.map((item) => readiness(item.action)).filter((item) => !item.ok);
    return (
      <>
        <button
          className="bool-menu-shade"
          aria-label="关闭矢量菜单"
          tabIndex={-1}
          onClick={() => setBoolMenuOpen(false)}
        />
        <div className="bool-menu" role="menu" aria-label={label}>
          {actions.map((item, index) => {
            const ready = readiness(item.action);
            return (
              <Fragment key={item.action}>
                {index === BOOLEAN_ACTIONS.length && <span className="bool-menu-sep" />}
                <button
                  className="bool-menu-item"
                  role="menuitem"
                  disabled={!ready.ok}
                  title={ready.ok ? item.hint : ready.reason}
                  onClick={() => {
                    runVector(item.action);
                    setBoolMenuOpen(false);
                  }}
                >
                  {item.label}
                </button>
              </Fragment>
            );
          })}
          {blocked.length === actions.length && blocked[0] && (
            <span className="bool-menu-reason">{blocked[0].reason}</span>
          )}
        </div>
      </>
    );
  }

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

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      if (isImageFile(file)) {
        if (!s.projectId) throw new Error('先保存工程，再把图片放进 assets');
        const { asset } = await importImageAsset(s.projectId, file);
        editor.insertImage(asset);
        setToast({
          title: '已导入图片',
          detail: `${asset.name} · ${asset.w} × ${asset.h}`,
        });
        return;
      }
      const isSvg = /\.svg$/i.test(file.name) || file.type === 'image/svg+xml';
      if (!isSvg) throw new Error('只支持 SVG / PNG / JPG / WebP');
      const text = await file.text();
      const parsed = parseSvgDrawing(text, file.name.replace(/\.svg$/i, '') || 'Vexa 图形');
      if (parsed.frames.every((frame) => frame.children.length === 0)) {
        throw new Error('SVG 里没有可导入的图形');
      }
      const result = await applySvgImport(parsed, s.projectId);
      setToast({
        title: `已导入 ${result.count} 个图层`,
        detail: result.warnings.length ? result.warnings.join(' · ') : file.name,
      });
    } catch (error) {
      setToast({
        title: '导入失败',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setImporting(false);
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
          {TOOL_GROUPS.map((group) => {
            const current = group.tools.find((item) => item.tool === s.tool) ?? group.tools[0];
            const groupActive = group.tools.some((item) => item.tool === s.tool);
            const open = toolMenuOpen === group.id;
            return (
              <span key={group.id} className={`tool-split${groupActive ? ' is-active' : ''}`}>
                <button
                  className="tool-btn tool-split-main"
                  title={`${current.label} ${current.key}`}
                  aria-label={current.label}
                  onClick={() => editor.setTool(current.tool)}
                >
                  {current.icon}
                </button>
                <button
                  className="tool-split-caret"
                  title={`${group.label}下拉菜单`}
                  aria-label={`${group.label}菜单`}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={() => {
                    setBoolMenuOpen(false);
                    setToolMenuOpen(open ? null : group.id);
                  }}
                >
                  <span className="tool-caret" aria-hidden="true" />
                </button>
                {renderToolMenu(group)}
              </span>
            );
          })}
          {BARE_TOOLS.map((item) => (
            <button
              key={item.tool}
              className={`tool-btn${s.tool === item.tool ? ' is-active' : ''}`}
              title={`${item.label} ${item.key}`}
              aria-label={item.label}
              onClick={() => editor.setTool(item.tool)}
            >
              {item.icon}
            </button>
          ))}
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
          {showVector && (
            <>
              <span className="tool-sep" />
              <span className="bool-menu-wrap">
                <button
                  className="tool-btn bool-btn"
                  title="布尔与矢量运算"
                  aria-label="布尔与矢量运算"
                  aria-expanded={boolMenuOpen}
                  onClick={() => {
                    setToolMenuOpen(null);
                    setBoolMenuOpen((open) => !open);
                  }}
                >
                  <span>{booleanReady.ok || selectedBooleanNode ? '布尔' : '矢量'}</span>
                  <span className="tool-caret" aria-hidden="true" />
                </button>
                {renderVectorMenu(VECTOR_ACTIONS, '布尔与矢量运算')}
              </span>
            </>
          )}
        </div>

        <div className="topbar-right">
          <input
            ref={fileRef}
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => void onImportFile(e)}
          />
          <button
            className="export-btn"
            title="导入 SVG 图形或图片"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            <IconImport size={14} />
            <span>{importing ? '导入中…' : '导入'}</span>
          </button>
          <button
            className="export-btn"
            title={canPresent ? '从当前画板开始演示原型' : '当前页还没有画板'}
            disabled={!canPresent}
            onClick={() => editor.openPrototype()}
          >
            <IconPlay size={14} />
            <span>演示</span>
          </button>
          <button
            className="version-btn"
            title="变量与多 Mode"
            aria-label="变量与多 Mode"
            onClick={() => setVariablesOpen(true)}
          >
            <IconComponent size={14} />
            <span>变量</span>
          </button>
          <button
            className="version-btn"
            title="版本历史"
            aria-label="版本历史"
            disabled={!s.projectId}
            onClick={() => setVersionOpen(true)}
          >
            <IconHistory size={14} />
            <span>版本</span>
          </button>
          <button className="export-btn" title="导出 PNG / JPG / SVG / HTML" onClick={() => setExportOpen(true)}>
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
          <button
            className="zoom-btn"
            title="适应画板 Shift+1 · 适应选区 Shift+2"
            aria-label="适应画板或选区"
            onClick={() => editor.fitSelection()}
          >
            <IconFit size={14} />
          </button>
        </div>
      </header>

      {exportOpen && (
        <ExportDialog
          onClose={() => setExportOpen(false)}
          onDone={(title, detail) => {
            setExportOpen(false);
            setToast({ title, detail });
          }}
        />
      )}

      {versionOpen && <VersionHistory onClose={() => setVersionOpen(false)} />}
      {variablesOpen && <VariablesDialog onClose={() => setVariablesOpen(false)} />}

      {toast && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          <strong>{toast.title}</strong>
          <span className="toast-path" title={toast.detail}>{toast.detail}</span>
        </div>
      )}
    </>
  );
}


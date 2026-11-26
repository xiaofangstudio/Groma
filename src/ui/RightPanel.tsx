import { useEffect, useRef, useState } from 'react';
import { editor, useEditor } from '../state/editor';
import { getAssetDataUrl, getImageProjectId, importImageAsset } from '../io/images';
import type { Paint, PaintStop, SceneNode, StrokeCap, StrokeJoin } from '../core/types';
import {
  addGradientStop,
  isGradientPaint,
  linearAngle,
  paintPreview,
  removeGradientStop,
  rotateLinearGradient,
  toGradientPaint,
  toSolidPaint,
  updateGradientStops,
} from '../core/paint';
import { dashForKind, dashKind, formatDash, parseDashInput, type DashKind } from '../core/stroke';
import { countSharedPenVertices } from '../core/pen';
import { maskEligibility, maskTypeOf } from '../core/mask';
import { cropPercent, imageCropOf, isFullImageCrop } from '../core/image';
import { usePenAnchorSelection } from '../state/pen-selection';
import { absolutePosition, absoluteRect, selectionBounds, topLevelSelection } from '../core/geometry';
import { countArtboards } from '../core/doc';
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
  IconPath,
  IconFrame,
  IconGroup,
  IconImage,
  IconPage,
  IconRect,
  IconSection,
  IconSlice,
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

function ColorField({
  color,
  opacity,
  disabled,
  onCommit,
  onOpacity,
}: {
  color: string;
  opacity?: number;
  disabled?: boolean;
  onCommit: (hex: string) => void;
  onOpacity?: (value: number) => void;
}) {
  const [draft, setDraft] = useState(color.toUpperCase());
  const [alpha, setAlpha] = useState(String(Math.round((opacity ?? 1) * 100)));
  useEffect(() => setDraft(color.toUpperCase()), [color]);
  useEffect(() => setAlpha(String(Math.round((opacity ?? 1) * 100))), [opacity]);

  function commitAlpha(raw: string) {
    const value = Math.max(0, Math.min(100, Math.round(Number(raw))));
    if (!Number.isFinite(value)) {
      setAlpha(String(Math.round((opacity ?? 1) * 100)));
      return;
    }
    setAlpha(String(value));
    if (value !== Math.round((opacity ?? 1) * 100)) onOpacity?.(value / 100);
  }

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
      <input
        className="field-input alpha-input"
        value={alpha}
        disabled={disabled || !onOpacity}
        inputMode="numeric"
        aria-label="透明度"
        onChange={(e) => setAlpha(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commitAlpha(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setAlpha(String(Math.round((opacity ?? 1) * 100)));
            e.currentTarget.blur();
          }
        }}
      />
      <span className="color-alpha-unit">%</span>
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

function LineField({
  label,
  value,
  placeholder,
  ariaLabel,
  disabled,
  listId,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  listId?: string;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const skip = useRef(false);

  useEffect(() => setDraft(value), [value]);

  function commit(raw: string) {
    if (skip.current) {
      skip.current = false;
      setDraft(value);
      return;
    }
    const next = raw.trim().slice(0, 120);
    setDraft(next);
    if (next !== value) onCommit(next);
  }

  return (
    <label className="field line-field">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        aria-label={ariaLabel}
        list={listId}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            skip.current = true;
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field select-field">
      <span className="field-label">{label}</span>
      <select
        className="field-select"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function typeLabel(type: SceneNode['type']): string {
  if (type === 'frame') return '画板';
  if (type === 'section') return '区块';
  if (type === 'rect') return '矩形';
  if (type === 'ellipse') return '椭圆';
  if (type === 'text') return '文本';
  if (type === 'path') return '矢量';
  if (type === 'image') return '图片';
  if (type === 'group') return '分组';
  if (type === 'slice') return '切片';
  return '节点';
}

function TypeIcon({ type, size = 14 }: { type: SceneNode['type']; size?: number }) {
  if (type === 'frame') return <IconFrame size={size} />;
  if (type === 'section') return <IconSection size={size} />;
  if (type === 'rect') return <IconRect size={size} />;
  if (type === 'ellipse') return <IconEllipse size={size} />;
  if (type === 'text') return <IconText size={size} />;
  if (type === 'path') return <IconPath size={size} />;
  if (type === 'image') return <IconImage size={size} />;
  if (type === 'group') return <IconGroup size={size} />;
  if (type === 'slice') return <IconSlice size={size} />;
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

function GradientStopRow({
  stop,
  index,
  count,
  disabled,
  onChange,
  onRemove,
}: {
  stop: PaintStop;
  index: number;
  count: number;
  disabled?: boolean;
  onChange: (next: PaintStop) => void;
  onRemove: () => void;
}) {
  const [hex, setHex] = useState(stop.color.toUpperCase());
  const [offset, setOffset] = useState(fmt(stop.offset * 100));
  const [alpha, setAlpha] = useState(String(Math.round(stop.opacity * 100)));

  useEffect(() => setHex(stop.color.toUpperCase()), [stop.color]);
  useEffect(() => setOffset(fmt(stop.offset * 100)), [stop.offset]);
  useEffect(() => setAlpha(String(Math.round(stop.opacity * 100))), [stop.opacity]);

  function commitHex(raw: string) {
    const value = normalizeHex(raw);
    if (!value) {
      setHex(stop.color.toUpperCase());
      return;
    }
    setHex(value);
    if (value !== stop.color.toUpperCase()) onChange({ ...stop, color: value });
  }

  function commitOffset(raw: string) {
    const value = Number(raw.replace(',', '.'));
    if (!Number.isFinite(value)) {
      setOffset(fmt(stop.offset * 100));
      return;
    }
    const percent = Math.max(0, Math.min(100, Math.round(value * 10) / 10));
    setOffset(String(percent));
    if (percent / 100 !== stop.offset) onChange({ ...stop, offset: percent / 100 });
  }

  function commitAlpha(raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      setAlpha(String(Math.round(stop.opacity * 100)));
      return;
    }
    const percent = Math.max(0, Math.min(100, Math.round(value)));
    setAlpha(String(percent));
    if (percent / 100 !== stop.opacity) onChange({ ...stop, opacity: percent / 100 });
  }

  return (
    <div className="gradient-stop-row">
      <div className="gradient-stop-color">
        <input
          type="color"
          className="color-swatch stop-swatch"
          value={normalizeHex(hex) ?? '#FFFFFF'}
          disabled={disabled}
          aria-label={`色标 ${index + 1} 颜色`}
          onChange={(e) => setHex(e.currentTarget.value.toUpperCase())}
          onBlur={(e) => commitHex(e.currentTarget.value)}
        />
        <input
          className="field-input hex-input stop-hex"
          value={hex}
          disabled={disabled}
          spellCheck={false}
          aria-label={`色标 ${index + 1} 色值`}
          onChange={(e) => setHex(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => commitHex(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setHex(stop.color.toUpperCase());
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      <input
        className="field-input stop-num"
        value={offset}
        disabled={disabled}
        inputMode="decimal"
        aria-label={`色标 ${index + 1} 位置百分比`}
        onChange={(e) => setOffset(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commitOffset(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setOffset(fmt(stop.offset * 100));
            e.currentTarget.blur();
          }
        }}
      />
      <input
        className="field-input stop-num"
        value={alpha}
        disabled={disabled}
        inputMode="numeric"
        aria-label={`色标 ${index + 1} 透明度`}
        onChange={(e) => setAlpha(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commitAlpha(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setAlpha(String(Math.round(stop.opacity * 100)));
            e.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        className="stop-remove"
        title={count <= 2 ? '至少保留两个色标' : '删除色标'}
        aria-label={`删除色标 ${index + 1}`}
        disabled={disabled || count <= 2}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

const FONT_FAMILIES = [
  '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
  '"Microsoft YaHei", "微软雅黑", sans-serif',
  '"PingFang SC", "Microsoft YaHei", sans-serif',
  '"Source Han Sans SC", "思源黑体", "Microsoft YaHei", sans-serif',
  '"LXGW WenKai", "霞鹜文楷", "Microsoft YaHei", serif',
  'Arial, "Microsoft YaHei", sans-serif',
  'Helvetica, Arial, sans-serif',
  'Georgia, "Times New Roman", serif',
  '"Times New Roman", "SimSun", serif',
  'Consolas, "Courier New", monospace',
  '"Courier New", monospace',
];

const FILL_TYPES = [
  { type: 'solid', label: '纯色' },
  { type: 'linear', label: '线性' },
  { type: 'radial', label: '径向' },
] as const;

function FillEditor({
  node,
  fallbackColor,
  note,
}: {
  node: SceneNode;
  fallbackColor: string;
  note?: string;
}) {
  const fill = node.fills[0];
  const gradient = isGradientPaint(fill) ? fill : null;
  const currentType = fill?.type ?? 'solid';

  function patchFill(next: Paint) {
    editor.applyPatch(node.id, { fills: [next, ...node.fills.slice(1)] });
  }

  function changeType(type: (typeof FILL_TYPES)[number]['type']) {
    if (type === currentType) return;
    if (type === 'solid') patchFill(toSolidPaint(fill, fallbackColor));
    else patchFill(toGradientPaint(fill, type, fallbackColor, node.w, node.h));
  }

  function updateStops(stops: PaintStop[]) {
    if (!gradient) return;
    patchFill(updateGradientStops(gradient, stops));
  }

  return (
    <>
      {note ? <p className="ins-note">{note}</p> : null}
      <div className="fill-type-switch" role="group" aria-label="填充类型">
        {FILL_TYPES.map((item) => (
          <button
            key={item.type}
            type="button"
            className={`fill-type-btn ${currentType === item.type ? 'is-on' : ''}`}
            aria-pressed={currentType === item.type}
            disabled={node.locked}
            onClick={() => changeType(item.type)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {gradient ? (
        <>
          <div
            className="gradient-preview"
            style={{ background: paintPreview(gradient, node.w, node.h) }}
            aria-hidden="true"
          />
          <div className="gradient-stop-head" aria-hidden="true">
            <span>颜色</span>
            <span>位置%</span>
            <span>透明%</span>
            <span />
          </div>
          <div className="gradient-stop-list">
            {gradient.stops.map((stop, index) => (
              <GradientStopRow
                key={`${index}-${stop.offset}`}
                stop={stop}
                index={index}
                count={gradient.stops.length}
                disabled={node.locked}
                onChange={(next) => updateStops(gradient.stops.map((item, i) => (i === index ? next : item)))}
                onRemove={() => patchFill(removeGradientStop(gradient, index))}
              />
            ))}
          </div>
          <button
            type="button"
            className="wide-action gradient-add"
            disabled={node.locked || gradient.stops.length >= 32}
            onClick={() => patchFill(addGradientStop(gradient))}
          >
            <span>添加色标</span>
          </button>

          {gradient.type === 'linear' ? (
            <div className="field-grid gradient-geometry">
              <NumField
                label="角度"
                value={Math.round(linearAngle(gradient) * 10) / 10}
                min={-360}
                max={360}
                disabled={node.locked}
                onCommit={(n) => patchFill(rotateLinearGradient(gradient, n))}
              />
              <button
                type="button"
                className="text-toggle gradient-reverse"
                disabled={node.locked}
                onClick={() => patchFill(rotateLinearGradient(gradient, linearAngle(gradient) + 180))}
              >
                反向
              </button>
            </div>
          ) : (
            <>
              <div className="gradient-geometry gradient-geometry-radial">
                <NumField
                  label="X"
                  value={gradient.cx}
                  disabled={node.locked}
                  onCommit={(n) => patchFill({ ...gradient, cx: n })}
                />
                <NumField
                  label="Y"
                  value={gradient.cy}
                  disabled={node.locked}
                  onCommit={(n) => patchFill({ ...gradient, cy: n })}
                />
                <NumField
                  label="R"
                  value={gradient.r}
                  min={0.1}
                  max={100000}
                  disabled={node.locked}
                  onCommit={(n) => patchFill({ ...gradient, r: n })}
                />
              </div>
              <p className="ins-note">X / Y 为圆心，R 为半径，按节点局部坐标计算。</p>
            </>
          )}
          <p className="ins-note">
            {gradient.type === 'linear' ? '角度 0° 指向右侧，色标位置按渐变长度计算。' : '色标位置按半径比例计算。'}
          </p>
        </>
      ) : (
        <ColorField
          color={fill?.color ?? fallbackColor}
          opacity={fill?.opacity ?? 1}
          disabled={node.locked}
          onCommit={(hex) =>
            patchFill(fill ? { ...fill, type: 'solid', color: hex } : { type: 'solid', color: hex, opacity: 1 })
          }
          onOpacity={(value) =>
            patchFill(
              fill
                ? { ...fill, opacity: value }
                : { type: 'solid', color: fallbackColor, opacity: value },
            )
          }
        />
      )}
    </>
  );
}

function ImageFillEditor({ node }: { node: SceneNode }) {
  const s = useEditor();
  const fill = node.imageFill;
  const asset = fill ? s.doc.assets?.[fill.assetId] : undefined;
  const assets = Object.values(s.doc.assets ?? {});
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(assetId: string) {
    editor.applyPatch(node.id, {
      imageFill: {
        assetId,
        mode: fill?.mode ?? 'fill',
        focusX: fill?.focusX ?? 0.5,
        focusY: fill?.focusY ?? 0.5,
        opacity: fill?.opacity ?? 1,
      },
    });
    setOpen(false);
    setError(null);
  }

  async function importFill(file: File | undefined) {
    if (!file) return;
    const projectId = getImageProjectId();
    if (!projectId) {
      setError('工程尚未保存，无法写入图片资产');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const imported = await importImageAsset(projectId, file);
      apply(imported.asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片填充导入失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-fill-block">
      <div className="image-fill-head">
        <span className="image-fill-label">图片填充</span>
        <button
          type="button"
          className="mini-action"
          disabled={node.locked || busy}
          onClick={() => setOpen((value) => !value)}
        >
          {fill ? '换图' : busy ? '导入中…' : '选择图片'}
        </button>
        {fill && (
          <button
            type="button"
            className="mini-action"
            disabled={node.locked}
            onClick={() => editor.applyPatch(node.id, { imageFill: undefined })}
          >
            移除
          </button>
        )}
      </div>
      {fill && asset ? (
        <>
          <div className="image-fill-current">
            {getAssetDataUrl(asset.id) ? (
              <img src={getAssetDataUrl(asset.id) ?? ''} alt="" draggable={false} />
            ) : (
              <span className="image-fill-empty" />
            )}
            <span title={asset.name}>{asset.name}</span>
          </div>
          <p className="ins-note">图片填充优先于纯色/渐变；移除后恢复。</p>
          <div className="fill-type-switch" role="group" aria-label="图片填充方式">
            {[
              { value: 'fill' as const, label: '铺满' },
              { value: 'fit' as const, label: '适应' },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                className={`fill-type-btn ${(fill.mode ?? 'fill') === item.value ? 'is-on' : ''}`}
                disabled={node.locked}
                onClick={() => editor.applyPatch(node.id, { imageFill: { ...fill, mode: item.value } })}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="field-grid text-meta">
            <NumField
              label="焦点X"
              value={Math.round(fill.focusX * 100)}
              min={0}
              max={100}
              disabled={node.locked}
              onCommit={(value) => editor.applyPatch(node.id, { imageFill: { ...fill, focusX: value / 100 } })}
            />
            <NumField
              label="焦点Y"
              value={Math.round(fill.focusY * 100)}
              min={0}
              max={100}
              disabled={node.locked}
              onCommit={(value) => editor.applyPatch(node.id, { imageFill: { ...fill, focusY: value / 100 } })}
            />
          </div>
        </>
      ) : fill ? (
        <p className="ins-note">图片资产缺失，换一张图或移除填充。</p>
      ) : (
        <p className="ins-note">用图片铺满这个形状，可按焦点决定保留区域。</p>
      )}
      {open && (
        <div className="image-fill-picker">
          <div className="image-fill-grid">
            {assets.map((item) => {
              const url = getAssetDataUrl(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`image-fill-thumb ${item.id === fill?.assetId ? 'is-on' : ''}`}
                  title={`${item.name} · ${item.w} × ${item.h}`}
                  disabled={node.locked}
                  onClick={() => apply(item.id)}
                >
                  {url ? <img src={url} alt="" draggable={false} /> : <span>{item.name}</span>}
                </button>
              );
            })}
            {assets.length === 0 && <p className="ins-note">工程里还没有图片资产。</p>}
          </div>
          <button type="button" className="wide-action" disabled={node.locked || busy} onClick={() => fileRef.current?.click()}>
            {busy ? '导入中…' : '导入图片'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void importFill(file);
            }}
          />
        </div>
      )}
      {error && <p className="ins-error">{error}</p>}
    </div>
  );
}

function FrameInspector({ node }: { node: SceneNode }) {
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
        <FillEditor node={node} fallbackColor="#FFFFFF" />
        <Row label="混合" value="正常" />
      </section>

      <div className="ins-hint">{node.locked ? '画板已锁定，属性编辑已停用' : 'Ctrl+Z 撤销 · Shift+1 适应画板'}</div>
    </>
  );
}

function SliceInspector({ node }: { node: SceneNode }) {
  return (
    <>
      <div className="inspector-sel">
        <TypeIcon type={node.type} />
        <NameField node={node} />
        <span className="type-chip">切片</span>
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
        <h3 className="ins-title">导出区域</h3>
        <Row label="尺寸" value={`${Math.round(node.w)} × ${Math.round(node.h)}`} />
        <Row label="格式" value="PNG · JPG · SVG" />
        <p className="ins-note">选中切片后点顶部“导出”，只输出这个矩形里的画面。画布上的虚线只是编辑标记，不会进入导出文件。</p>
      </section>

      <div className="ins-hint">{node.locked ? '切片已锁定，属性编辑已停用' : 'K 切片工具 · 选中后从导出弹窗输出'}</div>
    </>
  );
}

function ShapeInspector({ node }: { node: SceneNode }) {
  const s = useEditor();
  const penSelection = usePenAnchorSelection();
  const stroke = node.strokes?.[0];
  const isText = node.type === 'text';
  const isRect = node.type === 'rect';
  const isPen = node.type === 'path' && ((node.pathContours?.length ?? 0) > 0 || (node.pathAnchors?.length ?? 0) > 0);
  const penContours = node.pathContours?.length
    ? node.pathContours
    : node.pathAnchors?.length
      ? [{ anchors: node.pathAnchors, closed: Boolean(node.pathClosed) }]
      : [];
  const penClosed = penContours.filter((contour) => contour.closed).length;
  const penPathState =
    penContours.length > 1
      ? `${penClosed} 闭合 / ${penContours.length - penClosed} 开放`
      : node.pathClosed
        ? '闭合'
        : '开放';
  const penAnchorTotal = penContours.reduce((sum, contour) => sum + contour.anchors.length, 0);
  const penSharedTotal = countSharedPenVertices(penContours);
  const strokeDash = stroke ? dashKind(stroke.dash) : 'solid';
  const maskCandidate = node.type === 'rect' || node.type === 'ellipse' || (node.type === 'path' && node.shapeKind !== 'arrow');
  const maskState = maskCandidate || node.isMask ? maskEligibility(s.doc, node.id) : null;

  const patchStroke = (patch: Partial<NonNullable<SceneNode['strokes']>[number]>) => {
    if (!stroke) return;
    editor.applyPatch(node.id, { strokes: [{ ...stroke, ...patch }] });
  };

  return (
    <>
      <div className="inspector-sel">
        <TypeIcon type={node.type} />
        <NameField node={node} />
        <span className="type-chip">{isPen ? '钢笔' : typeLabel(node.type)}</span>
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

      {node.type === 'path' && (node.shapeKind === 'polygon' || node.shapeKind === 'star') && (
        <section className="ins-section">
          <h3 className="ins-title">形状</h3>
          <div className="field-grid">
            <NumField
              label={node.shapeKind === 'polygon' ? '边数' : '角数'}
              value={node.shapeSides ?? 5}
              min={3}
              max={12}
              disabled={node.locked}
              onCommit={(n) => editor.setShapeParams(node.id, { sides: n })}
            />
            {node.shapeKind === 'star' && (
              <NumField
                label="内径%"
                value={Math.round((node.shapeInnerRatio ?? 0.38) * 100)}
                min={10}
                max={90}
                disabled={node.locked}
                onCommit={(n) => editor.setShapeParams(node.id, { innerRatio: n / 100 })}
              />
            )}
          </div>
        </section>
      )}

      {isPen && (
        <section className="ins-section">
          <h3 className="ins-title">钢笔路径</h3>
          <Row label="轮廓" value={`${penContours.length} 条`} />
          <Row label="锚点" value={`${penAnchorTotal} 个`} />
          <Row label="路径" value={penPathState} />
          {penContours.length > 1 && (
            <Row
              label="当前轮廓"
              value={
                penSelection?.nodeId === node.id
                  ? `第 ${penSelection.contour + 1} / ${penContours.length} 条`
                  : '未选锚点'
              }
            />
          )}
          {penSharedTotal > 0 && <Row label="共享顶点" value={`${penSharedTotal} 个`} />}
          <p className="ins-note">拖动锚点与手柄可改形；双击锚点切角/平滑；点线段加点，选中锚点 Delete 删除；Ctrl+Delete 删除整条轮廓；Alt + 点锚点起分支，Alt + 点空白追加轮廓。</p>
        </section>
      )}

      {isText && (
        <section className="ins-section">
          <h3 className="ins-title">文本</h3>
          <TextField
            value={node.text ?? '文本'}
            disabled={node.locked}
            onCommit={(text) => editor.applyPatch(node.id, { text })}
          />
          <div className="text-meta">
            <LineField
              label="字体"
              value={node.fontFamily ?? ''}
              placeholder="系统默认（Segoe UI / 微软雅黑）"
              ariaLabel="字体族"
              disabled={node.locked}
              listId="groma-font-options"
              onCommit={(fontFamily) => editor.applyPatch(node.id, { fontFamily: fontFamily || undefined })}
            />
            <datalist id="groma-font-options">
              {FONT_FAMILIES.map((font) => (
                <option key={font} value={font} />
              ))}
            </datalist>
          </div>
          <div className="field-grid text-meta is-triple">
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
            <NumField
              label="字距"
              value={node.letterSpacing ?? 0}
              min={-50}
              max={200}
              disabled={node.locked}
              onCommit={(n) => editor.applyPatch(node.id, { letterSpacing: n === 0 ? undefined : n })}
            />
          </div>
          <div className="text-align-row" role="group" aria-label="文本对齐">
            <button
              type="button"
              className={`text-align-btn ${(node.align ?? 'left') === 'left' ? 'is-on' : ''}`}
              title="左对齐"
              aria-label="左对齐"
              aria-pressed={(node.align ?? 'left') === 'left'}
              disabled={node.locked}
              onClick={() => editor.applyPatch(node.id, { align: 'left' })}
            >
              <IconAlignLeft size={15} />
            </button>
            <button
              type="button"
              className={`text-align-btn ${node.align === 'center' ? 'is-on' : ''}`}
              title="居中对齐"
              aria-label="居中对齐"
              aria-pressed={node.align === 'center'}
              disabled={node.locked}
              onClick={() => editor.applyPatch(node.id, { align: 'center' })}
            >
              <IconAlignHCenter size={15} />
            </button>
            <button
              type="button"
              className={`text-align-btn ${node.align === 'right' ? 'is-on' : ''}`}
              title="右对齐"
              aria-label="右对齐"
              aria-pressed={node.align === 'right'}
              disabled={node.locked}
              onClick={() => editor.applyPatch(node.id, { align: 'right' })}
            >
              <IconAlignRight size={15} />
            </button>
          </div>
          <div className="field-grid text-meta">
            <NumField
              label="行高"
              value={node.lineHeight ?? 1.3}
              min={0.8}
              max={3}
              disabled={node.locked}
              onCommit={(n) => editor.applyPatch(node.id, { lineHeight: n })}
            />
            <button
              type="button"
              className={`text-toggle ${node.italic ? 'is-on' : ''}`}
              aria-pressed={Boolean(node.italic)}
              disabled={node.locked}
              onClick={() => editor.applyPatch(node.id, { italic: !node.italic })}
            >
              斜体
            </button>
          </div>
          <div className="field-grid text-meta is-triple">
            <button
              type="button"
              className={`text-toggle ${node.listStyle === 'bullet' ? 'is-on' : ''}`}
              aria-pressed={node.listStyle === 'bullet'}
              disabled={node.locked}
              title="每行前加项目符号"
              onClick={() => editor.applyPatch(node.id, { listStyle: node.listStyle === 'bullet' ? 'none' : 'bullet' })}
            >
              • 列表
            </button>
            <button
              type="button"
              className={`text-toggle ${node.listStyle === 'number' ? 'is-on' : ''}`}
              aria-pressed={node.listStyle === 'number'}
              disabled={node.locked}
              title="每行前加序号"
              onClick={() => editor.applyPatch(node.id, { listStyle: node.listStyle === 'number' ? 'none' : 'number' })}
            >
              1. 列表
            </button>
            <NumField
              label="段距"
              value={node.paragraphSpacing ?? 0}
              min={0}
              max={200}
              disabled={node.locked}
              onCommit={(n) => editor.applyPatch(node.id, { paragraphSpacing: n === 0 ? undefined : n })}
            />
          </div>
        </section>
      )}

      <section className="ins-section">
        <h3 className="ins-title">填充</h3>
        <FillEditor
          node={node}
          fallbackColor={isText ? '#221C00' : node.type === 'section' ? '#FFFFFF' : '#D9D9D9'}
          note={node.type === 'section' && !node.fills[0] ? '区块默认透明；选择颜色后会写入填充。' : undefined}
        />
        {(node.type === 'rect' || node.type === 'ellipse' || node.type === 'path') && <ImageFillEditor node={node} />}
      </section>

      <section className="ins-section">
        <h3 className="ins-title">描边</h3>
        {stroke ? (
          <>
            <ColorField
              color={stroke.color}
              opacity={stroke.opacity}
              disabled={node.locked}
              onCommit={(hex) => patchStroke({ color: hex })}
              onOpacity={(value) => patchStroke({ opacity: value })}
            />
            <div className="field-grid">
              <NumField
                label="宽度"
                value={stroke.width}
                min={0.1}
                max={1000}
                disabled={node.locked}
                onCommit={(n) => patchStroke({ width: n })}
              />
              <SelectField
                label="线型"
                value={strokeDash}
                disabled={node.locked}
                options={[
                  { value: 'solid', label: '实线' },
                  { value: 'dashed', label: '虚线' },
                  { value: 'dotted', label: '点线' },
                  { value: 'custom', label: '自定义' },
                ]}
                onChange={(value) => {
                  const kind = value as DashKind;
                  patchStroke({
                    dash: kind === 'custom' && stroke.dash.length > 0 ? stroke.dash : dashForKind(kind),
                  });
                }}
              />
            </div>
            <div className="stroke-controls">
              {strokeDash === 'custom' && (
                <div className="stroke-dash-custom">
                  <LineField
                    label="间距"
                    value={formatDash(stroke.dash)}
                    placeholder="例如 8 6"
                    ariaLabel="自定义虚线间距"
                    disabled={node.locked}
                    onCommit={(text) => {
                      const parsed = parseDashInput(text);
                      if (parsed) patchStroke({ dash: parsed });
                    }}
                  />
                </div>
              )}
              <div className="stroke-select-grid">
                <SelectField
                  label="端点"
                  value={stroke.cap ?? 'butt'}
                  disabled={node.locked}
                  options={[
                    { value: 'butt', label: '平头' },
                    { value: 'round', label: '圆头' },
                    { value: 'square', label: '方头' },
                  ]}
                  onChange={(value) => patchStroke({ cap: value as StrokeCap })}
                />
                <SelectField
                  label="转角"
                  value={stroke.join ?? 'miter'}
                  disabled={node.locked}
                  options={[
                    { value: 'miter', label: '尖角' },
                    { value: 'round', label: '圆角' },
                    { value: 'bevel', label: '斜角' },
                  ]}
                  onChange={(value) => patchStroke({ join: value as StrokeJoin })}
                />
              </div>
            </div>
            <button
              className="wide-action stroke-remove"
              disabled={node.locked}
              onClick={() => editor.applyPatch(node.id, { strokes: [] })}
            >
              <span>移除描边</span>
            </button>
          </>
        ) : (
          <button
            className="wide-action"
            disabled={node.locked}
            onClick={() =>
              editor.applyPatch(node.id, {
                strokes: [{ color: '#221C00', opacity: 1, width: 1, dash: [], cap: 'butt', join: 'miter' }],
              })
            }
          >
            <span>添加描边</span>
          </button>
        )}
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

      {maskState && (
        <section className="ins-section">
          <h3 className="ins-title">蒙版</h3>
          <button
            className={`wide-action${node.isMask ? ' is-mask-on' : ''}`}
            disabled={node.locked || (!node.isMask && !maskState.ok)}
            title={!node.isMask && !maskState.ok ? maskState.reason : undefined}
            onClick={() =>
              editor.applyPatch(node.id, {
                isMask: !node.isMask,
                ...(node.isMask ? {} : { maskType: node.maskType ?? 'geometry' }),
              })
            }
          >
            <span>{node.isMask ? '取消蒙版' : '用作蒙版'}</span>
          </button>
          {node.isMask && (
            <div className="fill-type-switch mask-type-switch" role="group" aria-label="蒙版类型">
              {([
                ['geometry', '轮廓'],
                ['alpha', 'Alpha'],
                ['luminance', '亮度'],
              ] as const).map(([type, label]) => (
                <button
                  key={type}
                  className={`fill-type-btn${maskTypeOf(node) === type ? ' is-on' : ''}`}
                  disabled={node.locked}
                  title={
                    type === 'geometry'
                      ? '按轮廓硬裁切，最快'
                      : type === 'alpha'
                        ? '按蒙版图层的透明度裁切'
                        : '按蒙版图层的亮度裁切'
                  }
                  onClick={() => editor.applyPatch(node.id, { maskType: type })}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className={`ins-hint mask-hint${!node.isMask && !maskState.ok ? ' is-blocked' : ''}`}>
            {node.isMask
              ? `已作为蒙版，裁切上方 ${maskState.aboveIds?.length ?? 0} 个图层`
              : maskState.ok
                ? '将裁切同容器中位于其上方的图层'
                : maskState.reason}
          </div>
        </section>
      )}

      <div className="ins-hint">{node.locked ? '节点已锁定，属性编辑已停用' : '拖动移动 · 角点缩放 · Delete 删除'}</div>
    </>
  );
}

function ImageInspector({ node }: { node: SceneNode }) {
  const s = useEditor();
  const asset = node.assetId ? s.doc.assets?.[node.assetId] : undefined;
  const kb = asset ? Math.max(1, Math.round(asset.bytes / 1024)) : 0;
  const crop = imageCropOf(node);
  const percent = cropPercent(crop);
  const cropped = !isFullImageCrop(crop);
  const cropping = s.cropId === node.id;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function replace(file: File | undefined) {
    if (!file) return;
    const projectId = getImageProjectId();
    if (!projectId) {
      setError('工程尚未保存，无法写入图片资产');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const imported = await importImageAsset(projectId, file);
      if (!editor.replaceImageAsset(node.id, imported.asset)) setError('图片已锁定，未替换');
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片替换失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="inspector-sel">
        <IconImage size={14} />
        <NameField node={node} />
        <span className="type-chip">图片</span>
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
        <h3 className="ins-title">图片</h3>
        {asset ? (
          <>
            <Row label="文件" value={asset.name} />
            <Row label="原始" value={`${asset.w} × ${asset.h}`} />
            <Row label="大小" value={`${kb} KB`} />
            <Row label="可见" value={cropped ? `${percent.w}% × ${percent.h}%` : '整张图'} />
          </>
        ) : (
          <p className="ins-note">图片资产缺失：工程 assets 目录里找不到这个文件。</p>
        )}
        <div className="ins-action-row">
          <button
            className={`wide-action${cropping ? ' is-on' : ''}`}
            disabled={node.locked || !asset}
            aria-pressed={cropping}
            title={node.locked ? '图片已锁定' : '进入裁剪模式，调整图片可见区域'}
            onClick={() => (cropping ? editor.exitImageCrop() : editor.enterImageCrop(node.id))}
          >
            <span>{cropping ? '退出裁剪' : '裁剪图片'}</span>
          </button>
          <button
            className="wide-action"
            disabled={node.locked || !asset}
            title={node.locked ? '图片已锁定' : '按原图比例修正高度'}
            onClick={() => editor.fitImageRatio(node.id)}
          >
            <span>恢复原比例</span>
          </button>
          <button
            className="wide-action"
            disabled={node.locked || busy}
            title={node.locked ? '图片已锁定' : '用新图片替换当前图片，保留位置与尺寸'}
            onClick={() => fileRef.current?.click()}
          >
            <span>{busy ? '替换中…' : '替换图片'}</span>
          </button>
          <button
            className="wide-action"
            disabled={node.locked || !cropped}
            title={cropped ? '恢复整张源图' : '当前已经是整张图'}
            onClick={() => editor.resetImageCrop(node.id)}
          >
            <span>重置裁剪</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              void replace(file);
            }}
          />
        </div>
        {cropping ? <p className="ins-note">画布拖动裁剪框移动，拖四角收放；Esc 退出，操作可撤销。</p> : null}
        {error ? <p className="ins-note">{error}</p> : null}
      </section>

      <section className="ins-section">
        <h3 className="ins-title">外观</h3>
        <div className="field-grid">
          <NumField
            label="圆角"
            value={node.cornerRadius}
            min={0}
            max={100000}
            disabled={node.locked}
            onCommit={(n) => editor.applyPatch(node.id, { cornerRadius: n })}
          />
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

      <div className="ins-hint">
        {node.locked
          ? '图片已锁定，属性编辑已停用'
          : cropping
            ? '拖动裁剪框移动 · 拖四角收放 · Esc 退出'
            : '拖动移动 · 角点缩放 · 圆角会裁切图片'}
      </div>
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
  const frames = root ? countArtboards(s.doc, root.id) : 0;

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
        ) : node.type === 'image' ? (
          <ImageInspector node={node} />
        ) : node.type === 'slice' ? (
          <SliceInspector node={node} />
        ) : (
          <ShapeInspector node={node} />
        )}
      </div>
    </aside>
  );
}

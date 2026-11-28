import { Fragment, useEffect, useRef, useState } from 'react';
import { editor, useEditor } from '../state/editor';
import { getAssetDataUrl, getImageProjectId, importImageAsset } from '../io/images';
import { exportTextFile, loadProject } from '../io/project';
import { styleTokensCss, styleTokensJson } from '../io/tokens';
import type { AutoLayout, Constraints, Effect, GromaDoc, LayoutAlign, LayoutJustify, Paint, PaintStop, SceneNode, StrokeCap, StrokeJoin, StyleKind } from '../core/types';
import { defaultAutoLayout, supportsAutoLayout } from '../core/autoLayout';
import { STYLE_KIND_LABEL, canCreateStyle, styleMatchesNode } from '../core/styles';
import { nodeCss } from '../core/css';
import { copyText } from './clipboard';
import { DEFAULT_BACKGROUND_BLUR, DEFAULT_DROP_SHADOW, DEFAULT_INNER_SHADOW, DEFAULT_LAYER_BLUR } from '../core/effects';
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
import { framesInPage } from '../core/prototype';
import { libraryComponents, variantFacets, variantLabel, variantMatchesFacet, variantOptions, variantPropertyNames, variantSetOf } from '../core/variants';
import { componentSourceState, componentTransferIssues, type ComponentSourceState } from '../core/library';
import { ancestorInstance, instancePath, overrideLabels } from '../core/instance';
import { activeModeId, canBindVariable, VARIABLE_PROP_LABEL, variableBindingProps, variableCollections, type VariableProp } from '../core/variables';
import { cornerRadiiOf, type CornerRadii } from '../core/corners';
import { addFill, fillLabel, moveFill, removeFill, toggleFillVisible, updateFill } from '../core/fills';
import {
  IconAlignBottom,
  IconAlignHCenter,
  IconAlignLeft,
  IconAlignRight,
  IconAlignTop,
  IconAlignVCenter,
  IconBoolean,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconComponent,
  IconDistributeH,  IconDistributeV,
  IconFlowHorizontal,
  IconFlowVertical,
  IconRefresh,
  IconEllipse,
  IconEye,
  IconEyeOff,
  IconPath,
  IconFrame,
  IconGroup,
  IconImage,
  IconPage,
  IconPlay,
  IconPlus,
  IconRect,
  IconSection,
  IconSlice,
  IconText,
  IconTrash,
  IconUngroup,
} from './icons';

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

const BOOLEAN_OP_OPTIONS: Array<{ op: 'union' | 'subtract' | 'intersect' | 'exclude'; label: string }> = [
  { op: 'union', label: '并集' },
  { op: 'subtract', label: '差集' },
  { op: 'intersect', label: '交集' },
  { op: 'exclude', label: '排除' },
];

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
  if (type === 'boolean') return '布尔组';
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
  if (type === 'boolean') return <IconBoolean size={size} />;
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = node.fills.length === 0 ? 0 : Math.min(selectedIndex, node.fills.length - 1);
  const fill = node.fills[activeIndex];
  const gradient = isGradientPaint(fill) ? fill : null;
  const currentType = fill?.type ?? 'solid';

  useEffect(() => {
    setSelectedIndex(0);
  }, [node.id]);

  function patchFills(next: Paint[]) {
    editor.applyPatch(node.id, { fills: next });
  }

  function patchFill(next: Paint) {
    patchFills(node.fills.length === 0 ? [next] : updateFill(node.fills, activeIndex, next));
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

  function addNewFill() {
    patchFills(addFill(node.fills, { type: 'solid', color: '#FFFFFF', opacity: 1 }));
    setSelectedIndex(0);
  }

  function removeAt(index: number) {
    const next = removeFill(node.fills, index);
    patchFills(next);
    setSelectedIndex(Math.max(0, Math.min(index, next.length - 1)));
  }

  function moveAt(delta: number) {
    const target = activeIndex + delta;
    if (target < 0 || target >= node.fills.length) return;
    patchFills(moveFill(node.fills, activeIndex, delta));
    setSelectedIndex(target);
  }

  const fillName = (paint: Paint) => (paint.type === 'solid' ? '纯色' : paint.type === 'linear' ? '线性' : '径向');

  return (
    <>
      {note ? <p className="ins-note">{note}</p> : null}
      <div className="fill-stack-head">
        <span className="fill-stack-count">{fillLabel(node.fills)}</span>
        <button type="button" className="mini-action" disabled={node.locked || node.fills.length >= 16} onClick={addNewFill}>
          添加填充
        </button>
      </div>
      {node.fills.length > 0 && (
        <div className="fill-stack-list">
          {node.fills.map((paint, index) => (
            <div className={`fill-row ${index === activeIndex ? 'is-on' : ''} ${paint.visible === false ? 'is-hidden' : ''}`} key={`${index}-${paint.type}`}>
              <button
                type="button"
                className="fill-row-main"
                aria-label={`编辑第 ${index + 1} 层填充`}
                aria-pressed={index === activeIndex}
                onClick={() => setSelectedIndex(index)}
              >
                <span className="fill-row-swatch" style={{ background: paintPreview(paint, node.w, node.h) }} />
                <span className="fill-row-name">{fillName(paint)}</span>
                <span className="fill-row-value">{paint.type === 'solid' ? paint.color.toUpperCase() : `${paint.stops.length} 色标`}</span>
              </button>
              <button
                type="button"
                className="fill-row-icon"
                title={paint.visible === false ? '显示这一层' : '隐藏这一层'}
                aria-label={paint.visible === false ? '显示填充' : '隐藏填充'}
                aria-pressed={paint.visible !== false}
                disabled={node.locked}
                onClick={() => patchFills(toggleFillVisible(node.fills, index))}
              >
                {paint.visible === false ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </button>
              <button
                type="button"
                className="fill-row-icon"
                title="删除这一层"
                aria-label={`删除第 ${index + 1} 层填充`}
                disabled={node.locked}
                onClick={() => removeAt(index)}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {node.fills.length > 1 && (
        <div className="fill-order-row">
          <button type="button" className="mini-action" disabled={node.locked || activeIndex === 0} onClick={() => moveAt(-1)}>
            上移一层
          </button>
          <button type="button" className="mini-action" disabled={node.locked || activeIndex === node.fills.length - 1} onClick={() => moveAt(1)}>
            下移一层
          </button>
        </div>
      )}
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
          <p className="ins-note gradient-canvas-hint">
            {gradient.type === 'linear'
              ? '画布上拖两端改角度与范围，拖线上方圆环移动整条渐变，拖中间色标改色标位置。'
              : '画布上拖圆心移动位置，拖外圈改半径。'}
          </p>
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
            {gradient.type === 'linear'
              ? '角度按顺时针计；Shift 按 15° 吸附，色标位置按渐变长度计算。'
              : '色标位置按半径比例计算。'}
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

function EffectsEditor({ node }: { node: SceneNode }) {
  const effects = node.effects ?? [];
  const disabled = node.locked;

  function patchEffect(index: number, next: Effect) {
    editor.applyPatch(node.id, { effects: effects.map((effect, i) => (i === index ? next : effect)) });
  }

  function removeEffect(index: number) {
    const next = effects.filter((_, i) => i !== index);
    editor.applyPatch(node.id, { effects: next.length > 0 ? next : undefined });
  }

  function addEffect(effect: Effect) {
    editor.applyPatch(node.id, { effects: [...effects, effect] });
  }

  return (
    <section className="ins-section">
      <h3 className="ins-title">效果</h3>
      <div className="effects-block">
        {effects.map((effect, index) => (
          <div className={`effect-card${effect.visible ? '' : ' is-off'}`} key={`${effect.type}-${index}`}>
            <div className="effect-head">
              <span className="effect-type">
                {effect.type === 'drop-shadow'
                  ? '投影'
                  : effect.type === 'inner-shadow'
                    ? '内阴影'
                    : effect.type === 'layer-blur'
                      ? '整层模糊'
                      : '背景模糊'}
              </span>
              <button
                className="mini-action"
                disabled={disabled}
                onClick={() => patchEffect(index, { ...effect, visible: !effect.visible })}
              >
                {effect.visible ? '隐藏' : '显示'}
              </button>
              <button className="mini-action effect-remove" disabled={disabled} onClick={() => removeEffect(index)}>
                移除
              </button>
            </div>
            {effect.type === 'drop-shadow' || effect.type === 'inner-shadow' ? (
              <>
                <ColorField
                  color={effect.color}
                  opacity={effect.opacity}
                  disabled={disabled}
                  onCommit={(hex) => patchEffect(index, { ...effect, color: hex })}
                  onOpacity={(value) => patchEffect(index, { ...effect, opacity: value })}
                />
                <div className="field-grid">
                  <NumField
                    label="X"
                    value={effect.x}
                    disabled={disabled}
                    onCommit={(n) => patchEffect(index, { ...effect, x: n })}
                  />
                  <NumField
                    label="Y"
                    value={effect.y}
                    disabled={disabled}
                    onCommit={(n) => patchEffect(index, { ...effect, y: n })}
                  />
                  <NumField
                    label="模糊"
                    value={effect.blur}
                    min={0}
                    max={1000}
                    disabled={disabled}
                    onCommit={(n) => patchEffect(index, { ...effect, blur: n })}
                  />
                </div>
              </>
            ) : (
              <div className="field-grid">
                <NumField
                  label="半径"
                  value={effect.blur}
                  min={0}
                  max={1000}
                  disabled={disabled}
                  onCommit={(n) => patchEffect(index, { ...effect, blur: n })}
                />
              </div>
            )}
          </div>
        ))}
        {effects.length === 0 && <p className="ins-note">整层模糊糊图层自己，背景模糊糊身后的画面；内阴影画在图层内部。它们和填充是两回事。</p>}
        <div className="effect-add-row">
          <button
            className="mini-action"
            disabled={disabled}
            onClick={() => addEffect({ ...DEFAULT_DROP_SHADOW })}
          >
            ＋ 投影
          </button>
          <button
            className="mini-action"
            disabled={disabled}
            onClick={() => addEffect({ ...DEFAULT_INNER_SHADOW })}
          >
            ＋ 内阴影
          </button>
          <button
            className="mini-action"
            disabled={disabled}
            onClick={() => addEffect({ ...DEFAULT_LAYER_BLUR })}
          >
            ＋ 模糊
          </button>
          <button
            className="mini-action"
            disabled={disabled}
            onClick={() => addEffect({ ...DEFAULT_BACKGROUND_BLUR })}
          >
            ＋ 背景模糊
          </button>
        </div>
      </div>
    </section>
  );
}

function CornerRadiusEditor({ node, radius = true, title }: { node: SceneNode; radius?: boolean; title: string }) {
  const radii = cornerRadiiOf(node);
  const independent = node.cornerRadii !== undefined;
  const patchCorner = (index: number, value: number) => {
    const next = [...radii] as CornerRadii;
    next[index] = value;
    editor.applyPatch(node.id, { cornerRadii: next, cornerRadius: Math.max(...next) });
  };
  return (
    <>
      <div className="ins-title-row">
        <h3 className="ins-title">{title}</h3>
        {radius && (
          <button
            className="link-btn corner-toggle"
            disabled={node.locked}
            title={independent ? '回到四角统一圆角' : '分别设置左上、右上、右下、左下'}
            onClick={() =>
              independent
                ? editor.applyPatch(node.id, { cornerRadius: radii[0], cornerRadii: undefined })
                : editor.applyPatch(node.id, { cornerRadii: [node.cornerRadius, node.cornerRadius, node.cornerRadius, node.cornerRadius] })
            }
          >
            {independent ? '统一圆角' : '四角独立'}
          </button>
        )}
      </div>
      <div className="field-grid">
        {radius && (independent ? (
          (['左上', '右上', '右下', '左下'] as const).map((label, index) => (
            <NumField
              key={label}
              label={label}
              value={radii[index]}
              min={0}
              max={100000}
              disabled={node.locked}
              onCommit={(value) => patchCorner(index, value)}
            />
          ))
        ) : (
          <NumField
            label="圆角"
            value={node.cornerRadius}
            min={0}
            max={100000}
            disabled={node.locked}
            onCommit={(value) => editor.applyPatch(node.id, { cornerRadius: value, cornerRadii: undefined })}
          />
        ))}
        <NumField
          label="透明"
          value={Math.round(node.opacity * 100)}
          min={0}
          max={100}
          disabled={node.locked}
          onCommit={(value) => editor.applyPatch(node.id, { opacity: value / 100 })}
        />
      </div>
    </>
  );
}

function StylesSection({ node }: { node: SceneNode }) {
  const s = useEditor();
  const [copied, setCopied] = useState('');
  const [exporting, setExporting] = useState(false);
  const styles = Object.values(s.doc.styles ?? {});
  const kinds: StyleKind[] = [];
  if (node.type === 'rect' || node.type === 'ellipse' || node.type === 'text' || node.type === 'path' || node.type === 'boolean' || node.type === 'frame' || node.type === 'section') {
    kinds.push('fill');
  }
  if (node.type === 'rect' || node.type === 'ellipse' || node.type === 'text' || node.type === 'path' || node.type === 'boolean') kinds.push('stroke');
  if (node.type !== 'slice') kinds.push('effect');
  if (node.type === 'text') kinds.push('text');
  if (kinds.length === 0) return null;

  return (
    <section className="ins-section">
      <div className="ins-title-row">
        <h3 className="ins-title">样式</h3>
        <span className="style-count">{styles.length} 个</span>
      </div>
      {kinds.map((kind) => {
        const kindStyles = styles.filter((style) => style.kind === kind);
        const currentId = node.styleRefs?.[kind] ?? '';
        const current = currentId ? styles.find((style) => style.id === currentId) : undefined;
        const dirty = Boolean(current && canCreateStyle(kind, node) && !styleMatchesNode(current, node));
        const linked = current
          ? Object.values(s.doc.nodes).filter((item) => item.styleRefs?.[kind] === current.id).length
          : 0;
        return (
          <div className="style-block" key={kind}>
            <div className="style-row">
              <span className="style-label">{STYLE_KIND_LABEL[kind]}</span>
              <select
                className="style-select"
                aria-label={`${STYLE_KIND_LABEL[kind]}样式`}
                value={currentId}
                disabled={node.locked}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (!value) editor.detachStyle(kind, node.id);
                  else editor.applyStyle(value, node.id);
                }}
              >
                <option value="">未绑定</option>
                {kindStyles.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mini-action"
                disabled={node.locked || !canCreateStyle(kind, node)}
                title={canCreateStyle(kind, node) ? '把当前属性存成命名样式' : '当前没有可保存的样式属性'}
                onClick={() => editor.createStyle(kind, node.id)}
              >
                存为样式
              </button>
            </div>
            {current && (
              <div className="style-status-row">
                <span className={`style-status ${dirty ? 'is-dirty' : ''}`}>
                  {dirty ? '已偏离样式' : '已绑定'} · {linked} 个图层
                </span>
                {dirty && (
                  <button type="button" className="link-btn" disabled={node.locked} onClick={() => editor.updateStyle(current.id, node.id)}>
                    同步到样式
                  </button>
                )}
                <button type="button" className="link-btn" disabled={node.locked} onClick={() => editor.detachStyle(kind, node.id)}>
                  解除
                </button>
                <button type="button" className="link-btn" disabled={node.locked} onClick={() => editor.deleteStyle(current.id)}>
                  删除
                </button>
              </div>
            )}
          </div>
        );
      })}
      {styles.length > 0 && (
        <div className="style-token-actions">
          <button
            type="button"
            className="mini-action"
            title="把命名样式复制为 CSS 变量，可直接粘进项目"
            onClick={() => {
              copyText(styleTokensCss(s.doc)).then(
                (ok) => {
                  setCopied(ok ? '已复制' : '复制失败');
                  if (ok) window.setTimeout(() => setCopied(''), 1800);
                },
                () => setCopied('复制失败'),
              );
            }}
          >
            {copied === '已复制' || copied === '复制失败' ? copied : '复制变量'}
          </button>
          <button
            type="button"
            className="mini-action"
            title="把令牌写成 .css 与 .json 文件，放到工程 exports 目录"
            disabled={exporting || !s.projectId}
            onClick={() => {
              if (!s.projectId || exporting) return;
              setExporting(true);
              setCopied('');
              const base = `${s.doc.name} 设计令牌`;
              Promise.all([
                exportTextFile(s.projectId, base, 'css', styleTokensCss(s.doc)),
                exportTextFile(s.projectId, base, 'json', styleTokensJson(s.doc)),
              ]).then(
                () => {
                  setExporting(false);
                  setCopied('已导出 CSS + JSON');
                  window.setTimeout(() => setCopied(''), 2200);
                },
                (e: unknown) => {
                  setExporting(false);
                  setCopied(`导出失败：${e instanceof Error ? e.message : String(e)}`);
                },
              );
            }}
          >
            {exporting ? '导出中…' : '导出令牌'}
          </button>
        </div>
      )}
      {copied && copied !== '已复制' && (
        <div className={`style-token-status${copied.startsWith('导出失败') ? ' is-error' : ''}`}>{copied}</div>
      )}
      <p className="ins-note">样式为文档级命名预设；修改图层后可“同步到样式”，一次更新所有绑定图层。</p>
    </section>
  );
}

function CssSection({ node }: { node: SceneNode }) {
  const s = useEditor();
  const [copied, setCopied] = useState(false);
  const css = nodeCss(s.doc, node.id);
  if (!css) return null;
  return (
    <section className="ins-section">
      <div className="ins-title-row">
        <h3 className="ins-title">代码</h3>
        <button
          type="button"
          className="mini-action"
          title="复制这个图层的 CSS，定位相对父画板"
          onClick={() => {
            copyText(css).then(
              (ok) => {
                setCopied(ok);
                if (ok) window.setTimeout(() => setCopied(false), 1800);
              },
              () => setCopied(false),
            );
          }}
        >
          {copied ? '已复制' : '复制 CSS'}
        </button>
      </div>
      <pre className="css-preview">{css}</pre>
    </section>
  );
}

function LayoutChildSection({ node }: { node: SceneNode }) {
  const s = useEditor();
  const parent = node.parentId ? s.doc.nodes[node.parentId] : undefined;
  if (!parent?.layout) return null;
  const horizontal = parent.layout.mode === 'horizontal';
  const mainFill = Boolean(node.layoutGrow);
  const crossFill = node.layoutAlignSelf === 'stretch' || (!node.layoutAlignSelf && parent.layout.align === 'stretch');
  return (
    <section className="ins-section">
      <div className="ins-title-row">
        <h3 className="ins-title">布局尺寸</h3>
        <span className="type-chip">自动布局子层</span>
      </div>
      <div className="auto-layout-checks">
        <label className="auto-layout-check">
          <input
            type="checkbox"
            checked={mainFill}
            disabled={node.locked}
            onChange={(e) => {
              const on = e.target.checked;
              const nextBase = horizontal
                ? { layoutBaseW: node.layoutBaseW ?? node.w }
                : { layoutBaseH: node.layoutBaseH ?? node.h };
              const restore = horizontal
                ? node.layoutBaseW
                  ? { w: node.layoutBaseW }
                  : {}
                : node.layoutBaseH
                  ? { h: node.layoutBaseH }
                  : {};
              editor.applyPatch(node.id, on
                ? { layoutGrow: true, ...nextBase }
                : {
                    layoutGrow: undefined,
                    ...restore,
                    ...(horizontal ? { layoutBaseW: undefined } : { layoutBaseH: undefined }),
                  });
            }}
          />
          <span>{horizontal ? '横向' : '纵向'}填满剩余</span>
        </label>
        <label className="auto-layout-check">
          <input
            type="checkbox"
            checked={crossFill}
            disabled={node.locked}
            onChange={(e) => {
              const on = e.target.checked;
              const nextBase = horizontal
                ? { layoutBaseH: node.layoutBaseH ?? node.h }
                : { layoutBaseW: node.layoutBaseW ?? node.w };
              const restore = horizontal
                ? node.layoutBaseH
                  ? { h: node.layoutBaseH, layoutBaseH: undefined }
                  : {}
                : node.layoutBaseW
                  ? { w: node.layoutBaseW, layoutBaseW: undefined }
                  : {};
              editor.applyPatch(node.id, {
                layoutAlignSelf: on
                  ? 'stretch'
                  : parent.layout?.align === 'stretch'
                    ? 'start'
                    : undefined,
                ...(on ? nextBase : restore),
              });
            }}
          />
          <span>{horizontal ? '纵向' : '横向'}填满</span>
        </label>
      </div>
      <p className="ins-note">Fill 吃掉父级剩余空间；父级“适应主轴”时，主轴 Fill 不生效。</p>
    </section>
  );
}

function AutoLayoutSection({ node }: { node: SceneNode }) {
  if (!supportsAutoLayout(node)) return null;
  const layout = node.layout;
  const disabled = node.locked;
  const update = (next: Partial<AutoLayout>) => {
    if (!layout) return;
    editor.applyPatch(node.id, { layout: { ...layout, ...next } });
  };
  const updatePadding = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
    if (!layout) return;
    update({ padding: { ...layout.padding, [side]: value } });
  };
  const hugWidth = layout ? layout.hugWidth ?? (layout.mode === 'horizontal' && layout.hug) : false;
  const hugHeight = layout ? layout.hugHeight ?? (layout.mode === 'vertical' && layout.hug) : false;
  const updateHug = (axis: 'width' | 'height', value: boolean) => {
    if (!layout) return;
    update({
      hug: false,
      hugWidth: axis === 'width' ? value : hugWidth,
      hugHeight: axis === 'height' ? value : hugHeight,
    });
  };

  return (
    <section className="ins-section">
      <div className="ins-title-row">
        <h3 className="ins-title">自动布局</h3>
        {layout ? (
          <div className="auto-layout-head-actions">
            <button
              type="button"
              className="auto-layout-icon-btn"
              title="重排"
              aria-label="重排"
              disabled={disabled}
              onClick={() => editor.applyPatch(node.id, { layout: { ...layout } })}
            >
              <IconRefresh size={14} />
            </button>
            <button
              type="button"
              className="auto-layout-icon-btn"
              title="关闭自动布局"
              aria-label="关闭自动布局"
              disabled={disabled}
              onClick={() => editor.applyPatch(node.id, { layout: undefined })}
            >
              <IconClose size={14} />
            </button>
          </div>
        ) : null}
      </div>
      {!layout ? (
        <>
          <button type="button" className="wide-action" disabled={disabled} onClick={() => editor.applyPatch(node.id, { layout: defaultAutoLayout() })}>
            <IconFlowHorizontal size={15} />
            <span>开启自动布局</span>
          </button>
          <p className="ins-note">子层会按方向、间距与内边距自动排列；画布拖动交给布局，尺寸仍可改。</p>
        </>
      ) : (
        <>
          <div className="auto-layout-mode" role="group" aria-label="自动布局方向">
            {([
              ['horizontal', '横向'],
              ['vertical', '纵向'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`auto-layout-mode-btn${layout.mode === mode ? ' is-on' : ''}`}
                disabled={disabled}
                onClick={() => update({ mode })}
              >
                {mode === 'horizontal' ? <IconFlowHorizontal size={14} /> : <IconFlowVertical size={14} />}
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="field-grid auto-layout-numbers">
            <NumField label="间距" value={layout.gap} min={0} max={10000} disabled={disabled} onCommit={(n) => update({ gap: n })} />
          </div>
          <div className="auto-layout-padding">
            <span className="auto-layout-padding-label">内边距</span>
            <div className="field-grid">
              <NumField label="上" value={layout.padding.top} min={0} max={100000} disabled={disabled} onCommit={(n) => updatePadding('top', n)} />
              <NumField label="右" value={layout.padding.right} min={0} max={100000} disabled={disabled} onCommit={(n) => updatePadding('right', n)} />
              <NumField label="下" value={layout.padding.bottom} min={0} max={100000} disabled={disabled} onCommit={(n) => updatePadding('bottom', n)} />
              <NumField label="左" value={layout.padding.left} min={0} max={100000} disabled={disabled} onCommit={(n) => updatePadding('left', n)} />
            </div>
          </div>
          <div className="field-grid">
            <SelectField
              label="交叉轴"
              value={layout.align}
              disabled={disabled}
              options={[
                { value: 'start', label: '起始' },
                { value: 'center', label: '居中' },
                { value: 'end', label: '末尾' },
                { value: 'stretch', label: '拉伸' },
              ]}
              onChange={(value) => update({ align: value as LayoutAlign })}
            />
            <SelectField
              label="主轴"
              value={layout.justify}
              disabled={disabled}
              options={[
                { value: 'start', label: '起始' },
                { value: 'center', label: '居中' },
                { value: 'end', label: '末尾' },
                { value: 'space-between', label: '两端' },
              ]}
              onChange={(value) => update({ justify: value as LayoutJustify })}
            />
          </div>
          <div className="auto-layout-checks">
            <label className="auto-layout-check">
              <input type="checkbox" checked={hugWidth} disabled={disabled} onChange={(e) => updateHug('width', e.target.checked)} />
              <span>适应宽度</span>
            </label>
            <label className="auto-layout-check">
              <input type="checkbox" checked={hugHeight} disabled={disabled} onChange={(e) => updateHug('height', e.target.checked)} />
              <span>适应高度</span>
            </label>
          </div>
          <p className="ins-note">子层顺序按图层从下到上；拖动子层不改坐标，改尺寸会立即重排。</p>
        </>
      )}
    </section>
  );
}

function PrototypeSection({ node }: { node: SceneNode }) {
  const s = useEditor();
  const page = s.doc.pages.find((item) => item.id === s.pageId) ?? s.doc.pages[0];
  const frames = framesInPage(s.doc, page).filter((frame) => frame.id !== node.id);
  const linked = node.prototype?.targetId ?? '';
  const missing = Boolean(linked && !s.doc.nodes[linked]);

  return (
    <section className="ins-section">
      <div className="ins-title-row">
        <h3 className="ins-title">原型</h3>
        <span className="style-count">{linked ? '点击' : '无交互'}</span>
      </div>
      <label className="proto-target-row">
        <span className="field-label">点击跳转</span>
        <select
          className="proto-select"
          value={linked}
          disabled={node.locked || frames.length === 0}
          aria-label="原型跳转目标"
          onChange={(event) => editor.setPrototypeTarget(node.id, event.currentTarget.value)}
        >
          <option value="">{frames.length === 0 ? '当前页没有其他画板' : '无'}</option>
          {missing && <option value={linked}>目标已失效</option>}
          {frames.map((frame) => (
            <option key={frame.id} value={frame.id}>
              {frame.name}
            </option>
          ))}
        </select>
      </label>
      <div className="ins-action-row component-actions">
        <button type="button" className="wide-action" disabled={!framesInPage(s.doc, page).length} onClick={() => editor.openPrototype()}>
          <IconPlay size={15} />
          <span>演示</span>
        </button>
      </div>
      <p className="ins-note">选中画板或画板内任意图层后演示；点击热区跳转，Esc 退出。</p>
    </section>
  );
}

function VariablesSection({ node }: { node: SceneNode }) {
  const s = useEditor();
  const collections = variableCollections(s.doc);
  if (collections.length === 0) return null;
  const all = collections.flatMap((collection) =>
    Object.values(collection.variables).map((variable) => ({ collection, variable })),
  );
  const colors = all.filter((item) => canBindVariable(item.variable, 'fill'));
  const numbers = all.filter((item) => canBindVariable(item.variable, 'cornerRadius'));
  const supported = variableBindingProps(node);
  const visibleProps = supported.filter((prop) => (prop === 'fill' || prop === 'stroke' ? colors.length > 0 : numbers.length > 0));
  if (visibleProps.length === 0) return null;
  const optionsFor = (prop: VariableProp) =>
    (prop === 'fill' || prop === 'stroke' ? colors : numbers).map(({ collection, variable }) => ({
      value: variable.id,
      label: `${collection.name} / ${variable.name}`,
    }));

  return (
    <section className="ins-section">
      <div className="ins-title-row">
        <h3 className="ins-title">变量</h3>
        <span className="style-count">{collections.length} 集合</span>
      </div>
      {visibleProps.map((prop) => (
        <SelectField
          key={prop}
          label={VARIABLE_PROP_LABEL[prop]}
          value={(node.variableBindings?.[prop] ?? '') || 'none'}
          disabled={node.locked}
          options={[
            { value: 'none', label: '未绑定' },
            ...optionsFor(prop),
          ]}
          onChange={(value) => (value === 'none' ? editor.clearVariableBinding(prop) : editor.bindVariable(prop, value))}
        />
      ))}
      {collections.map((collection) => (
        <Row
          key={collection.id}
          label={collection.name}
          value={collection.modes.find((mode) => mode.id === activeModeId(s.doc, collection))?.name ?? '默认'}
        />
      ))}
      <p className="ins-note">绑定后改 Mode 会刷新已绑定属性；内边距变量写入四边同值，值仍是本地工程里的字面量，导出不依赖网络。</p>
    </section>
  );
}

function VariantSetSection({ node }: { node: SceneNode }) {
  const s = useEditor();
  const [propDraft, setPropDraft] = useState('');
  const [facetIndex, setFacetIndex] = useState(0);
  const options = variantOptions(s.doc, node.id);
  const names = variantPropertyNames(s.doc, node.id);
  const first = names[0];
  const second = names[1];
  const extraNames = names.slice(2);
  const values = (name: string) => [...new Set(options.map((option) => option.props[name]).filter((value): value is string => Boolean(value)))];
  const rows = first ? values(first) : [];
  const cols = second ? values(second) : [];
  const combos = first && second ? rows.flatMap((row) => cols.map((col) => ({ row, col }))) : [];
  const facets = variantFacets(options, extraNames);
  const facetCursor = Math.min(facetIndex, Math.max(0, facets.length - 1));
  const facetValues = facets[facetCursor]?.values ?? {};
  const inFacet = (option: (typeof options)[number]) => variantMatchesFacet(option, extraNames, facetValues);
  const filledInFacet = options.filter((option) => option.props[first] && option.props[second] && inFacet(option)).length;
  return (
    <section className="ins-section">
      <div className="ins-title-row">
        <h3 className="ins-title">组件</h3>
        <span className="style-count">变体集</span>
      </div>
      <Row label="变体" value={`${options.length} 个`} />
      {names.length > 0 ? (
        <div className="variant-property-chips">
          {names.map((name) => (
            <span className="variant-property-chip" key={name}>
              {name}
              <em>{values(name).length}</em>
            </span>
          ))}
        </div>
      ) : null}
      <div className="variant-prop-add">
        <input
          className="field-input"
          value={propDraft}
          placeholder="新属性名，如 尺寸"
          disabled={node.locked}
          onChange={(e) => setPropDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (editor.addVariantProperty(propDraft)) setPropDraft('');
          }}
        />
        <button
          type="button"
          className="mini-action"
          disabled={node.locked || !propDraft.trim()}
          onClick={() => {
            if (editor.addVariantProperty(propDraft)) setPropDraft('');
          }}
        >
          添加属性
        </button>
      </div>
      {first && second ? (
        <>
          {extraNames.length > 0 && facets.length > 0 ? (
            <SelectField
              label={extraNames.length === 1 ? extraNames[0] : '其余属性'}
              value={String(facetCursor)}
              disabled={node.locked}
              options={facets.map((facet, index) => ({
                value: String(index),
                label: extraNames.length === 1 ? facet.values[extraNames[0]] || '空' : facet.label,
              }))}
              onChange={(value) => setFacetIndex(Number(value))}
            />
          ) : null}
          <div className="ins-title-row variant-matrix-head">
            <span>组合</span>
            <span className="style-count">
              {filledInFacet} / {combos.length}
            </span>
          </div>
          <div className="variant-matrix" style={{ gridTemplateColumns: `68px repeat(${cols.length}, minmax(0, 1fr))` }}>
            <div className="variant-matrix-corner">
              {first} / {second}
            </div>
            {cols.map((col) => (
              <div className="variant-matrix-axis" key={`col-${col}`} title={`${second}：${col}`}>
                {col}
              </div>
            ))}
            {rows.map((row) => (
              <Fragment key={`row-${row}`}>
                <div className="variant-matrix-axis" title={`${first}：${row}`}>
                  {row}
                </div>
                {cols.map((col) => {
                  const option = options.find((item) => item.props[first] === row && item.props[second] === col && inFacet(item));
                  return option ? (
                    <button
                      type="button"
                      key={`${row}-${col}`}
                      className={`variant-matrix-cell is-filled${s.selectedId === option.id ? ' is-selected' : ''}`}
                      title={`${first}：${row} · ${second}：${col}`}
                      onClick={() => editor.select(option.id)}
                    >
                      ✓
                    </button>
                  ) : (
                    <button
                      type="button"
                      key={`${row}-${col}`}
                      className="variant-matrix-cell"
                      title={`新增组合：${first} ${row} / ${second} ${col}`}
                      onClick={() =>
                        editor.addVariantCombo(
                          { ...(options[0]?.props ?? {}), [first]: row, [second]: col, ...facetValues },
                          options[0]?.id,
                        )
                      }
                    >
                      +
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </>
      ) : null}
      <p className="ins-note">
        {names.length > 2
          ? '组合矩阵画前两个属性，其余属性用上方筛选；点空格会复制当前变体并带上筛选值。'
          : '添加属性后，点空组合格可复制当前变体并生成新组合；切换仍只在同一变体集内生效。'}
      </p>
    </section>
  );
}

function InstanceOverrideSection({ node }: { node: SceneNode }) {
  const s = useEditor();
  const instance = ancestorInstance(s.doc, node.id);
  if (!instance) return null;
  const path = instancePath(s.doc, instance.id, node.id);
  if (!path) return null;
  const override = instance.instanceOverrides?.[path];
  const labels = overrideLabels(override);
  return (
    <section className="ins-section instance-override">
      <div className="instance-override-head">
        <h3 className="ins-title">实例覆盖</h3>
        <span className={`instance-override-state${labels.length ? ' is-on' : ''}`}>{labels.length ? '已覆盖' : '随主组件'}</span>
      </div>
      <div className="instance-override-path">
        <span className="instance-override-name">{instance.name}</span>
        <span className="instance-override-route">路径 {path}</span>
      </div>
      {labels.length > 0 && (
        <div className="instance-override-chips">
          {labels.map((label) => (
            <span className="instance-override-chip" key={label}>
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="ins-action-row instance-override-actions">
        <button className="wide-action" onClick={() => editor.select(instance.id)}>
          <IconComponent size={15} />
          <span>选中实例</span>
        </button>
        {labels.length > 0 && (
          <button className="wide-action" onClick={() => editor.resetInstanceOverride()} title="从主组件恢复这一层并保留其他覆盖">
            <span>重置此层</span>
          </button>
        )}
      </div>
      <div className="instance-override-hint">改文字、填充、尺寸只记在当前实例，同步主组件不会丢；重置后回到主组件内容。</div>
    </section>
  );
}

function ComponentSection({ node }: { node: SceneNode }) {
  const s = useEditor();
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceNotice, setSourceNotice] = useState('');
  const [sourceState, setSourceState] = useState<ComponentSourceState | 'checking'>('checking');
  const [sourceDoc, setSourceDoc] = useState<GromaDoc | null>(null);
  const source = node.librarySource;
  useEffect(() => {
    if (!source) {
      setSourceDoc(null);
      return;
    }
    let live = true;
    setSourceState('checking');
    setSourceNotice('');
    loadProject(source.projectId)
      .then((doc) => {
        if (!live) return;
        setSourceDoc(doc);
        setSourceState(componentSourceState(s.doc, node.id, doc, source.nodeId));
      })
      .catch(() => {
        if (live) setSourceState('missing');
      });
    return () => {
      live = false;
    };
  }, [node.id, source?.projectId, source?.nodeId]);
  useEffect(() => {
    if (!source || !sourceDoc) return;
    setSourceState(componentSourceState(s.doc, node.id, sourceDoc, source.nodeId));
  }, [s.doc, sourceDoc, node.id, source?.nodeId]);
  if (node.type !== 'frame') return null;
  const instanceCount = Object.values(s.doc.nodes).filter((item) => item.componentOf === node.id).length;
  const master = node.componentOf ? s.doc.nodes[node.componentOf] : null;
  const masterMissing = Boolean(node.componentOf && (!master || !master.isComponent));
  const variantSet = variantSetOf(s.doc, node);
  const sourceStateText: Record<ComponentSourceState | 'checking', string> = {
    checking: '正在检查来源…',
    same: '已是最新',
    changed: '内容有差异',
    'source-updated': `来源已发布新版本（本地 v${source?.version ?? 0}）`,
    missing: '来源工程不可用',
    blocked: '来源含外部依赖',
  };

  async function refreshFromSource() {
    if (!source) return;
    setSourceBusy(true);
    setSourceNotice('');
    let doc: GromaDoc;
    try {
      doc = await loadProject(source.projectId);
    } catch {
      setSourceState('missing');
      setSourceNotice('来源工程不可用');
      setSourceBusy(false);
      return;
    }
    try {
      const issues = componentTransferIssues(doc, source.nodeId);
      if (issues.length > 0) {
        setSourceState('blocked');
        throw new Error(`来源含${issues.join('、')}，不能直接更新`);
      }
      setSourceDoc(doc);
      const ok = editor.refreshExternalComponent(doc, source.nodeId, node.id);
      if (!ok) {
        setSourceState('missing');
        throw new Error('来源主组件已删除或更新失败');
      }
      setSourceState('same');
      setSourceNotice('已从来源更新，实例同步完成');
    } catch (err) {
      setSourceNotice(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSourceBusy(false);
    }
  }

  function detachSource() {
    if (!source) return;
    editor.applyPatch(node.id, { librarySource: undefined });
    setSourceNotice('已断开本地库来源，主组件保留');
  }

  if (node.isVariantSet) {
    return <VariantSetSection key={node.id} node={node} />;
  }

  if (node.variantSetId && node.isComponent) {
    const options = variantSet ? variantOptions(s.doc, node.variantSetId) : [];
    return (
      <section className="ins-section">
        <div className="ins-title-row">
          <h3 className="ins-title">组件</h3>
          <span className="style-count">变体</span>
        </div>
        <Row label="变体集" value={variantSet?.name ?? '已失效'} />
        {Object.entries(node.variantProps ?? {}).map(([prop, value]) => (
          <label className="field" key={prop}>
            <span className="field-label">{prop}</span>
            <input
              key={`${node.id}-${prop}-${value}`}
              className="field-input"
              defaultValue={value}
              disabled={node.locked}
              onBlur={(e) => {
                const next = e.currentTarget.value.trim();
                if (next && next !== value) editor.renameVariantProperty(prop, next);
              }}
            />
          </label>
        ))}
        <Row label="集内变体" value={`${options.length} 个`} />
        <div className="ins-action-row component-actions">
          <button type="button" className="wide-action" disabled={node.locked} onClick={() => editor.createComponentInstance()}>
            <IconGroup size={15} />
            <span>创建实例</span>
          </button>
          <button type="button" className="wide-action" disabled={node.locked} onClick={() => editor.addVariant()}>
            <IconPlus size={15} />
            <span>新增变体</span>
          </button>
        </div>
        <p className="ins-note">新增变体会复制当前变体内容；实例在变体集外侧生成。</p>
      </section>
    );
  }

  if (!node.isComponent && !node.componentOf) {
    return (
      <section className="ins-section">
        <h3 className="ins-title">组件</h3>
        <button type="button" className="wide-action" disabled={node.locked} onClick={() => editor.createComponent()}>
          <IconComponent size={15} />
          <span>创建组件</span>
        </button>
        <p className="ins-note">把选中画板变成主组件；多选两个以上主组件可在选区面板合并为变体集。</p>
      </section>
    );
  }

  if (node.componentOf) {
    const variantSource = variantSetOf(s.doc, node);
    const options = variantSource ? variantOptions(s.doc, variantSource.id) : [];
    const swapOptions = libraryComponents(s.doc)
      .filter((item) => item.id !== node.id)
      .map((item) => ({
        value: item.id,
        label: item.variantSetId ? `${item.name} · ${item.variantLabel}` : item.name,
      }));
    return (
      <section className="ins-section">
        <div className="ins-title-row">
          <h3 className="ins-title">组件</h3>
          <span className="style-count">实例</span>
        </div>
        <Row label="主组件" value={master ? variantLabel(master) : '已失效'} />
        {swapOptions.length > 0 ? (
          <SelectField
            label="替换组件"
            value={master?.id ?? ''}
            disabled={node.locked || masterMissing}
            options={swapOptions}
            onChange={(value) => editor.swapComponentInstance(value)}
          />
        ) : null}
        {variantSource ? (
          <SelectField
            label="变体"
            value={node.componentOf ?? ''}
            disabled={node.locked || masterMissing}
            options={options.map((option) => ({ value: option.id, label: option.props ? Object.values(option.props).join(' / ') : option.name }))}
            onChange={(value) => editor.switchVariant(value)}
          />
        ) : null}
        <div className="ins-action-row component-actions">
          <button type="button" className="wide-action" disabled={node.locked || masterMissing} onClick={() => editor.syncComponentInstance()}>
            <IconRefresh size={15} />
            <span>同步主组件</span>
          </button>
          <button type="button" className="wide-action" disabled={node.locked} onClick={() => editor.detachComponentInstance()}>
            <IconUngroup size={15} />
            <span>脱离组件</span>
          </button>
        </div>
        <button type="button" className="link-btn component-master-link" disabled={!master} onClick={() => editor.selectComponentMaster()}>
          选中主组件
        </button>
        <p className="ins-note">切换变体会保留实例位置，采用目标变体的尺寸与内容；替换组件同样保留位置，同路径同类型同名的覆盖继续沿用。</p>
      </section>
    );
  }

  return (
    <section className="ins-section">
      <div className="ins-title-row">
        <h3 className="ins-title">组件</h3>
        <span className="style-count">主组件</span>
      </div>
      <Row label="实例" value={`${instanceCount} 个`} />
      {source ? (
        <>
          <Row label="本地库" value={`${source.projectName} / ${source.nodeName}`} />
          <Row label="来源状态" value={sourceStateText[sourceState]} />
          <button
            type="button"
            className="wide-action component-source-refresh"
            disabled={node.locked || sourceBusy}
            onClick={() => void refreshFromSource()}
          >
            <IconRefresh size={15} />
            <span>{sourceBusy ? '正在读取来源…' : '从来源更新'}</span>
          </button>
          {sourceNotice ? <p className="ins-note component-source-note">{sourceNotice}</p> : null}
          <div className="component-source-footer">
            <button type="button" className="link-btn component-source-detach" onClick={detachSource}>
              断开来源
            </button>
          </div>
        </>
      ) : null}
      {!source ? (
        <div className="component-publish-row">
          <span className="component-publish-state">
            本机库 {node.libraryPublication ? `v${node.libraryPublication.version}` : '未发布'}
          </span>
          <button
            type="button"
            className="link-btn component-publish"
            disabled={node.locked}
            onClick={() => editor.publishComponent()}
          >
            {node.libraryPublication ? '发布新版本' : '发布到本机库'}
          </button>
        </div>
      ) : null}
      <div className="ins-action-row component-actions">
        <button type="button" className="wide-action" disabled={node.locked} onClick={() => editor.createComponentInstance()}>
          <IconGroup size={15} />
          <span>创建实例</span>
        </button>
        <button type="button" className="wide-action" disabled={node.locked || instanceCount === 0} onClick={() => editor.syncComponentInstances()}>
          <IconRefresh size={15} />
          <span>同步全部</span>
        </button>
      </div>
      <p className="ins-note">新实例放在主组件下方；改主组件后选中实例点“同步主组件”，或在这里一次同步全部。</p>
    </section>
  );
}

function LayoutChildOrder({ node }: { node: SceneNode }) {
  const s = useEditor();
  const parent = node.parentId ? s.doc.nodes[node.parentId] : null;
  if (!parent?.layout) return null;
  const index = parent.children.indexOf(node.id);
  if (index < 0) return null;
  const total = parent.children.length;
  return (
    <section className="ins-section">
      <div className="ins-title-row">
        <h3 className="ins-title">布局顺序</h3>
        <span className="style-count">{index + 1} / {total}</span>
      </div>
      <div className="layout-order-row">
        <button
          type="button"
          className="layout-order-btn"
          title="在布局中上移一层"
          aria-label="在布局中上移一层"
          disabled={node.locked || index === 0}
          onClick={() => editor.moveLayoutOrder(-1)}
        >
          <IconChevronRight size={14} className="layout-order-up" />
        </button>
        <button
          type="button"
          className="layout-order-btn"
          title="在布局中下移一层"
          aria-label="在布局中下移一层"
          disabled={node.locked || index >= total - 1}
          onClick={() => editor.moveLayoutOrder(1)}
        >
          <IconChevronRight size={14} className="layout-order-down" />
        </button>
        <span className="layout-order-hint">按图层顺序排列</span>
      </div>
    </section>
  );
}

function ConstraintsSection({ node }: { node: SceneNode }) {
  const s = useEditor();
  const parent = node.parentId ? s.doc.nodes[node.parentId] : null;
  if (!parent || parent.type !== 'frame' || node.type === 'page') return null;
  const constraints: Constraints = node.constraints ?? { horizontal: 'left', vertical: 'top' };
  const patch = (next: Partial<Constraints>) => editor.applyPatch(node.id, { constraints: { ...constraints, ...next } });

  return (
    <section className="ins-section">
      <h3 className="ins-title">约束</h3>
      <div className="field-grid">
        <SelectField
          label="水平"
          value={constraints.horizontal}
          disabled={node.locked}
          options={[
            { value: 'left', label: '左固定' },
            { value: 'right', label: '右固定' },
            { value: 'center', label: '居中' },
            { value: 'leftRight', label: '左右拉伸' },
            { value: 'scale', label: '按比例缩放' },
          ]}
          onChange={(value) => patch({ horizontal: value as Constraints['horizontal'] })}
        />
        <SelectField
          label="垂直"
          value={constraints.vertical}
          disabled={node.locked}
          options={[
            { value: 'top', label: '上固定' },
            { value: 'bottom', label: '下固定' },
            { value: 'center', label: '居中' },
            { value: 'topBottom', label: '上下拉伸' },
            { value: 'scale', label: '按比例缩放' },
          ]}
          onChange={(value) => patch({ vertical: value as Constraints['vertical'] })}
        />
      </div>
      <p className="ins-note">父画板缩放时按约束重排；X / Y 相对父画板左上角。缺省为左上固定。</p>
    </section>
  );
}

function FrameInspector({ node }: { node: SceneNode }) {
  return (
    <>
      <div className="inspector-sel">
        <IconFrame size={14} />
        <NameField node={node} />
        <span className="type-chip">{node.isComponent ? '主组件' : node.componentOf ? '实例' : '画板'}</span>
      </div>

      <section className="ins-section">
        <h3 className="ins-title">对齐与变换</h3>
        <AlignRow disabled={node.locked} />
        <div className="field-grid">
          <NumField label="X" value={node.x} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { x: n })} />
          <NumField label="Y" value={node.y} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { y: n })} />
          <NumField label="W" value={node.w} min={1} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { w: n })} />
          <NumField label="H" value={node.h} min={1} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { h: n })} />
          <NumField label="旋转" value={node.rotation} min={-360} max={360} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { rotation: n })} />
          <NumField
            label="圆角"
            value={Math.max(...cornerRadiiOf(node))}
            min={0}
            max={Math.max(0, Math.round(Math.min(node.w, node.h) / 2))}
            disabled={node.locked}
            onCommit={(n) => editor.applyPatch(node.id, { cornerRadius: n, cornerRadii: undefined })}
          />
        </div>
      </section>

      <ComponentSection key={node.id} node={node} />
      <PrototypeSection node={node} />

      <section className="ins-section">
        <CornerRadiusEditor node={node} title="圆角与透明度" />
      </section>

      <section className="ins-section">
        <h3 className="ins-title">填充</h3>
        <FillEditor node={node} fallbackColor="#FFFFFF" />
        <Row label="混合" value="正常" />
      </section>

      <AutoLayoutSection node={node} />
      <LayoutChildSection node={node} />
      <LayoutChildOrder node={node} />

      <EffectsEditor node={node} />
      <VariablesSection node={node} />
      <StylesSection node={node} />
      <CssSection node={node} />
      <ConstraintsSection node={node} />

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
        <AlignRow disabled={node.locked} />
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
      <VariablesSection node={node} />
      <StylesSection node={node} />
      <CssSection node={node} />
      <ConstraintsSection node={node} />

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

      {node.type === 'boolean' && (
        <section className="ins-section boolean-group-section">
          <h3 className="ins-title">布尔类型</h3>
          <div className="boolean-op-grid">
            {BOOLEAN_OP_OPTIONS.map((item) => (
              <button
                key={item.op}
                type="button"
                className={`boolean-op-btn${node.booleanOp === item.op ? ' is-active' : ''}`}
                onClick={() => editor.setBooleanOp(item.op)}
              >
                <IconBoolean op={item.op} size={15} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <p className="boolean-group-hint">展开图层可编辑子形状；切换运算会即时重算。拍平后变成单条矢量路径。</p>
        </section>
      )}

      <section className="ins-section">
        <h3 className="ins-title">对齐与变换</h3>
        <AlignRow disabled={node.locked} />
        <div className="field-grid">
          <NumField label="X" value={node.x} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { x: n })} />
          <NumField label="Y" value={node.y} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { y: n })} />
          <NumField label="W" value={node.w} min={1} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { w: n })} />
          <NumField label="H" value={node.h} min={1} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { h: n })} />
          <NumField label="旋转" value={node.rotation} min={-360} max={360} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { rotation: n })} />
          {isRect && (
            <NumField
              label="圆角"
              value={Math.max(...cornerRadiiOf(node))}
              min={0}
              max={Math.max(0, Math.round(Math.min(node.w, node.h) / 2))}
              disabled={node.locked}
              onCommit={(n) => editor.applyPatch(node.id, { cornerRadius: n, cornerRadii: undefined })}
            />
          )}
        </div>
      </section>

      <PrototypeSection node={node} />

      {node.type === 'section' && <AutoLayoutSection node={node} />}
      <LayoutChildSection node={node} />
      <LayoutChildOrder node={node} />

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
        {(node.type === 'rect' || node.type === 'ellipse' || node.type === 'path' || node.type === 'boolean') && <ImageFillEditor node={node} />}
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

      <EffectsEditor node={node} />

      <section className="ins-section">
        <CornerRadiusEditor node={node} radius={isRect} title="外观" />
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

      <VariablesSection node={node} />
      <StylesSection node={node} />
      <CssSection node={node} />
      <ConstraintsSection node={node} />
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
        <AlignRow disabled={node.locked} />
        <div className="field-grid">
          <NumField label="X" value={node.x} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { x: n })} />
          <NumField label="Y" value={node.y} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { y: n })} />
          <NumField label="W" value={node.w} min={1} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { w: n })} />
          <NumField label="H" value={node.h} min={1} max={100000} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { h: n })} />
          <NumField label="旋转" value={node.rotation} min={-360} max={360} disabled={node.locked} onCommit={(n) => editor.applyPatch(node.id, { rotation: n })} />
          <NumField
            label="圆角"
            value={Math.max(...cornerRadiiOf(node))}
            min={0}
            max={Math.max(0, Math.round(Math.min(node.w, node.h) / 2))}
            disabled={node.locked}
            onCommit={(n) => editor.applyPatch(node.id, { cornerRadius: n, cornerRadii: undefined })}
          />
        </div>
      </section>

      <PrototypeSection node={node} />

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
        <CornerRadiusEditor node={node} title="外观" />
      </section>

      <EffectsEditor node={node} />
      <VariablesSection node={node} />
      <StylesSection node={node} />
      <CssSection node={node} />
      <ConstraintsSection node={node} />

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

function AlignRow({ disabled }: { disabled?: boolean }) {
  const s = useEditor();
  const node = s.selectedId ? s.doc.nodes[s.selectedId] : null;
  const parent = node?.parentId ? s.doc.nodes[node.parentId] : null;
  const noArea = !node || !parent || parent.type === 'page';
  return (
    <div className="align-grid align-grid-single" role="group" aria-label="相对父级对齐">
      {ALIGN_ACTIONS.map((action) => (
        <button
          key={action.mode}
          type="button"
          className="align-btn"
          title={action.label}
          aria-label={action.label}
          disabled={disabled || noArea}
          onClick={() => editor.alignSelection(action.mode)}
        >
          {action.icon}
        </button>
      ))}
    </div>
  );
}

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
  const canVariant =
    top.length >= 2 &&
    Boolean(parentId) &&
    top.every((id) => {
      const node = s.doc.nodes[id];
      return Boolean(
        node &&
          node.type === 'frame' &&
          node.isComponent &&
          !node.isVariantSet &&
          !node.variantSetId &&
          !node.componentOf &&
          node.parentId === parentId &&
          !node.locked,
      );
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

      {canVariant ? (
        <section className="ins-section">
          <div className="ins-title-row">
            <h3 className="ins-title">组件变体</h3>
            <span className="style-count">可合并</span>
          </div>
          <button type="button" className="wide-action" onClick={() => editor.createVariantSetFromSelection()}>
            <IconComponent size={15} />
            <span>合并为变体集</span>
          </button>
          <p className="ins-note">两个以上主组件会收进同一画板，首个作为默认变体。</p>
        </section>
      ) : null}

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
        <AlignRow disabled={node.locked} />
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

      <PrototypeSection node={node} />

      <AutoLayoutSection node={node} />
      <LayoutChildSection node={node} />
      <LayoutChildOrder node={node} />
      <EffectsEditor node={node} />

      <section className="ins-section">
        <h3 className="ins-title">整理</h3>
        <button className="wide-action" onClick={() => editor.ungroupSelected()}>
          <IconUngroup size={15} />
          <span>解散分组</span>
          <kbd>Ctrl+Shift+G</kbd>
        </button>
      </section>
      <VariablesSection node={node} />
      <StylesSection node={node} />
      <CssSection node={node} />
      <ConstraintsSection node={node} />

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

function LayerOrderBar() {
  const s = useEditor();
  const ids = topLevelSelection(s.doc, s.selectedIds).filter((id) => {
    const node = s.doc.nodes[id];
    return Boolean(node && !node.locked && node.parentId && s.doc.nodes[node.parentId]);
  });
  let canBack = false;
  let canFront = false;
  for (const id of ids) {
    const node = s.doc.nodes[id];
    const parent = node?.parentId ? s.doc.nodes[node.parentId] : null;
    if (!node || !parent) continue;
    const index = parent.children.indexOf(id);
    if (index > 0) canBack = true;
    if (index >= 0 && index < parent.children.length - 1) canFront = true;
  }
  if (ids.length === 0) return null;
  return (
    <div className="layer-order-bar" aria-label="图层排列">
      <span className="layer-order-label">层级</span>
      <button type="button" className="layer-order-btn" disabled={!canBack} title="置于底层 Ctrl+Shift+[" onClick={() => editor.moveSelectedToEdge('back')}>置底</button>
      <button type="button" className="layer-order-btn" disabled={!canBack} title="下移一层 Ctrl+[" onClick={() => editor.moveSelectedLayer(-1)}>下移</button>
      <button type="button" className="layer-order-btn" disabled={!canFront} title="上移一层 Ctrl+]" onClick={() => editor.moveSelectedLayer(1)}>上移</button>
      <button type="button" className="layer-order-btn" disabled={!canFront} title="置于顶层 Ctrl+Shift+]" onClick={() => editor.moveSelectedToEdge('front')}>置顶</button>
    </div>
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
      <LayerOrderBar />
      <div className="inspector-scroll">
        {!multiple && node && node.type !== 'page' && <InstanceOverrideSection node={node} />}
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

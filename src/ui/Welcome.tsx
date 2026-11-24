import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconChevronRight,
  IconCursor,
  IconEllipse,
  IconFrame,
  IconImport,
  IconPage,
  IconPlus,
  IconRect,
  IconText,
} from './icons';
import { AboutDialog } from './AboutDialog';
import type { ProjectEntry } from '../io/project';

export interface CreateOptions {
  width?: number;
  height?: number;
  frameName?: string;
}

interface Props {
  onCreate: (options?: CreateOptions) => void;
  onOpen: (id: string) => void;
  onImportSvg: (file: File) => Promise<void>;
  projects: ProjectEntry[];
  loading: boolean;
  error: string | null;
}

interface Preset {
  id: string;
  label: string;
  note: string;
  width: number;
  height: number;
  frameName: string;
}

const PRESETS: Preset[] = [
  { id: 'desktop', label: '桌面', note: '1440 × 900', width: 1440, height: 900, frameName: '桌面 1440' },
  { id: 'phone', label: '手机', note: '390 × 844', width: 390, height: 844, frameName: '手机 390' },
  { id: 'tablet', label: '平板', note: '834 × 1194', width: 834, height: 1194, frameName: '平板 834' },
  { id: 'square', label: '方图', note: '1080 × 1080', width: 1080, height: 1080, frameName: '方图 1080' },
];

const KEY_HINTS = [
  { key: 'V', label: '选择', icon: IconCursor },
  { key: 'F', label: '画板', icon: IconFrame },
  { key: 'R', label: '矩形', icon: IconRect },
  { key: 'O', label: '椭圆', icon: IconEllipse },
  { key: 'T', label: '文本', icon: IconText },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function todayLabel(): string {
  const d = new Date();
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week[d.getDay()]}`;
}

function formatTime(ts: number): string {
  if (!ts) return '未知时间';
  const diff = (Date.now() - ts) / 60000;
  if (diff < 1) return '刚刚';
  if (diff < 60) return `${Math.round(diff)} 分钟前`;
  if (diff < 1440) return `${Math.round(diff / 60)} 小时前`;
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '空场景';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function clampSize(text: string, fallback: number): number {
  const raw = Number(text);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(320, Math.min(4096, Math.round(raw)));
}

function previewBox(width: number, height: number, maxW = 30, maxH = 22): { width: number; height: number } {
  const ratio = width / height;
  if (ratio > maxW / maxH) {
    return { width: maxW, height: Math.max(6, Math.round(maxW / ratio)) };
  }
  return { width: Math.max(6, Math.round(maxH * ratio)), height: maxH };
}

export function Welcome({ onCreate, onOpen, onImportSvg, projects, loading, error }: Props) {
  const [about, setAbout] = useState(false);
  const [preset, setPreset] = useState('desktop');
  const [widthText, setWidthText] = useState('1440');
  const [heightText, setHeightText] = useState('900');
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const currentWidth = clampSize(widthText, 1440);
  const currentHeight = clampSize(heightText, 900);
  const preview = previewBox(currentWidth, currentHeight);
  const totalBytes = projects.reduce((sum, p) => sum + p.bytes, 0);

  const createCurrent = useCallback(() => {
    const width = clampSize(widthText, 1440);
    const height = clampSize(heightText, 900);
    const frameName = preset === 'custom'
      ? `画板 ${width}`
      : PRESETS.find((p) => p.id === preset)?.frameName ?? `画板 ${width}`;
    onCreate({ width, height, frameName });
  }, [heightText, onCreate, preset, widthText]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createCurrent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createCurrent]);

  function choosePreset(p: Preset) {
    setPreset(p.id);
    setWidthText(String(p.width));
    setHeightText(String(p.height));
  }

  async function importDrawing(file: File | undefined) {
    if (!file || importing) return;
    setImporting(true);
    try {
      await onImportSvg(file);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="welcome">
      <svg className="home-paper" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path
          d="M-90 636C210 540 394 706 742 658S1168 430 1530 506"
          stroke="rgba(184,134,0,0.15)"
          strokeWidth="1.1"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M-60 286C244 228 516 104 774 172S1154 356 1492 248"
          stroke="rgba(34,28,0,0.055)"
          strokeWidth="1"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M1012-60C918 168 1118 264 1054 498S1174 762 1372 972"
          stroke="rgba(184,134,0,0.12)"
          strokeWidth="1"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="home-glow" aria-hidden="true" />
      <div className="home-shell">
        <header className="home-top">
          <div className="home-brand">
            <img src="/groma-icon.png" alt="" draggable={false} />
            <span className="home-brand-name">Groma</span>
            <span className="home-brand-tag">界面设计工作台</span>
          </div>
          <div className="home-top-right">
            <span className="home-date">{todayLabel()}</span>
            <span className="home-local"><i aria-hidden="true" />本地工作区</span>
            <button className="home-quiet" onClick={() => setAbout(true)}>关于</button>
            <span className="home-version">v0.1.0</span>
          </div>
        </header>

        <main className="home-main">
          <section className="home-hero">
            <div className="home-eyebrow"><span className="home-eyebrow-dot" aria-hidden="true" />新建设计</div>
            <p className="home-hello"><span>{greeting()}，</span>今天想画点什么？</p>
            <h1>把想法，<br /><span>放到<span className="home-mark">画板</span>上。</span></h1>
            <p className="home-lead">
              选一个常用尺寸，也可以自己填。文件只保存在本地，不需要账号。
            </p>

            <div className="home-composer">
              <div className="composer-head">
                <div className="composer-title-group">
                  <span className="composer-title">画板尺寸</span>
                  <span className="composer-hint">创建后可在检查器调整</span>
                </div>
                <div className="composer-live">
                  <span
                    className="composer-shape"
                    style={{ width: `${preview.width}px`, height: `${preview.height}px` }}
                    aria-hidden="true"
                  />
                  <span className="composer-size">{currentWidth} × {currentHeight}</span>
                </div>
              </div>

              <div className="preset-grid" role="group" aria-label="画板尺寸预设">
                {PRESETS.map((p, index) => (
                  <button
                    key={p.id}
                    className={`preset-chip${preset === p.id ? ' is-on' : ''}`}
                    aria-pressed={preset === p.id}
                    onClick={() => choosePreset(p)}
                    style={{ animationDelay: `${90 + index * 38}ms` }}
                  >
                    <span className="preset-visual" aria-hidden="true">
                      <span className={`preset-shape ${p.id}`} />
                    </span>
                    <span className="preset-copy">
                      <span className="preset-name">{p.label}</span>
                      <span className="preset-note">{p.note}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="home-size-block">
                <label className="home-field-label" htmlFor="new-width">自定义画板</label>
                <div className="size-row">
                  <div className="size-field">
                    <span className="size-prefix">W</span>
                    <input
                      id="new-width"
                      type="number"
                      inputMode="numeric"
                      min={320}
                      max={4096}
                      value={widthText}
                      onChange={(e) => {
                        setWidthText(e.target.value);
                        setPreset('custom');
                      }}
                      onBlur={() => setWidthText(String(clampSize(widthText, 1440)))}
                    />
                  </div>
                  <span className="size-x">×</span>
                  <div className="size-field">
                    <span className="size-prefix">H</span>
                    <input
                      aria-label="画板高度"
                      type="number"
                      inputMode="numeric"
                      min={320}
                      max={4096}
                      value={heightText}
                      onChange={(e) => {
                        setHeightText(e.target.value);
                        setPreset('custom');
                      }}
                      onBlur={() => setHeightText(String(clampSize(heightText, 900)))}
                    />
                  </div>
                  <span className="size-unit">px</span>
                </div>
              </div>

              <div className="composer-actions">
                <button className="btn btn-primary home-create" onClick={createCurrent}>
                  <IconPlus size={15} />
                  创建画板
                </button>
                <span className="home-create-note">
                  将创建 <b>{currentWidth}</b> × <b>{currentHeight}</b> 画板
                </span>
                <span className="home-shortcut"><kbd>Ctrl</kbd><span>+</span><kbd>N</kbd></span>
              </div>

              <div className="home-import-row">
                <button
                  className="home-import"
                  disabled={importing}
                  onClick={() => importRef.current?.click()}
                >
                  <IconImport size={14} />
                  {importing ? '正在导入…' : '导入 Vexa 画的图'}
                </button>
                <span className="home-import-note">SVG 里的路径、渐变、描边、文本和图片都会保留</span>
                <input
                  ref={importRef}
                  type="file"
                  accept=".svg,image/svg+xml"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    void importDrawing(file);
                  }}
                />
              </div>
            </div>

            <div className="home-quick">
              <div className="home-quick-head">
                <span>快捷起步</span>
                <span>选中工具后直接在画布拖拽</span>
              </div>
              <div className="home-quick-keys">
                {KEY_HINTS.map((hint) => {
                  const KeyIcon = hint.icon;
                  return (
                    <span className="home-key" key={hint.key}>
                      <kbd>{hint.key}</kbd>
                      <KeyIcon size={13} />
                      <span>{hint.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="home-facts">
              <span>本地优先</span>
              <span>自动保存</span>
              <span>零联网</span>
            </div>
          </section>

          <section className="home-shelf">
            <div className="shelf-head">
              <div>
                <h2>最近工程</h2>
                <p>接着上次的地方继续。</p>
              </div>
              {projects.length > 0 && (
                <span className="home-count">
                  {projects.length} 个 · {formatBytes(totalBytes)}
                </span>
              )}
            </div>

            {error && <div className="home-error">{error}</div>}

            {loading ? (
              <div className="shelf-loading">正在读取本地工程…</div>
            ) : projects.length > 0 ? (
              <div className="shelf-list" id="recent">
                {projects.map((p, index) => (
                  <button
                    className="recent-card"
                    key={p.id}
                    onClick={() => onOpen(p.id)}
                    style={{ animationDelay: `${80 + Math.min(index, 7) * 40}ms` }}
                  >
                    <span className="recent-thumb" aria-hidden="true">
                      <IconPage size={16} />
                      <i />
                    </span>
                    <span className="recent-meta">
                      <span className="recent-name-row">
                        <span className="recent-name" title={p.name}>{p.name}</span>
                        {index === 0 && <span className="recent-tag">最近</span>}
                      </span>
                      <span className="recent-sub">{formatTime(p.updatedAt)} · {formatBytes(p.bytes)}</span>
                    </span>
                    <span className="recent-go" aria-hidden="true"><IconChevronRight size={14} /></span>
                  </button>
                ))}

                {projects.length <= 2 && (
                  <div className="shelf-guide">
                    <div className="shelf-guide-head">
                      <span>画布操作</span>
                      <span>打开工程后</span>
                    </div>
                    <div className="shelf-guide-row">
                      <kbd>空格</kbd>
                      <span>按住拖动，平移画布</span>
                    </div>
                    <div className="shelf-guide-row">
                      <kbd>滚轮</kbd>
                      <span>以指针为中心缩放</span>
                    </div>
                    <div className="shelf-guide-row">
                      <span className="shelf-guide-keys"><kbd>Shift</kbd><kbd>1</kbd></span>
                      <span>适应全部画板</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="shelf-empty" id="recent">
                <div className="shelf-empty-mark" aria-hidden="true">
                  <span className="shelf-empty-frame" />
                  <span className="shelf-empty-line" />
                </div>
                <strong>还没有工程</strong>
                <p>创建第一块画板，它会出现在这里。</p>
                <div className="shelf-steps">
                  <span><b>1</b>选尺寸</span>
                  <span><b>2</b>建画板</span>
                  <span><b>3</b>开始画</span>
                </div>
              </div>
            )}

            <div className="shelf-stats">
              <div className="shelf-stat">
                <strong>{projects.length}</strong>
                <span>本地工程</span>
              </div>
              <div className="shelf-stat">
                <strong>{projects.length ? formatBytes(totalBytes) : '0 B'}</strong>
                <span>占用空间</span>
              </div>
              <div className="shelf-stat">
                <strong>20</strong>
                <span>快照上限</span>
              </div>
            </div>

            <div className="shelf-storage">
              <span className="shelf-storage-dot" aria-hidden="true" />
              <span>自动保存 · 本地快照 20 份</span>
              <span className="shelf-storage-path">Documents\Groma</span>
            </div>

            <div className="shelf-foot">
              <span>最近打开的工程</span>
              <button className="link-btn" onClick={() => setAbout(true)}>关于 Groma</button>
            </div>
          </section>
        </main>

        <footer className="home-foot">
          <span>小方工作室 · 文件在你自己手里</span>
          <span>Groma 不会上传你的设计</span>
        </footer>
      </div>

      {about && <AboutDialog onClose={() => setAbout(false)} />}
    </div>
  );
}

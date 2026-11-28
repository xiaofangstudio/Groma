import { useEffect, useState } from 'react';
import { editor, useEditor } from '../state/editor';
import { activeModeId, canAliasVariable, VARIABLE_PROP_LABEL, variableById, variableCollections, variableTypeLabel, variableValue } from '../core/variables';
import type { VariableType } from '../core/types';

const VARIABLE_TYPES: VariableType[] = ['color', 'number', 'string', 'boolean'];

export function VariablesDialog({ onClose }: { onClose: () => void }) {
  const s = useEditor();
  const collections = variableCollections(s.doc);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newVarName, setNewVarName] = useState('');
  const [newVarType, setNewVarType] = useState<VariableType>('color');
  const [newModeName, setNewModeName] = useState('');
  const collection = (selectedId ? s.doc.variables?.[selectedId] : null) ?? collections[0] ?? null;
  const activeMode = collection ? activeModeId(s.doc, collection) : '';
  const allVariables = collections.flatMap((item) => Object.values(item.variables));

  useEffect(() => {
    if (!collection && selectedId) setSelectedId(null);
  }, [collection, selectedId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function createCollection() {
    const id = editor.createVariableCollection(`主题 ${collections.length + 1}`);
    setSelectedId(id);
  }

  function addMode() {
    if (!collection) return;
    const id = editor.addVariableMode(collection.id, newModeName);
    if (id) setNewModeName('');
  }

  function addVariable() {
    if (!collection) return;
    const id = editor.addVariable(collection.id, newVarName, newVarType);
    if (id) {
      setNewVarName('');
      setNewVarType('color');
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card variables-card"
        role="dialog"
        aria-modal="true"
        aria-label="变量与 Mode"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="variables-head">
          <div>
            <div className="dialog-title">变量</div>
            <div className="dialog-sub">集合、Mode 与图层绑定；切换 Mode 会刷新已绑定属性。</div>
          </div>
          <button className="dialog-close" type="button" aria-label="关闭变量面板" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="variables-body">
          <aside className="variables-side">
            <div className="variables-side-head">
              <span>集合</span>
              <button type="button" className="variables-mini-btn" onClick={createCollection}>
                + 新建
              </button>
            </div>
            {collections.length === 0 ? (
              <div className="variables-empty">还没有变量集合。先建一个“主题”，再把颜色或数值变量放进去。</div>
            ) : (
              collections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`variables-collection${item.id === collection?.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.variables ? `${Object.keys(item.variables).length} 变量 · ${item.modes.length} Mode` : ''}</span>
                </button>
              ))
            )}
          </aside>

          <main className="variables-main">
            {!collection ? (
              <div className="variables-hero">
                <strong>变量是本地工程的，不依赖云端</strong>
                <span>建立集合后才能把填充和圆角绑到变量。</span>
                <button type="button" className="primary-action" onClick={createCollection}>
                  新建变量集合
                </button>
              </div>
            ) : (
              <>
                <div className="variables-mode-row">
                  <span className="variables-section-label">Mode</span>
                  <div className="variables-modes" role="group" aria-label="变量 Mode">
                    {collection.modes.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={`variables-mode${mode.id === activeMode ? ' is-on' : ''}`}
                        aria-pressed={mode.id === activeMode}
                        onClick={() => editor.setVariableMode(collection.id, mode.id)}
                      >
                        {mode.name}
                      </button>
                    ))}
                  </div>
                  <div className="variables-mode-add">
                    <input
                      className="field-input"
                      value={newModeName}
                      placeholder="新 Mode"
                      onChange={(e) => setNewModeName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addMode();
                      }}
                    />
                    <button type="button" className="variables-mini-btn" onClick={addMode}>
                      添加
                    </button>
                  </div>
                </div>

                <div className="variables-table">
                  <div className="variables-table-head">
                    <span>变量</span>
                    <span>类型</span>
                    <span>当前值</span>
                    <span>引用</span>
                    <span>绑定</span>
                  </div>
                  {Object.values(collection.variables).length === 0 ? (
                    <div className="variables-empty">这个集合还没有变量。下面新增一个颜色或数值变量。</div>
                  ) : (
                    Object.values(collection.variables).map((variable) => {
                      const value = variable.values[activeMode];
                      const aliasTarget = variable.alias ? variableById(s.doc, variable.alias) : null;
                      const resolved = variable.alias ? variableValue(s.doc, variable.id) : value;
                      const aliasOptions = allVariables.filter(
                        (item) =>
                          item.type === variable.type &&
                          item.id !== variable.id &&
                          canAliasVariable(s.doc, variable.id, item.id),
                      );
                      return (
                        <div className="variables-row" key={variable.id}>
                          <span className="variables-name" title={variable.name}>{variable.name}</span>
                          <span className="variables-type">{variableTypeLabel(variable.type)}</span>
                          <span className="variables-value">
                            {variable.alias ? (
                              <span className="variables-alias-value" title={aliasTarget?.name ?? '引用变量不存在'}>
                                → {aliasTarget?.name ?? '缺失'}
                                <code>{String(resolved ?? '')}</code>
                              </span>
                            ) : variable.type === 'color' ? (
                              <span className="variables-color">
                                <input
                                  type="color"
                                  value={typeof value === 'string' ? value : '#2563EB'}
                                  aria-label={`${variable.name} 颜色`}
                                  onChange={(e) => editor.setVariableValue(collection.id, variable.id, activeMode, e.currentTarget.value)}
                                />
                                <code>{typeof value === 'string' ? value : ''}</code>
                              </span>
                            ) : variable.type === 'number' ? (
                              <input
                                className="field-input variables-number"
                                type="number"
                                value={typeof value === 'number' ? value : 0}
                                onChange={(e) => editor.setVariableValue(collection.id, variable.id, activeMode, Number(e.currentTarget.value))}
                              />
                            ) : variable.type === 'boolean' ? (
                              <input
                                type="checkbox"
                                checked={Boolean(value)}
                                onChange={(e) => editor.setVariableValue(collection.id, variable.id, activeMode, e.currentTarget.checked)}
                              />
                            ) : (
                              <input
                                className="field-input"
                                value={typeof value === 'string' ? value : ''}
                                onChange={(e) => editor.setVariableValue(collection.id, variable.id, activeMode, e.currentTarget.value)}
                              />
                            )}
                          </span>
                          <span className="variables-alias">
                            <select
                              className="field-select variables-alias-select"
                              value={variable.alias ?? ''}
                              aria-label={`${variable.name} 引用`}
                              onChange={(e) => editor.setVariableAlias(collection.id, variable.id, e.currentTarget.value || null)}
                            >
                              <option value="">独立值</option>
                              {aliasOptions.map((item) => {
                                const owner = collections.find((entry) => entry.id === item.collectionId);
                                return (
                                  <option key={item.id} value={item.id}>
                                    {owner?.name ?? '集合'} / {item.name}
                                  </option>
                                );
                              })}
                            </select>
                          </span>
                          <span className="variables-bind-note">
                            {variable.type === 'color'
                              ? VARIABLE_PROP_LABEL.fill
                              : variable.type === 'number'
                                ? VARIABLE_PROP_LABEL.cornerRadius
                                : '暂不可绑'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="variables-add-row">
                  <input
                    className="field-input"
                    value={newVarName}
                    placeholder="变量名，例如 主色 / 卡片圆角"
                    onChange={(e) => setNewVarName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addVariable();
                    }}
                  />
                  <select
                    className="field-select"
                    value={newVarType}
                    aria-label="变量类型"
                    onChange={(e) => setNewVarType(e.currentTarget.value as VariableType)}
                  >
                    {VARIABLE_TYPES.map((type) => (
                      <option key={type} value={type}>{variableTypeLabel(type)}</option>
                    ))}
                  </select>
                  <button type="button" className="primary-action" onClick={addVariable} disabled={!newVarName.trim()}>
                    新增变量
                  </button>
                </div>
              </>
            )}
          </main>
        </div>

        <div className="variables-foot">
          <span>变量可引用同类型变量；改目标值或切目标 Mode 会沿引用链刷新。颜色绑填充/描边，数值绑圆角/间距/字号。</span>
          <span className="variables-foot-count">{collections.length} 集合</span>
        </div>
      </div>
    </div>
  );
}

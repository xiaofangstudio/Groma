import fs from 'node:fs';

const port = process.env.CDP_PORT || '9241';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id) return;
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(msg.error.message)); else slot.resolve(msg.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  };
  const shoot = async (path) => {
    if (!path) return;
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path, Buffer.from(shot.data, 'base64'));
    console.log('SHOT', path, fs.statSync(path).size);
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(2600);

  const viewport = await evaluate(`({ w: innerWidth, h: innerHeight, canvas: (() => {
    const c = document.querySelector('.canvas-host');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })() })`);

  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('按钮实例'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(650);

  const variantState = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '组件');
    const selects = [...(sec?.querySelectorAll('select') ?? [])];
    const select = selects.find((s) => [...s.options].some((o) => o.value === 'variant-hover'));
    const before = select?.value;
    if (select) {
      select.value = 'variant-hover';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { hasSection: Boolean(sec), before, options: select ? [...select.options].map((o) => o.textContent) : [] };
  })()`);
  await sleep(700);
  const variantAfter = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '组件');
    const selects = [...(sec?.querySelectorAll('select') ?? [])];
    const variantSelect = selects.find((s) => [...s.options].some((o) => o.value === 'variant-hover'));
    return { text: sec?.innerText.replace(/\\n/g, ' | ') ?? '', select: variantSelect?.value ?? '' };
  })()`);
  await shoot(process.env.P0_VARIANT_OUT);

  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('按钮变体集'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(500);
  const matrixBefore = await evaluate(`(() => {
    const matrix = document.querySelector('.variant-matrix');
    return {
      open: Boolean(matrix),
      text: matrix?.innerText.replace(/\\n/g, ' | ') ?? '',
      cells: matrix?.querySelectorAll('.variant-matrix-cell').length ?? 0,
      filled: matrix?.querySelectorAll('.variant-matrix-cell.is-filled').length ?? 0,
      missing: matrix?.querySelectorAll('.variant-matrix-cell:not(.is-filled)').length ?? 0,
      head: document.querySelector('.variant-matrix-head')?.innerText.replace(/\\n/g, ' | ') ?? '',
    };
  })()`);
  await shoot(process.env.P0_MATRIX_BEFORE_OUT);
  const comboAdded = await evaluate(`(() => {
    const cell = document.querySelector('.variant-matrix-cell:not(.is-filled)');
    cell?.click();
    return Boolean(cell);
  })()`);
  await sleep(600);
  const matrixAfter = await evaluate(`(() => {
    const matrix = document.querySelector('.variant-matrix');
    return {
      cells: matrix?.querySelectorAll('.variant-matrix-cell').length ?? 0,
      filled: matrix?.querySelectorAll('.variant-matrix-cell.is-filled').length ?? 0,
      missing: matrix?.querySelectorAll('.variant-matrix-cell:not(.is-filled)').length ?? 0,
      head: document.querySelector('.variant-matrix-head')?.innerText.replace(/\\n/g, ' | ') ?? '',
    };
  })()`);
  await shoot(process.env.P0_MATRIX_OUT);

  // 实例覆盖：切回默认变体 → 改实例子层文字 → 改主组件 → 同步后覆盖仍在 → 重置回主组件。
  const instanceSelected = await evaluate(`(() => {
    document.querySelector('[data-node-id="inst-p0"]')?.click();
    return true;
  })()`);
  await sleep(450);
  const variantReset = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '组件');
    const selects = [...(sec?.querySelectorAll('select') ?? [])];
    const select = selects.find((s) => [...s.options].some((o) => o.value === 'variant-default'));
    if (select && select.value !== 'variant-default') {
      select.value = 'variant-default';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return select?.value ?? '';
  })()`);
  await sleep(650);
  const expandInstance = await evaluate(`(() => {
    const row = document.querySelector('[data-node-id="inst-p0"]');
    row?.click();
    const caret = row?.querySelector('.layer-caret');
    caret?.click();
    return Boolean(caret);
  })()`);
  await sleep(500);
  const pickInstanceText = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    const index = rows.findIndex((r) => r.dataset.nodeId === 'inst-p0');
    rows[index + 1]?.click();
    return { index, child: rows[index + 1]?.dataset.nodeId ?? '' };
  })()`);
  await sleep(500);
  const overrideEdit = await evaluate(`(() => {
    const ta = document.querySelector('#text-editor');
    if (!ta) return false;
    ta.focus();
    ta.select();
    return true;
  })()`);
  await send('Input.insertText', { text: '实例覆盖' });
  await sleep(300);
  await evaluate(`(() => { document.querySelector('#text-editor')?.blur(); return true; })()`);
  await sleep(650);
  const overrideState = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '实例覆盖');
    return {
      section: Boolean(sec),
      state: sec?.querySelector('.instance-override-state')?.textContent ?? '',
      chips: sec ? [...sec.querySelectorAll('.instance-override-chip')].map((c) => c.textContent) : [],
      text: sec?.innerText.replace(/\\n/g, ' | ') ?? '',
      editorText: document.querySelector('#text-editor')?.value ?? '',
    };
  })()`);
  await shoot(process.env.P0_OVERRIDE_OUT);

  const masterEdit = await evaluate(`(() => {
    const setRow = document.querySelector('[data-node-id="set-p0"]');
    setRow?.querySelector('.layer-caret')?.click();
    return Boolean(setRow);
  })()`);
  await sleep(500);
  const masterPick = await evaluate(`(() => {
    const row = document.querySelector('[data-node-id="variant-default"]');
    row?.click();
    row?.querySelector('.layer-caret')?.click();
    return Boolean(row);
  })()`);
  await sleep(500);
  const pickMasterText = await evaluate(`(() => {
    const row = document.querySelector('[data-node-id="text-default"]');
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(450);
  const masterTextEdited = await evaluate(`(() => {
    const ta = document.querySelector('#text-editor');
    if (!ta) return false;
    ta.focus();
    ta.select();
    return true;
  })()`);
  await send('Input.insertText', { text: '主组件改字' });
  await sleep(300);
  await evaluate(`(() => { document.querySelector('#text-editor')?.blur(); return true; })()`);
  await sleep(550);

  const syncClicked = await evaluate(`(() => {
    const row = document.querySelector('[data-node-id="inst-p0"]');
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(500);
  const syncButton = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.wide-action')].find((el) => el.textContent.trim() === '同步主组件');
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(800);
  const pickSyncedText = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    const index = rows.findIndex((r) => r.dataset.nodeId === 'inst-p0');
    rows[index + 1]?.click();
    return { index, child: rows[index + 1]?.dataset.nodeId ?? '' };
  })()`);
  await sleep(550);
  const syncState = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '实例覆盖');
    return {
      section: Boolean(sec),
      state: sec?.querySelector('.instance-override-state')?.textContent ?? '',
      chips: sec ? [...sec.querySelectorAll('.instance-override-chip')].map((c) => c.textContent) : [],
      editorText: document.querySelector('#text-editor')?.value ?? '',
    };
  })()`);
  await shoot(process.env.P0_OVERRIDE_SYNC_OUT);

  const resetClicked = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '实例覆盖');
    const btn = sec ? [...sec.querySelectorAll('.wide-action')].find((el) => el.textContent.trim() === '重置此层') : null;
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(900);
  const resetState = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    const index = rows.findIndex((r) => r.dataset.nodeId === 'inst-p0');
    rows[index + 1]?.click();
    return { index, child: rows[index + 1]?.dataset.nodeId ?? '', selected: Boolean(rows[index + 1]) };
  })()`);
  await sleep(500);
  const resetText = await evaluate(`(() => ({
    editorText: document.querySelector('#text-editor')?.value ?? '',
    overrideState: (() => { const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '实例覆盖'); return sec?.querySelector('.instance-override-state')?.textContent ?? ''; })(),
  }))()`);
  await shoot(process.env.P0_OVERRIDE_RESET_OUT);

  const swapSelect = await evaluate(`(() => {
    document.querySelector('[data-node-id="inst-p0"]')?.click();
    return true;
  })()`);
  await sleep(500);
  const swapChanged = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '组件');
    const select = [...(sec?.querySelectorAll('select') ?? [])].find((s) => [...s.options].some((o) => o.value === 'alt-button'));
    if (!select) return false;
    select.value = 'alt-button';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(750);
  const swapState = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '组件');
    return { text: sec?.innerText.replace(/\\n/g, ' | ') ?? '', select: [...(sec?.querySelectorAll('select') ?? [])][0]?.value ?? '' };
  })()`);
  await shoot(process.env.P0_SWAP_OUT);


  const panelSelected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('变量卡片'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(600);
  const variablesPanel = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '变量');
    sec?.scrollIntoView({ block: 'center' });
    return { text: sec?.innerText.replace(/\\n/g, ' | ') ?? '', selects: sec ? [...sec.querySelectorAll('select')].map((s) => ({ value: s.value, options: [...s.options].map((o) => o.textContent) })) : [] };
  })()`);
  await sleep(300);
  await shoot(process.env.P0_VAR_PANEL_OUT);

  const variablesOpen = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.topbar button')].find((el) => el.textContent.trim() === '变量');
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(700);
  const modalState = await evaluate(`(() => {
    const modal = document.querySelector('.variables-card');
    return {
      open: Boolean(modal),
      text: modal?.innerText.replace(/\\n/g, ' | ') ?? '',
      overflow: [...(modal?.querySelectorAll('*') ?? [])]
        .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
        .slice(0, 8)
        .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 40), cw: el.clientWidth, sw: el.scrollWidth })),
    };
  })()`);
  await shoot(process.env.P0_VAR_DIALOG_OUT);

  const aliasChanged = await evaluate(`(() => {
    const select = document.querySelector('.variables-card select[aria-label="描边色 引用"]');
    if (!select) return false;
    select.value = 'color-card';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(800);
  const aliasState = await evaluate(`(() => {
    const select = document.querySelector('.variables-card select[aria-label="描边色 引用"]');
    const row = select?.closest('.variables-row');
    return {
      value: select?.value ?? '',
      text: row?.innerText.replace(/\\n/g, ' | ') ?? '',
      overflow: [...(document.querySelector('.variables-card')?.querySelectorAll('*') ?? [])]
        .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
        .slice(0, 8)
        .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 40), cw: el.clientWidth, sw: el.scrollWidth })),
    };
  })()`);
  await shoot(process.env.P0_ALIAS_OUT);

  const darkMode = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.variables-mode')].find((el) => el.textContent.includes('深色'));
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(900);
  await shoot(process.env.P0_VAR_DARK_OUT);
  await evaluate(`(() => { document.querySelector('.variables-card .dialog-close')?.click(); return true; })()`);
  await sleep(500);
  await shoot(process.env.P0_DARK_EDITOR_OUT);

  const canvasPoint = { x: 600, y: 700 };
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: canvasPoint.x, y: canvasPoint.y, button: 'right', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: canvasPoint.x, y: canvasPoint.y, button: 'right', clickCount: 1 });
  await sleep(500);
  const menuState = await evaluate(`(() => {
    const menu = document.querySelector('.canvas-context-menu');
    return { open: Boolean(menu), text: menu?.innerText.replace(/\\n/g, ' | ') ?? '', rect: menu ? (() => { const r = menu.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })() : null };
  })()`);
  await shoot(process.env.P0_MENU_OUT);
  await evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
  await sleep(300);

  const libraryOpen = await evaluate(`(() => {
    const btn = document.querySelector('[aria-label="组件库"]');
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(500);
  const libraryState = await evaluate(`(() => {
    const pop = document.querySelector('.component-library');
    const left = pop?.closest('.left-panel');
    const r = pop?.getBoundingClientRect();
    const lr = left?.getBoundingClientRect();
    return { open: Boolean(pop), text: pop?.innerText.replace(/\\n/g, ' | ') ?? '', rows: pop?.querySelectorAll('.component-library-row').length ?? 0, rect: r ? { x: r.x, y: r.y, w: r.width } : null, left: lr ? { x: lr.x, y: lr.y, w: lr.width } : null, cssLeft: pop ? getComputedStyle(pop).left : '', cssRight: pop ? getComputedStyle(pop).right : '', cssWidth: pop ? getComputedStyle(pop).width : '' };
  })()`);
  await shoot(process.env.P0_LIBRARY_OUT);

  await evaluate(`(() => {
    document.querySelector('[aria-label="组件库"]')?.click();
    return true;
  })()`);
  await sleep(300);
  await evaluate(`(() => {
    const row = document.querySelector('[data-node-id="set-p0"]');
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return Boolean(row);
  })()`);
  await sleep(400);
  const facetInput = await evaluate(`(() => {
    const input = [...document.querySelectorAll('input')].find((el) => el.placeholder.includes('新属性名'));
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '主题');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(250);
  const facetAdded = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.mini-action')].find((el) => el.textContent?.trim() === '添加属性');
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  })()`);
  await sleep(700);
  const facetState = await evaluate(`(() => {
    const select = document.querySelector('.ins-section select[aria-label="主题"]');
    const matrix = document.querySelector('.variant-matrix');
    return {
      open: Boolean(select),
      text: select?.closest('.field')?.innerText.replace(/\\n/g, ' | ') ?? '',
      options: select ? [...select.options].map((option) => option.textContent?.trim() ?? '') : [],
      filled: matrix?.querySelectorAll('.variant-matrix-cell.is-filled').length ?? 0,
      head: document.querySelector('.variant-matrix-head')?.innerText.replace(/\\n/g, ' | ') ?? '',
    };
  })()`);
  await shoot(process.env.P0_FACET_OUT);

  await evaluate(`(() => {
    document.querySelector('[aria-label="组件库"]')?.click();
    return true;
  })()`);
  await sleep(500);
  await evaluate(`(() => {
    const tab = [...document.querySelectorAll('.component-library-tab')].find((el) => el.textContent?.includes('本机工程'));
    tab?.click();
    return Boolean(tab);
  })()`);
  await sleep(1800);
  const externalState = await evaluate(`(() => {
    const pop = document.querySelector('.component-library');
    return {
      open: Boolean(pop),
      text: pop?.innerText.replace(/\\n/g, ' | ') ?? '',
      rows: pop?.querySelectorAll('.component-library-row').length ?? 0,
      blocked: pop?.querySelectorAll('.component-library-row.is-blocked').length ?? 0,
      tabs: [...(pop?.querySelectorAll('.component-library-tab') ?? [])].map((el) => el.textContent?.trim() ?? ''),
      overflow: pop ? [...pop.querySelectorAll('*')].filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).slice(0, 8).map((el) => ({ cls: String(el.className).slice(0, 36), cw: el.clientWidth, sw: el.scrollWidth })) : [],
    };
  })()`);
  await shoot(process.env.P0_EXTERNAL_LIB_OUT);

  const importClicked = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.component-library-row:not(.is-blocked)')].find((el) => el.textContent?.includes('状态标签'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(1400);
  const importState = await evaluate(`(() => {
    const selected = document.querySelector('.layer-row.is-selected');
    const inspector = document.querySelector('.right-panel');
    return {
      libraryClosed: !document.querySelector('.component-library'),
      selectedName: selected?.innerText.replace(/\\n/g, ' | ') ?? '',
      inspector: inspector?.innerText.replace(/\\n/g, ' | ').slice(0, 500) ?? '',
      layers: [...document.querySelectorAll('.layer-row[data-node-id]')].map((el) => el.textContent?.trim() ?? '').slice(0, 20),
    };
  })()`);
  await shoot(process.env.P0_IMPORT_OUT);

  const instanceCreated = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.right-panel button')].find((el) => el.textContent?.includes('创建实例'));
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  })()`);
  await sleep(700);
  const masterSelected = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row[data-node-id]')];
    const master = rows.find((el) => el.textContent?.includes('状态标签') && !el.textContent?.includes('实例'));
    master?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return Boolean(master);
  })()`);
  await sleep(500);

  const libScenePath = 'C:/Users/ASUS/Documents/Groma/Library.groma/scene.json';
  const libScene = JSON.parse(fs.readFileSync(libScenePath, 'utf8'));
  libScene.nodes['lib-badge'].w = 170;
  libScene.nodes['badge-text'].text = '来源已更新';
  libScene.nodes['badge-text'].x = 24;
  libScene.nodes['badge-text'].w = 122;
  fs.writeFileSync(libScenePath, JSON.stringify(libScene, null, 2));

  const refreshClicked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.right-panel button')].find((el) => el.textContent?.includes('从来源更新'));
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  })()`);
  await sleep(1600);
  const refreshState = await evaluate(`(() => {
    const selected = document.querySelector('.layer-row.is-selected');
    return {
      selectedName: selected?.innerText.replace(/\\n/g, ' | ') ?? '',
      sourceNotice: [...document.querySelectorAll('.component-source-note')].map((el) => el.textContent?.trim() ?? ''),
      sourceRow: [...document.querySelectorAll('.right-panel .field')].map((el) => el.innerText.replace(/\\n/g, ' | ')).find((text) => text.includes('本地库')) ?? '',
      width: [...document.querySelectorAll('.right-panel input')].find((el) => el.closest('.field')?.innerText.includes('W'))?.value ?? '',
    };
  })()`);
  await shoot(process.env.P0_REFRESH_OUT);
  const libraryInstanceSelected = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row[data-node-id]')];
    const instance = rows.find((el) => el.textContent?.includes('状态标签') && el.textContent?.includes('实例'));
    instance?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return Boolean(instance);
  })()`);
  await sleep(700);
  const libraryInstanceState = await evaluate(`(() => {
    const selected = document.querySelector('.layer-row.is-selected');
    return {
      selectedName: selected?.innerText.replace(/\\n/g, ' | ') ?? '',
      inspector: document.querySelector('.right-panel')?.innerText.replace(/\\n/g, ' | ').slice(0, 420) ?? '',
    };
  })()`);
  await shoot(process.env.P0_UPDATE_OUT);


  const overflow = await evaluate(`(() => {
    const panel = document.querySelector('.inspector-scroll');
    return panel ? [...document.querySelectorAll('.right-panel *')].filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).slice(0, 12).map((el) => ({ cls: String(el.className).slice(0, 40), cw: el.clientWidth, sw: el.scrollWidth })) : [];
  })()`);

  console.log('P0_ACCEPT', JSON.stringify({
    viewport,
    selected,
    variantState,
    variantAfter,
    matrixBefore,
    comboAdded,
    matrixAfter,
    instanceSelected,
    variantReset,
    expandInstance,
    pickInstanceText,
    overrideEdit,
    overrideState,
    masterEdit,
    masterPick,
    pickMasterText,
    masterTextEdited,
    syncClicked,
    syncButton,
    pickSyncedText,
    syncState,
    resetClicked,
    resetState,
    resetText,
    swapSelect,
    swapChanged,
    swapState,
    panelSelected,
    variablesPanel,
    variablesOpen,
    modalState,
    aliasChanged,
    aliasState,
    darkMode,
    menuState,
    libraryOpen,
    libraryState,
    facetInput,
    facetAdded,
    facetState,
    externalState,
    importClicked,
    importState,
    instanceCreated,
    masterSelected,
    refreshClicked,
    refreshState,
    libraryInstanceSelected,
    libraryInstanceState,
    overflow,
  }, null, 2));
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

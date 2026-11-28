import fs from 'node:fs';

const port = process.env.CDP_PORT || '9241';
const editorOut = process.env.PROTO_EDITOR_OUT;
const playerOut = process.env.PROTO_PLAYER_OUT;
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
  await sleep(3000);

  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('首页'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(800);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('首页'));
    row?.querySelector('.layer-caret')?.click();
    return Boolean(row);
  })()`);
  await sleep(500);

  const editorState = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '原型');
    if (sec) sec.scrollIntoView({ block: 'center' });
    const select = sec?.querySelector('.proto-select');
    const options = select ? [...select.options].map((o) => ({ text: o.textContent, selected: o.selected })) : [];
    const panel = document.querySelector('.inspector-scroll');
    if (panel) panel.scrollTop = Math.max(0, panel.scrollTop - 4);
    const overflow = [...document.querySelectorAll('.right-panel *')]
      .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
      .slice(0, 12)
      .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 50), cw: el.clientWidth, sw: el.scrollWidth }));
    const layerChips = [...document.querySelectorAll('.layer-row')].filter((el) => el.textContent.includes('交互')).length;
    return {
      type: document.querySelector('.type-chip')?.textContent ?? '',
      hasSection: Boolean(sec),
      sectionText: sec?.innerText.replace(/\\n/g, ' | ') ?? '',
      options,
      layerChips,
      overflow,
    };
  })()`);
  await sleep(400);
  console.log('EDITOR', JSON.stringify({ selected, editorState }));
  await shoot(editorOut);

  const pickedTarget = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('查看详情按钮'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(600);
  const clearTarget = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '原型');
    const select = sec?.querySelector('.proto-select');
    if (!select) return { ok: false };
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`);
  await sleep(500);
  const setTarget = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '原型');
    const select = sec?.querySelector('.proto-select');
    if (!select) return { ok: false };
    select.value = 'detail';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value, disabled: select.disabled };
  })()`);
  await sleep(600);
  const afterSet = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '原型');
    const select = sec?.querySelector('.proto-select');
    const chip = [...document.querySelectorAll('.layer-row')]
      .find((el) => el.textContent.includes('查看详情按钮'))?.textContent ?? '';
    return {
      value: select?.value ?? '',
      text: sec?.innerText.replace(/\\n/g, ' | ') ?? '',
      chip,
      type: document.querySelector('.type-chip')?.textContent ?? '',
    };
  })()`);
  await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    return true;
  })()`);
  await sleep(1100);
  let savedTarget = null;
  if (process.env.PROTO_SCENE) {
    const scene = JSON.parse(fs.readFileSync(process.env.PROTO_SCENE, 'utf8'));
    savedTarget = scene.nodes?.['home-cta']?.prototype ?? null;
  }
  await evaluate(`(() => {
    document.activeElement?.blur?.();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    return true;
  })()`);
  await sleep(500);
  const afterUndo = await evaluate(`(() => {
    const select = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '原型')?.querySelector('.proto-select');
    return {
      value: select?.value ?? '',
      chip: [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('查看详情按钮'))?.textContent ?? '',
    };
  })()`);
  await evaluate(`(() => {
    document.activeElement?.blur?.();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    return true;
  })()`);
  await sleep(500);
  const afterRedo = await evaluate(`(() => {
    const select = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '原型')?.querySelector('.proto-select');
    return {
      value: select?.value ?? '',
      chip: [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('查看详情按钮'))?.textContent ?? '',
    };
  })()`);
  console.log('TARGET', JSON.stringify({ pickedTarget, clearTarget, setTarget, afterSet, savedTarget, afterUndo, afterRedo }));
  await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '原型');
    sec?.scrollIntoView({ block: 'center' });
    const scroll = document.querySelector('.inspector-scroll');
    if (scroll) scroll.scrollTop = Math.max(0, scroll.scrollTop - 6);
    return Boolean(sec);
  })()`);
  await sleep(400);
  await shoot(process.env.PROTO_TARGET_OUT);

  const opened = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.export-btn')].find((b) => b.textContent.includes('演示'));
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(1400);

  const playerHome = await evaluate(`(() => {
    const card = document.querySelector('.proto-card');
    const frame = document.querySelector('.proto-frame');
    const img = frame?.querySelector('img');
    return {
      open: Boolean(card),
      name: document.querySelector('.proto-name')?.textContent ?? '',
      count: document.querySelector('.proto-count')?.textContent ?? '',
      hotspots: document.querySelectorAll('.proto-hotspot').length,
      frame: frame ? { w: Math.round(frame.getBoundingClientRect().width), h: Math.round(frame.getBoundingClientRect().height) } : null,
      image: img ? { natural: [img.naturalWidth, img.naturalHeight], src: img.src.slice(0, 24) } : null,
      hint: document.querySelector('.proto-hint')?.textContent ?? '',
    };
  })()`);
  if (!playerHome.open) throw new Error('播放器没有打开');
  const clicked = await evaluate(`(() => {
    const btn = document.querySelector('.proto-hotspot');
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(900);
  const playerDetail = await evaluate(`(() => {
    const card = document.querySelector('.proto-card');
    const frame = document.querySelector('.proto-frame');
    const img = frame?.querySelector('img');
    return {
      open: Boolean(card),
      name: document.querySelector('.proto-name')?.textContent ?? '',
      count: document.querySelector('.proto-count')?.textContent ?? '',
      hotspots: [...document.querySelectorAll('.proto-hotspot')].map((b) => ({ title: b.title, disabled: b.disabled })),
      backDisabled: document.querySelector('.proto-icon-btn')?.disabled ?? null,
      frame: frame ? { w: Math.round(frame.getBoundingClientRect().width), h: Math.round(frame.getBoundingClientRect().height) } : null,
      image: img ? { natural: [img.naturalWidth, img.naturalHeight] } : null,
    };
  })()`);
  console.log('PLAYER', JSON.stringify({ opened, playerHome, clicked, playerDetail }));
  await shoot(playerOut);

  const closed = await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return true;
  })()`);
  await sleep(500);
  const afterClose = await evaluate(`(() => ({
    open: Boolean(document.querySelector('.proto-card')),
    editorVisible: Boolean(document.querySelector('.canvas-shell, .canvas-host, .workspace')),
  }))()`);
  console.log('CLOSE', JSON.stringify({ closed, afterClose }));
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });

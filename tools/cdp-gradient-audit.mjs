import fs from 'node:fs';

const port = process.env.CDP_PORT || '9247';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|127\.0\.0\.1|localhost/.test(t.url)) ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有 Groma 页面');
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
    msg.error ? slot.reject(new Error(msg.error.message)) : slot.resolve(msg.result);
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
  const centerOf = (selector) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
  const drag = async (from, to) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, button: 'none', buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(40);
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const y = from.y + ((to.y - from.y) * i) / steps;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
      await sleep(20);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(220);
  };
  const state = () => evaluate(`(() => {
    const field = (label) => [...document.querySelectorAll('.field')].find((el) => el.querySelector('.field-label')?.textContent.trim() === label)?.querySelector('input')?.value ?? null;
    const handle = (name) => {
      const el = document.querySelector('[data-gradient-handle="' + name + '"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round((r.left + r.width / 2) * 10) / 10, y: Math.round((r.top + r.height / 2) * 10) / 10 };
    };
    return {
      selected: document.querySelector('.layer-row.is-selected .layer-name')?.textContent.trim() ?? null,
      type: [...document.querySelectorAll('.fill-type-btn')].find((el) => el.classList.contains('is-on'))?.textContent.trim() ?? null,
      angle: field('角度'),
      hint: document.querySelector('.gradient-canvas-hint')?.textContent.trim() ?? null,
      handles: { start: handle('start'), end: handle('end'), move: handle('move'), stop1: handle('stop-1') },
      stopPercent: document.querySelector('[aria-label="色标 2 位置百分比"]')?.value ?? null,
    };
  })()`);

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(900);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '天气图标');
    row?.querySelector('.layer-caret')?.click();
  })()`);
  await sleep(350);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.querySelector('.layer-name')?.textContent.trim() === '天空渐变');
    row?.click();
  })()`);
  await sleep(650);
  const before = await state();
  const start = await centerOf('[data-gradient-handle="start"]');
  const end = await centerOf('[data-gradient-handle="end"]');
  const move = await centerOf('[data-gradient-handle="move"]');
  if (!start || !end || !move) throw new Error('线性渐变手柄没有出现');
  await drag(end, { x: end.x - 70, y: end.y - 150 });
  const afterAngle = await state();
  const move2 = await centerOf('[data-gradient-handle="move"]');
  if (!move2) throw new Error('移动手柄消失');
  await drag(move2, { x: move2.x + 55, y: move2.y + 28 });
  const afterMove = await state();
  const stop = await centerOf('[data-gradient-handle="stop-1"]');
  const start2 = await centerOf('[data-gradient-handle="start"]');
  const end2 = await centerOf('[data-gradient-handle="end"]');
  if (!stop || !start2 || !end2) throw new Error('色标或端点缺失');
  await drag(stop, { x: start2.x + (end2.x - start2.x) * 0.76, y: start2.y + (end2.y - start2.y) * 0.76 });
  const afterStop = await state();
  await sleep(350);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync('shots/gradient-handles.png', Buffer.from(shot.data, 'base64'));
  console.log('BEFORE', JSON.stringify(before));
  console.log('AFTER_ANGLE', JSON.stringify(afterAngle));
  console.log('AFTER_MOVE', JSON.stringify(afterMove));
  console.log('AFTER_STOP', JSON.stringify(afterStop));
  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });

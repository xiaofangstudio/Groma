import fs from 'node:fs';

const port = process.env.CDP_PORT || '9241';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (!msg.id) return;
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    msg.error ? slot.rej(new Error(msg.error.message)) : slot.res(msg.result);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  };
  const key = async (keyName, code, vk, mods = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods });
    await sleep(80);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods });
    await sleep(180);
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(220);
  };
  const drag = async (x1, y1, x2, y2) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1, button: 'none', clickCount: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / 12, y: y1 + (y2 - y1) * i / 12, button: 'left', buttons: 1 });
      await sleep(28);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 });
    await sleep(320);
  };
  const state = () => evaluate(`(() => ({
    tool: [...document.querySelectorAll('.tool-button')].find((b) => b.classList.contains('is-active'))?.getAttribute('title') || '',
    layers: [...document.querySelectorAll('.layer-row .layer-name, .layer-row')].slice(0, 20).map((e) => e.textContent.trim().replace(/\\s+/g, ' ')),
    layerCount: document.querySelectorAll('.layer-row').length,
    selected: [...document.querySelectorAll('.layer-row.is-selected .layer-name')].map((e) => e.textContent.trim()),
    zoom: [...document.querySelectorAll('.zoom-control, .zoom-label, .zoom-value')].map((e) => e.textContent.trim()).filter(Boolean),
    body: document.body.innerText.slice(0, 400),
  }))()`);

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(2600);

  const info = await evaluate(`(() => {
    const c = document.querySelector('.canvas-host');
    const r = c?.getBoundingClientRect();
    return { w: innerWidth, h: innerHeight, canvas: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null };
  })()`);
  console.log('INFO', JSON.stringify(info));
  console.log('START', JSON.stringify(await state()));

  if (!info.canvas) throw new Error('canvas-host not found');
  const c = info.canvas;
  const inside = (fx, fy) => ({ x: c.x + c.w * fx, y: c.y + c.h * fy });

  // 1. Rectangle via R shortcut + drag
  await key('r', 'KeyR', 82);
  let p1 = inside(0.36, 0.30);
  let p2 = inside(0.56, 0.46);
  await drag(p1.x, p1.y, p2.x, p2.y);
  console.log('RECT', JSON.stringify(await state()));

  // 2. Text via T shortcut + click + type
  await key('t', 'KeyT', 84);
  p1 = inside(0.38, 0.53);
  await click(p1.x, p1.y);
  await send('Input.insertText', { text: '可用性测试' });
  await sleep(500);
  await key('Escape', 'Escape', 27);
  console.log('TEXT', JSON.stringify(await state()));

  // 3. Copy/paste
  await key('v', 'KeyV', 86);
  p1 = inside(0.46, 0.38);
  await click(p1.x, p1.y);
  const beforeCopy = (await state()).layerCount;
  await key('c', 'KeyC', 67, 2);
  await key('v', 'KeyV', 86, 2);
  await sleep(450);
  const afterCopy = (await state()).layerCount;
  console.log('COPY', JSON.stringify({ beforeCopy, afterCopy, ...(await state()) }));

  // 4. Select all
  await key('a', 'KeyA', 65, 2);
  await sleep(250);
  console.log('SELECT_ALL', JSON.stringify(await state()));

  // 5. Undo/redo
  await key('z', 'KeyZ', 90, 2);
  await sleep(350);
  console.log('UNDO', JSON.stringify(await state()));
  await key('z', 'KeyZ', 90, 10);
  await sleep(350);
  console.log('REDO', JSON.stringify(await state()));

  // 6. Wheel zoom
  const mid = inside(0.5, 0.5);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: -240, modifiers: 2 });
  await sleep(450);
  console.log('ZOOM', JSON.stringify(await state()));

  // 6. Save and inspect toast
  await key('s', 'KeyS', 83, 2);
  await sleep(450);
  const saveText = await evaluate(`document.querySelector('.toast, .save-state, .status-toast')?.innerText || ''`);
  console.log('SAVE', JSON.stringify(saveText));

  console.log('ERRORS', JSON.stringify(consoleErrors.slice(0, 8)));
  await key('!', 'Digit1', 49, 8);
  await sleep(600);
  await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    rows[rows.length - 1]?.click();
    return rows.length;
  })()`);
  await sleep(350);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const out = 'D:\\20533\\deskbox\\fangwork\\Groma\\shots\\ux-core.png';
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SHOT', out, fs.statSync(out).size);
  ws.close();
}

main().catch((e) => { console.error('FAIL', e.stack || e); process.exit(1); });

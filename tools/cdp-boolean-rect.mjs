const port = process.env.CDP_PORT || '9222';
const op = process.env.BOOL_OP || 'union';
const reverse = process.env.BOOL_REVERSE === '1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|127\.0\.0\.1|localhost/.test(t.url)) ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到 Groma 页面');
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
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result?.value;
  };
  const drag = async (x1, y1, x2, y2) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1 });
    await sleep(50);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x2, y: y2, button: 'left', buttons: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 });
    await sleep(200);
  };
  const click = async (x, y, modifiers = 0) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', modifiers, clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', modifiers, clickCount: 1 });
    await sleep(160);
  };
  const key = async (name, code, vk, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(250);
  };
  const rectCenter = (text) => evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes(${JSON.stringify(text)}));
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);

  await send('Runtime.enable');
  await sleep(400);
  await evaluate(`document.querySelector('[aria-label="矩形工具"]')?.click()`);
  await sleep(250);
  await drag(470, 300, 760, 570);
  await evaluate(`document.querySelector('[aria-label="矩形工具"]')?.click()`);
  await sleep(250);
  await drag(650, 360, 930, 620);
  await sleep(450);
  const rows = await evaluate(`(() => [...document.querySelectorAll('.layer-row')].map((item) => item.textContent.trim()).slice(0, 20))()`);
  console.log('ROWS', JSON.stringify(rows));
  const first = await rectCenter(reverse ? '矩形 2' : '矩形 1');
  const second = await rectCenter(reverse ? '矩形 1' : '矩形 2');
  if (!first || !second) throw new Error('没有找到两个矩形图层');
  await click(first.x, first.y);
  await click(second.x, second.y, 8);
  await sleep(350);
  console.log('SELECTED', JSON.stringify(await evaluate(`document.querySelector('.statusbar')?.innerText.slice(0, 120)`)));
  const labels = { union: '并集', subtract: '差集', intersect: '交集', exclude: '排除' };
  const label = labels[op];
  const button = await evaluate(`(() => {
    const target = document.querySelector('[aria-label="${label}"]');
    if (!target) return { found: false };
    const rect = target.getBoundingClientRect();
    return { found: true, disabled: target.disabled, title: target.getAttribute('title'), x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  console.log('BUTTON', JSON.stringify(button));
  if (!button.found) throw new Error('没有布尔按钮');
  if (button.disabled) throw new Error('布尔按钮被禁用：' + button.title);
  await click(button.x, button.y);
  await sleep(550);
  const after = await evaluate(`(() => ({
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 430),
    rows: [...document.querySelectorAll('.layer-row')].map((item) => item.textContent.trim()).slice(0, 12),
    status: document.querySelector('.statusbar')?.innerText.slice(0, 120),
    toast: document.querySelector('.toast strong')?.innerText
  }))()`);
  console.log('AFTER_BOOL', JSON.stringify(after));

  await key('z', 'KeyZ', 90, 2);
  console.log('AFTER_UNDO', JSON.stringify(await evaluate(`(() => ({
    rows: [...document.querySelectorAll('.layer-row')].map((item) => item.textContent.trim()).slice(0, 12),
    toast: document.querySelector('.toast strong')?.innerText
  }))()`)));
  await key('z', 'KeyZ', 90, 10);
  await sleep(350);
  console.log('AFTER_REDO', JSON.stringify(await evaluate(`(() => ({
    rows: [...document.querySelectorAll('.layer-row')].map((item) => item.textContent.trim()).slice(0, 12),
    toast: document.querySelector('.toast strong')?.innerText
  }))()`)));
  await key('s', 'KeyS', 83, 2);
  await sleep(750);
  console.log('SAVED', JSON.stringify(await evaluate(`document.querySelector('.statusbar')?.innerText.slice(-40)`)));
  await ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });

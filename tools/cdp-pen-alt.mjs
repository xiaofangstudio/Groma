const port = process.env.CDP_PORT || '9222';
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
  const mouse = async (type, x, y, buttons = 0, modifiers = 0) => {
    await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1, modifiers });
  };
  const dragWithAlt = async (from, dx, dy) => {
    await mouse('mousePressed', from.x, from.y, 1, 1);
    for (let step = 1; step <= 8; step += 1) {
      await mouse('mouseMoved', from.x + (dx * step) / 8, from.y + (dy * step) / 8, 1, 1);
      await sleep(45);
    }
    await mouse('mouseReleased', from.x + dx, from.y + dy, 0, 1);
    await sleep(240);
  };
  const anchors = () => evaluate(`(() => [...document.querySelectorAll('.pen-overlay .pen-anchor')].map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }))()`);

  await send('Runtime.enable');
  await sleep(350);
  await evaluate(`(() => {
    if ([...document.querySelectorAll('.layer-row')].some((item) => item.textContent.includes('钢笔 1'))) return true;
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('桌面 1440'));
    row?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(300);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('钢笔 1'));
    if (!row) return false;
    row.click();
    document.querySelector('[aria-label="钢笔工具"]')?.click();
    return true;
  })()`);
  if (!selected) throw new Error('没有选中钢笔 1');
  await sleep(300);
  await evaluate(`document.querySelector('.zoom-value')?.click()`);
  await sleep(400);
  console.log('BEFORE_ANCHORS', JSON.stringify(await anchors()));

  const handlePoint = await evaluate(`(() => {
    const rect = document.querySelectorAll('.pen-overlay .pen-handle-dot')[5]?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!handlePoint) throw new Error('没有找到 out 手柄');
  await dragWithAlt(handlePoint, 54, -32);
  console.log('AFTER_ANCHORS', JSON.stringify(await anchors()));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
  await sleep(900);
  console.log('SAVED', JSON.stringify(await evaluate(`(() => ({ status: document.querySelector('.statusbar')?.innerText }))()`)));
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });

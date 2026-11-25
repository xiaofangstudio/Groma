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
  const mouse = async (x, y, modifiers = 0, clickCount = 1) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', modifiers, clickCount });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', modifiers, clickCount });
    await sleep(120);
  };

  await send('Runtime.enable');
  await sleep(350);
  await evaluate(`(() => {
    if ([...document.querySelectorAll('.layer-row')].some((item) => item.textContent.includes('钢笔 1'))) return true;
    const frameRow = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('桌面 1440'));
    frameRow?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(320);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('钢笔 1'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('图层树里没有钢笔 1');
  await sleep(300);
  await evaluate(`document.querySelector('[aria-label="钢笔工具"]')?.click()`);
  await sleep(450);

  const target = await evaluate(`(() => {
    const anchor = document.querySelector('.pen-overlay .pen-anchor');
    const rect = anchor?.getBoundingClientRect();
    return rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null;
  })()`);
  if (!target) throw new Error('没有锚点');
  console.log('BRANCH_START', JSON.stringify(target));
  await mouse(target.x, target.y, 1);
  await mouse(1030, 820);
  await mouse(950, 870);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(550);

  const after = await evaluate(`(() => ({
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 460),
    anchors: document.querySelectorAll('.pen-overlay .pen-anchor').length,
    status: document.querySelector('.statusbar')?.innerText.slice(0, 140)
  }))()`);
  console.log('AFTER', JSON.stringify(after));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await sleep(40);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await sleep(700);
  console.log('SAVED', JSON.stringify(await evaluate(`(() => ({ status: document.querySelector('.statusbar')?.innerText.slice(-30), toast: document.querySelector('.toast strong')?.innerText }))()`)));
  await ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });

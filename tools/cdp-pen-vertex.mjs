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
  const drag = async (x, y, dx, dy) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx / 2, y: y + dy / 2, button: 'left', buttons: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y: y + dy, button: 'left', buttons: 1 });
    await sleep(90);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y: y + dy, button: 'left', clickCount: 1 });
    await sleep(250);
  };
  const key = async (name, code, vk, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(150);
  };
  const inspector = () => evaluate(`document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 520)`);

  await send('Runtime.enable');
  await sleep(400);
  await evaluate(`(() => {
    if ([...document.querySelectorAll('.layer-row')].some((item) => item.textContent.includes('钢笔 1'))) return true;
    const frameRow = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('桌面 1440'));
    frameRow?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(350);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('钢笔 1'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('图层树里没有钢笔 1');
  await sleep(350);
  await evaluate(`document.querySelector('[aria-label="钢笔工具"]')?.click()`);
  await sleep(450);

  const firstAnchors = await evaluate(`(() => [...document.querySelectorAll('.pen-overlay .pen-anchor.is-first')].map((node) => {
    const r = node.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }))()`);
  console.log('FIRST_ANCHORS_BEFORE', JSON.stringify(firstAnchors));
  const target = firstAnchors[0];
  if (!target) throw new Error('没有首锚点');
  await mouse(target.x, target.y, 1);
  await mouse(target.x + 190, target.y + 150);
  await mouse(target.x + 105, target.y + 240);
  await key('Enter', 'Enter', 13);
  await sleep(550);

  const sharedTarget = await evaluate(`(() => {
    const points = [...document.querySelectorAll('.pen-overlay .pen-anchor')].map((node) => {
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    const map = new Map();
    for (const p of points) {
      const k = p.x + ',' + p.y;
      map.set(k, (map.get(k) || 0) + 1);
    }
    for (const [k, n] of map.entries()) if (n >= 2) {
      const [x, y] = k.split(',').map(Number);
      return { x, y, overlap: n, total: points.length };
    }
    return null;
  })()`);
  if (!sharedTarget) throw new Error('没有找到共享坐标锚点');
  console.log('SHARED_TARGET', JSON.stringify(sharedTarget));
  await drag(sharedTarget.x, sharedTarget.y, 58, 36);
  console.log('INSPECTOR_AFTER_DRAG', JSON.stringify(await inspector()));

  await key('s', 'KeyS', 83, 2);
  await sleep(700);

  await key('Delete', 'Delete', 46, 2);
  const afterDelete = await evaluate(`(() => ({
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 520),
    toast: document.querySelector('.toast strong')?.innerText,
    anchors: document.querySelectorAll('.pen-overlay .pen-anchor').length
  }))()`);
  console.log('AFTER_CTRL_DELETE', JSON.stringify(afterDelete));
  await key('z', 'KeyZ', 90, 2);
  await sleep(500);
  console.log('AFTER_UNDO', JSON.stringify(await inspector()));
  await key('s', 'KeyS', 83, 2);
  await sleep(700);

  const finalState = await evaluate(`(() => ({
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 520),
    anchors: document.querySelectorAll('.pen-overlay .pen-anchor').length,
    status: document.querySelector('.statusbar')?.innerText.slice(0, 180),
    toast: document.querySelector('.toast strong')?.innerText
  }))()`);
  console.log('FINAL', JSON.stringify(finalState));
  await ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });

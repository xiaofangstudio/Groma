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
  const mouse = async (type, x, y, buttons = 0) => {
    await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  };
  const drag = async (from, dx, dy) => {
    await mouse('mousePressed', from.x, from.y, 1);
    for (let step = 1; step <= 8; step += 1) {
      await mouse('mouseMoved', from.x + (dx * step) / 8, from.y + (dy * step) / 8, 1);
      await sleep(45);
    }
    await mouse('mouseReleased', from.x + dx, from.y + dy, 0);
    await sleep(220);
  };
  const click = async (point) => {
    await mouse('mousePressed', point.x, point.y, 1);
    await sleep(55);
    await mouse('mouseReleased', point.x, point.y, 0);
    await sleep(260);
  };
  const snapshot = async () => evaluate(`(() => {
    const anchors = document.querySelectorAll('.pen-overlay .pen-anchor');
    const handles = document.querySelectorAll('.pen-overlay .pen-handle-dot');
    const inspector = document.querySelector('.right-panel .inspector-scroll')?.innerText ?? '';
    const counts = inspector.match(/锚点\\s*\\n(\\d+)\\s*个/);
    return {
      anchors: anchors.length,
      handles: handles.length,
      inspectorAnchors: counts ? Number(counts[1]) : null,
      closed: inspector.includes('路径\\n闭合'),
      selectedAnchor: document.querySelectorAll('.pen-anchor.is-selected').length
    };
  })()`);

  await send('Runtime.enable');
  await sleep(350);
  await evaluate(`(() => {
    if ([...document.querySelectorAll('.layer-row')].some((item) => item.textContent.includes('钢笔 1'))) return true;
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('桌面 1440'));
    row?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(320);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('钢笔 1'));
    if (!row) return false;
    row.click();
    document.querySelector('[aria-label="钢笔工具"]')?.click();
    return true;
  })()`);
  if (!selected) throw new Error('没有选中钢笔 1');
  await sleep(350);
  await evaluate(`document.querySelector('.zoom-value')?.click()`);
  await sleep(450);
  console.log('INITIAL', JSON.stringify(await snapshot()));

  const anchorPoint = await evaluate(`(() => {
    const rect = document.querySelectorAll('.pen-overlay .pen-anchor')[2]?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!anchorPoint) throw new Error('没有找到第 3 个锚点');
  await drag(anchorPoint, 96, 52);
  console.log('ANCHOR_DRAG', JSON.stringify(await snapshot()));

  const handlePoint = await evaluate(`(() => {
    const rect = document.querySelectorAll('.pen-overlay .pen-handle-dot')[6]?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!handlePoint) throw new Error('没有找到手柄控制点');
  await drag(handlePoint, 42, -24);
  console.log('HANDLE_DRAG', JSON.stringify(await snapshot()));

  const insertPoint = await evaluate(`(() => {
    const path = document.querySelector('.pen-overlay .pen-preview-path');
    if (!path) return null;
    const matrix = path.getScreenCTM();
    const anchors = [...document.querySelectorAll('.pen-anchor')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    let best = null;
    for (let i = 1; i < 30; i += 1) {
      const fraction = i / 30;
      const p = path.getPointAtLength(path.getTotalLength() * fraction);
      const point = new DOMPoint(p.x, p.y).matrixTransform(matrix);
      const clearance = Math.min(...anchors.map((a) => Math.hypot(a.x - point.x, a.y - point.y)));
      if (!best || clearance > best.clearance) best = { x: point.x, y: point.y, clearance };
    }
    return best;
  })()`);
  if (!insertPoint) throw new Error('没有找到可插入锚点的位置');
  if (insertPoint.clearance < 9) throw new Error(`线段取样点离锚点太近：${insertPoint.clearance.toFixed(1)}px`);
  await click(insertPoint);
  console.log('INSERT', JSON.stringify(await snapshot()));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
  await sleep(420);
  console.log('DELETE', JSON.stringify(await snapshot()));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
  await sleep(1000);
  console.log('SAVED', JSON.stringify(await evaluate(`(() => ({ status: document.querySelector('.statusbar')?.innerText }))()`)));

  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });

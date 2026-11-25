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
  const click = async (point, modifiers = 0) => {
    await mouse('mousePressed', point.x, point.y, 1, modifiers);
    await sleep(60);
    await mouse('mouseReleased', point.x, point.y, 0, modifiers);
    await sleep(260);
  };
  const drag = async (from, dx, dy) => {
    await mouse('mousePressed', from.x, from.y, 1);
    for (let step = 1; step <= 8; step += 1) {
      await mouse('mouseMoved', from.x + (dx * step) / 8, from.y + (dy * step) / 8, 1);
      await sleep(45);
    }
    await mouse('mouseReleased', from.x + dx, from.y + dy, 0);
    await sleep(260);
  };
  const snapshot = async () => evaluate(`(() => {
    const anchors = document.querySelectorAll('.pen-overlay .pen-anchor');
    const handles = document.querySelectorAll('.pen-overlay .pen-handle-dot');
    const inspector = document.querySelector('.right-panel .inspector-scroll')?.innerText ?? '';
    const anchorTotal = inspector.match(/锚点\\s*\\n(\\d+)\\s*个/);
    const contourTotal = inspector.match(/轮廓\\s*\\n(\\d+)\\s*条/);
    const pathState = inspector.match(/路径\\s*\\n([^\\n]+)/);
    return {
      anchors: anchors.length,
      handles: handles.length,
      inspectorAnchors: anchorTotal ? Number(anchorTotal[1]) : null,
      contours: contourTotal ? Number(contourTotal[1]) : null,
      pathState: pathState ? pathState[1] : null,
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
  await sleep(320);
  await evaluate(`document.querySelector('.zoom-value')?.click()`);
  await sleep(450);
  console.log('BEFORE_BRANCH', JSON.stringify(await snapshot()));

  await click({ x: 1130, y: 700 }, 1);
  await click({ x: 1270, y: 720 });
  await click({ x: 1200, y: 860 });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(500);
  console.log('AFTER_BRANCH', JSON.stringify(await snapshot()));

  const anchorPoint = await evaluate(`(() => {
    const rect = document.querySelectorAll('.pen-overlay .pen-anchor')[5]?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!anchorPoint) throw new Error('没有找到第二轮廓的首锚点');
  await drag(anchorPoint, 34, -26);
  console.log('AFTER_BRANCH_ANCHOR_DRAG', JSON.stringify(await snapshot()));

  const insertPoint = await evaluate(`(() => {
    const paths = [...document.querySelectorAll('.pen-overlay .pen-preview-path')];
    const path = paths[paths.length - 1];
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
  if (!insertPoint) throw new Error('没有找到第二轮廓可插点线段');
  if (insertPoint.clearance < 9) throw new Error(`第二轮廓取样点离锚点太近：${insertPoint.clearance.toFixed(1)}px`);
  await click(insertPoint);
  console.log('AFTER_BRANCH_INSERT', JSON.stringify(await snapshot()));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
  await sleep(400);
  console.log('AFTER_BRANCH_DELETE', JSON.stringify(await snapshot()));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
  await sleep(1000);
  console.log('SAVED', JSON.stringify(await evaluate(`(() => ({ status: document.querySelector('.statusbar')?.innerText }))()`)));
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });

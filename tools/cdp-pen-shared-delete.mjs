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
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(160);
  };
  const key = async (name, code, vk, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(250);
  };

  await send('Runtime.enable');
  await sleep(400);
  await evaluate(`(() => {
    if ([...document.querySelectorAll('.layer-row')].some((item) => item.textContent.includes('钢笔 1'))) return true;
    const frameRow = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('桌面 1440'));
    frameRow?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(300);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('钢笔 1'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(350);
  await evaluate(`document.querySelector('[aria-label="钢笔工具"]')?.click()`);
  await sleep(450);
  const target = await evaluate(`(() => {
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
  if (!target) throw new Error('没有共享锚点');
  await click(target.x, target.y);
  await key('Delete', 'Delete', 46);
  console.log('AFTER_DELETE', JSON.stringify(await evaluate(`(() => ({
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 360),
    anchors: document.querySelectorAll('.pen-overlay .pen-anchor').length
  }))()`)));
  await key('s', 'KeyS', 83, 2);
  await sleep(700);
  await ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });

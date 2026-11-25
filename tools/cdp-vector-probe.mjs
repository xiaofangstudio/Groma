const port = process.env.CDP_PORT || '9238';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|127\.0\.0\.1|localhost/.test(t.url)) ?? targets.find((t) => t.type === 'page');
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
  await send('Runtime.enable');
  await sleep(300);
  await evaluate(`(() => {
    const frame = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('桌面 1440'));
    frame?.querySelector('.layer-caret')?.click();
  })()`);
  await sleep(250);
  await evaluate(`(() => {
    const items = ['黄色卡片','墨色横条'].map((label) => [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes(label)));
    items[0].click();
    items[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  })()`);
  await sleep(400);
  console.log('METRICS', JSON.stringify(await evaluate(`(() => {
    const info = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const s = getComputedStyle(node);
      return { text: node.innerText.trim(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), display: s.display, visibility: s.visibility, z: s.zIndex, overflow: s.overflow };
    };
    const byLabel = (name) => info(document.querySelector('[aria-label="' + name + '"]'));
    return {
      viewport: [innerWidth, innerHeight],
      topbar: info(document.querySelector('.topbar')),
      left: info(document.querySelector('.topbar-left')),
      tools: info(document.querySelector('.topbar-tools')),
      wide: info(document.querySelector('.bool-wide')),
      union: byLabel('并集'), subtract: byLabel('差集'), intersect: byLabel('交集'), exclude: byLabel('排除'),
      more: byLabel('更多矢量操作'), compact: byLabel('矢量运算'),
      compactWrap: info(document.querySelector('.bool-compact-wrap')),
      reason: info(document.querySelector('.bool-reason')),
      status: document.querySelector('.statusbar')?.innerText
    };
  })()`)));
  const more = await evaluate(`(() => {
    const node = document.querySelector('[aria-label="更多矢量操作"]');
    if (!node || !node.offsetParent) return null;
    const r = node.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (more) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: more.x, y: more.y, button: 'left', clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: more.x, y: more.y, button: 'left', clickCount: 1 });
    await sleep(350);
  }
  console.log('MENU', JSON.stringify(await evaluate(`(() => ({
    menus: [...document.querySelectorAll('.bool-menu')].map((node) => {
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), items: [...node.querySelectorAll('.bool-menu-item')].map((item) => { const ir = item.getBoundingClientRect(); return { label: item.innerText.trim(), disabled: item.disabled, x: Math.round(ir.left), y: Math.round(ir.top) }; }) };
    }),
    shade: Boolean(document.querySelector('.bool-menu-shade'))
  }))()`)));
  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });

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
  const click = async (x, y, modifiers = 0) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', modifiers, clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', modifiers, clickCount: 1 });
    await sleep(160);
  };
  const rowCenter = (text) => evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes(${JSON.stringify(text)}));
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);

  await send('Runtime.enable');
  await sleep(400);
  await evaluate(`(() => {
    if ([...document.querySelectorAll('.layer-row')].some((item) => item.textContent.includes('钢笔 1'))) return true;
    const frameRow = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('桌面 1440'));
    frameRow?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(300);
  const first = await rowCenter('钢笔 1');
  const second = await rowCenter('钢笔 2');
  if (!first || !second) throw new Error('没有两条钢笔路径');
  await click(first.x, first.y);
  await click(second.x, second.y, 8);
  await sleep(300);
  const buttons = await evaluate(`(() => ['并集','差集','交集','排除'].map((name) => {
    const node = document.querySelector('[aria-label="' + name + '"]');
    if (!node) return { name, found: false };
    return { name, found: true, disabled: node.disabled, title: node.getAttribute('title') };
  }))()`);
  console.log('FAIL_STATE', JSON.stringify(buttons));
  console.log('STATUS', JSON.stringify(await evaluate(`document.querySelector('.statusbar')?.innerText.slice(0, 120)`)));
  console.log('METRICS', JSON.stringify(await evaluate(`(() => {
    const rect = (sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; };
    return {
      viewport: [innerWidth, innerHeight],
      topbar: rect('.topbar'),
      left: rect('.topbar-left'),
      tools: rect('.topbar-tools'),
      boolUnion: rect('[aria-label="并集"]'),
      boolSubtract: rect('[aria-label="差集"]'),
      boolIntersect: rect('[aria-label="交集"]'),
      boolExclude: rect('[aria-label="排除"]'),
      boolCompact: rect('[aria-label="矢量运算"]'),
      reason: rect('.bool-reason'),
      reasonText: document.querySelector('.bool-reason')?.innerText ?? '',
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  })()`)));
  const compact = await evaluate(`(() => {
    const node = document.querySelector('[aria-label="矢量运算"]');
    if (!node || !node.offsetParent) return null;
    const rect = node.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  if (compact) {
    await click(compact.x, compact.y);
    await sleep(250);
    console.log('COMPACT_MENU', JSON.stringify(await evaluate(`(() => ({
      open: Boolean(document.querySelector('.bool-menu')),
      items: [...document.querySelectorAll('.bool-menu-item')].map((item) => ({ label: item.innerText, disabled: item.disabled, title: item.getAttribute('title') })),
      reason: document.querySelector('.bool-menu-reason')?.innerText ?? ''
    }))()`)));
  }
  await ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });

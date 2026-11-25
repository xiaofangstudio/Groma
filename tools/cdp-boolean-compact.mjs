const port = process.env.CDP_PORT || '9238';
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

  await send('Runtime.enable');
  await sleep(350);

  const expanded = await evaluate(`(() => {
    const frame = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('桌面 1440'));
    frame?.querySelector('.layer-caret')?.click();
    return Boolean(frame);
  })()`);
  console.log('EXPAND', expanded);
  await sleep(260);

  const three = process.env.BOOL_THREE === '1';
  const labels = three ? ['黄色卡片', '墨色圆', '墨色横条'] : ['黄色卡片', '墨色横条'];
  const rows = await evaluate(`(() => {
    const labels = ${JSON.stringify(labels)};
    const items = labels.map((label) => [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes(label)));
    if (items.some((item) => !item)) return { ok: false, labels: [...document.querySelectorAll('.layer-row')].map((row) => row.innerText.trim()) };
    items[0].click();
    for (const item of items.slice(1)) item.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    return { ok: true, count: items.length };
  })()`);
  console.log('SELECT', JSON.stringify(rows));
  if (!rows.ok) throw new Error('没有找到可布尔的图层');
  await sleep(350);
  console.log('STATUS', JSON.stringify(await evaluate(`document.querySelector('.statusbar')?.innerText.slice(0, 160)`)));

  const compact = await evaluate(`(() => {
    const target = document.querySelector('[aria-label="矢量运算"]');
    if (!target || !target.offsetParent) return null;
    const rect = target.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  if (!compact) throw new Error('紧凑布尔按钮未显示');
  await click(compact.x, compact.y);
  await sleep(220);

  const menu = await evaluate(`(() => ({
    open: Boolean(document.querySelector('.bool-menu')),
    items: [...document.querySelectorAll('.bool-menu-item')].map((item) => {
      const rect = item.getBoundingClientRect();
      return { label: item.innerText.trim(), disabled: item.disabled, title: item.getAttribute('title'), x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    })
  }))()`);
  console.log('MENU', JSON.stringify(menu));
  const union = menu.items.find((item) => item.label === '并集');
  if (!union || union.disabled) throw new Error('紧凑菜单并集不可用');
  await click(union.x, union.y);
  await sleep(650);

  const after = await evaluate(`(() => ({
    rows: [...document.querySelectorAll('.layer-row')].map((row) => row.innerText.trim()).slice(0, 12),
    status: document.querySelector('.statusbar')?.innerText.slice(0, 160),
    toast: document.querySelector('.toast strong')?.innerText ?? '',
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 260) ?? ''
  }))()`);
  console.log('AFTER', JSON.stringify(after));
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

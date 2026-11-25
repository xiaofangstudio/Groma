const port = process.env.CDP_PORT || '9238';
const labels = (process.env.VECTOR_SELECT || '黄色卡片,墨色横条').split(',').map((label) => label.trim()).filter(Boolean);
const targetLabel = process.env.VECTOR_LABEL || '分割';
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
  await evaluate(`(() => {
    const frame = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('桌面 1440'));
    frame?.querySelector('.layer-caret')?.click();
  })()`);
  await sleep(260);

  const selected = await evaluate(`(() => {
    const labels = ${JSON.stringify(labels)};
    const items = labels.map((label) => [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes(label)));
    if (items.some((item) => !item)) return { ok: false, labels: [...document.querySelectorAll('.layer-row')].map((row) => row.innerText.trim()) };
    items[0].click();
    for (const item of items.slice(1)) item.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    return { ok: true, count: items.length };
  })()`);
  console.log('SELECT', JSON.stringify(selected));
  if (!selected.ok) throw new Error('没有找到目标图层');
  await sleep(320);
  console.log('STATUS', JSON.stringify(await evaluate(`document.querySelector('.statusbar')?.innerText.slice(0, 160)`)));
  console.log('METRICS', JSON.stringify(await evaluate(`(() => {
    const info = (node) => { if (!node) return null; const r = node.getBoundingClientRect(); const s = getComputedStyle(node); return { text: node.innerText.trim(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), display: s.display }; };
    const byLabel = (name) => info(document.querySelector('[aria-label="' + name + '"]'));
    return {
      viewport: [innerWidth, innerHeight],
      tools: info(document.querySelector('.topbar-tools')),
      wide: info(document.querySelector('.bool-wide')),
      union: byLabel('并集'), subtract: byLabel('差集'), intersect: byLabel('交集'), exclude: byLabel('排除'),
      more: byLabel('更多矢量操作'), compact: byLabel('矢量运算'),
      compactWrap: info(document.querySelector('.bool-compact-wrap')),
      reason: info(document.querySelector('.bool-reason'))
    };
  })()`)));

  const compact = await evaluate(`(() => {
    const compact = document.querySelector('[aria-label="矢量运算"]');
    const more = document.querySelector('[aria-label="更多矢量操作"]');
    const node = compact && compact.offsetParent ? compact : more;
    if (!node || !node.offsetParent) return null;
    const rect = node.getBoundingClientRect();
    return { label: node.getAttribute('aria-label'), x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  if (!compact) throw new Error('矢量菜单按钮未显示');
  await click(compact.x, compact.y);
  await sleep(220);

  const menu = await evaluate(`(() => {
    const menuNode = [...document.querySelectorAll('.bool-menu')].find((node) => node.offsetParent);
    return {
      open: Boolean(menuNode),
      items: menuNode ? [...menuNode.querySelectorAll('.bool-menu-item')].map((item) => {
        const rect = item.getBoundingClientRect();
        return { label: item.innerText.trim(), disabled: item.disabled, title: item.getAttribute('title'), x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
      }) : []
    };
  })()`);
  console.log('MENU', JSON.stringify(menu));
  if (process.env.VECTOR_EXEC === '0') {
    ws.close();
    return;
  }
  const target = menu.items.find((item) => item.label === targetLabel);
  if (!target) throw new Error('菜单没有 ' + targetLabel);
  if (target.disabled) throw new Error(targetLabel + ' 被禁用：' + target.title);
  await click(target.x, target.y);
  await sleep(650);

  const after = await evaluate(`(() => ({
    rows: [...document.querySelectorAll('.layer-row')].map((row) => row.innerText.trim()).slice(0, 16),
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

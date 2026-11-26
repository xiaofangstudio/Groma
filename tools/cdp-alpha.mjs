const port = process.env.CDP_PORT || '9238';
const wantType = process.env.MASK_TYPE || 'Alpha';
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
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  };

  await send('Runtime.enable');
  await sleep(600);
  await evaluate(`(() => {
    const frame = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('桌面 1440'));
    frame?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(300);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.innerText.includes('椭圆蒙版'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('图层树里没有椭圆蒙版');
  await sleep(600);
  const typeClicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.mask-type-switch .fill-type-btn')].find((b) => b.innerText.trim() === ${JSON.stringify(wantType)});
    if (!button) return false;
    if (!button.classList.contains('is-on')) button.click();
    return true;
  })()`);
  if (!typeClicked) throw new Error('没有蒙版类型按钮：' + wantType);
  await sleep(600);
  const state = () => evaluate(`(() => ({
    row: [...document.querySelectorAll('.layer-row')].find((item) => item.innerText.includes('椭圆蒙版'))?.innerText.trim() ?? '',
    types: [...document.querySelectorAll('.mask-type-switch .fill-type-btn')].map((b) => ({ text: b.innerText.trim(), on: b.classList.contains('is-on') })),
    hint: document.querySelector('.mask-hint')?.innerText.trim() ?? '',
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 260) ?? ''
  }))()`);
  console.log('ALPHA', JSON.stringify(await state()));
  await evaluate(`document.querySelector('[aria-label="适应画板"]')?.click()`);
  await sleep(500);
  if (process.env.COMPACT_ZOOM === '1') {
    await evaluate(`document.querySelector('.zoom-value')?.click()`);
    await sleep(250);
    for (let i = 0; i < 7; i += 1) {
      await evaluate(`document.querySelector('[aria-label="缩小"]')?.click()`);
      await sleep(120);
    }
    await sleep(500);
    await evaluate(`(() => { const sc = document.querySelector('.right-panel .inspector-scroll'); if (sc) sc.scrollTop = sc.scrollHeight; return sc?.scrollTop ?? 0; })()`);
    await sleep(300);
  }
  console.log('AFTER_FIT', JSON.stringify(await state()));
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

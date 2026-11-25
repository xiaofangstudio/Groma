const port = process.env.CDP_PORT || '9238';
const layerName = process.env.MASK_LAYER || '椭圆蒙版';
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

  await send('Runtime.enable');
  await sleep(500);
  await evaluate(`(() => {
    if ([...document.querySelectorAll('.layer-row')].some((row) => row.innerText.includes(${JSON.stringify(layerName)}))) return true;
    const frame = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('桌面 1440'));
    frame?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(300);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.innerText.includes(${JSON.stringify(layerName)}));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('图层树里没有' + layerName);
  await sleep(400);

  const state = () => evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.innerText.includes(${JSON.stringify(layerName)}));
    const button = [...document.querySelectorAll('.right-panel .wide-action')].find((item) => item.innerText.trim() === '用作蒙版' || item.innerText.trim() === '取消蒙版');
    return {
      row: row?.innerText.trim() ?? '',
      chip: Boolean(row?.querySelector('.mask-chip')),
      button: button?.innerText.trim() ?? '',
      disabled: Boolean(button?.disabled),
      hint: document.querySelector('.right-panel .mask-hint')?.innerText.trim() ?? '',
      selected: [...document.querySelectorAll('.layer-row.is-selected')].map((item) => item.innerText.trim()),
      inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 320) ?? ''
    };
  })()`);

  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.right-panel .wide-action')].find((item) => item.innerText.trim() === '取消蒙版');
    button?.click();
    return Boolean(button);
  })()`);
  await sleep(400);
  console.log('BEFORE', JSON.stringify(await state()));
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.right-panel .wide-action')].find((item) => item.innerText.trim() === '用作蒙版');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await sleep(500);
  console.log('MASKED', JSON.stringify(await state()));

  await evaluate(`document.querySelector('[aria-label="撤销"]')?.click()`);
  await sleep(450);
  console.log('UNDO', JSON.stringify(await state()));

  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.right-panel .wide-action')].find((item) => item.innerText.trim() === '用作蒙版');
    button?.click();
    return Boolean(button);
  })()`);
  await sleep(500);
  console.log('FINAL', JSON.stringify(await state()));
  await evaluate(`document.querySelector('[aria-label="适应画板"]')?.click()`);
  await sleep(450);
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

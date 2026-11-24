const port = process.env.CDP_PORT || '9222';
const format = process.env.PEN_EXPORT || 'PNG';
const layerName = process.env.PEN_LAYER || '钢笔 1';
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
  await sleep(350);
  await evaluate(`(() => {
    if ([...document.querySelectorAll('.layer-row')].some((item) => item.textContent.includes(${JSON.stringify(layerName)}))) return true;
    const frameRow = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('桌面 1440'));
    frameRow?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(320);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes(${JSON.stringify(layerName)}));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('图层树里没有' + layerName);
  await sleep(350);

  const opened = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.export-btn')].find((item) => item.textContent.includes('导出'));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!opened) throw new Error('没有导出按钮');
  await sleep(550);
  await evaluate(`(() => {
    const formatButton = [...document.querySelectorAll('.export-card .export-seg-btn')].find((item) => item.textContent.trim() === '${format}');
    if (formatButton) formatButton.click();
    if ('${format}' !== 'SVG') {
      const scaleButton = [...document.querySelectorAll('.export-card [aria-label="导出倍数"] .export-seg-btn')].find((item) => item.textContent.trim() === '1×');
      if (scaleButton) scaleButton.click();
    }
    return true;
  })()`);
  await sleep(350);
  const dialog = await evaluate(`(() => ({
    subtitle: document.querySelector('.export-card .dialog-sub')?.innerText,
    summary: document.querySelector('.export-card .export-summary')?.innerText,
    body: document.querySelector('.export-card .export-body')?.innerText.slice(0, 320)
  }))()`);
  console.log('DIALOG', JSON.stringify(dialog));
  if (process.env.PEN_DIALOG_ONLY === '1') {
    ws.close();
    return;
  }
  await evaluate(`document.querySelector('.export-card .export-actions .btn-primary')?.click()`);
  await sleep(1500);
  const toast = await evaluate(`(() => ({
    title: document.querySelector('.toast strong')?.innerText,
    path: document.querySelector('.toast-path')?.getAttribute('title') ?? document.querySelector('.toast-path')?.innerText,
    dialogOpen: Boolean(document.querySelector('.export-card'))
  }))()`);
  console.log('EXPORTED', JSON.stringify(toast));
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });


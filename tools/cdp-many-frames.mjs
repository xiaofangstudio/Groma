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
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  };

  await send('Runtime.enable');
  await sleep(900);
  const before = await evaluate(`(() => ({
    zoom: document.querySelector('.zoom-value')?.innerText.trim() ?? '',
    frames: document.querySelectorAll('.layer-row').length,
    status: document.querySelector('.status-bar')?.innerText.trim() ?? document.querySelector('.canvas-status')?.innerText.trim() ?? '',
    empty: document.body.innerText.includes('打开工程失败')
  }))()`);
  console.log('BEFORE', JSON.stringify(before));
  await evaluate(`document.querySelector('[aria-label="适应画板"]')?.click()`);
  await sleep(700);
  await evaluate(`document.querySelector('.zoom-value')?.click()`);
  await sleep(900);
  const after = await evaluate(`(() => ({
    zoom: document.querySelector('.zoom-value')?.innerText.trim() ?? '',
    rowCount: document.querySelectorAll('.layer-row').length,
    visibleRows: [...document.querySelectorAll('.layer-row')].filter((r) => r.offsetParent !== null).length,
    canvas: (() => { const c = document.querySelector('canvas'); return c ? { width: c.width, height: c.height } : null; })(),
    status: [...document.querySelectorAll('.status-bar, .canvas-status')].map((n) => n.innerText.trim()).slice(0, 2)
  }))()`);
  console.log('AFTER100', JSON.stringify(after));
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });

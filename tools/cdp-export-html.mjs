const port = process.env.CDP_PORT || '9241';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到 WebView2 页面');
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
  await sleep(2600);

  const selected = await evaluate(`(() => document.querySelector('.inspector-sel')?.textContent ?? '')()`);
  console.log('SELECTED', JSON.stringify(selected));

  const opened = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.export-btn')].find((b) => b.title.includes('导出'));
    if (!btn) return { ok: false };
    const r = btn.getBoundingClientRect();
    return { ok: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), title: btn.title };
  })()`);
  if (!opened.ok) throw new Error('没有导出按钮');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: opened.x, y: opened.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: opened.x, y: opened.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: opened.x, y: opened.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(600);
  const mounted = await evaluate(`(() => ({ hasBody: Boolean(document.querySelector('.export-body')), text: document.body.innerText.slice(-500) }))()`);
  console.log('MOUNT', JSON.stringify(mounted));

  const picked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.export-body .export-seg-btn')].find((b) => b.textContent.trim() === 'HTML');
    if (!btn) return { ok: false, texts: [...document.querySelectorAll('.export-body .export-seg-btn')].map((b) => b.textContent) };
    const r = btn.getBoundingClientRect();
    return { ok: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (!picked.ok) {
    console.log('PICK', JSON.stringify(picked));
    ws.close();
    return;
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: picked.x, y: picked.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: picked.x, y: picked.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: picked.x, y: picked.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(500);

  const info = await evaluate(`(() => ({
    active: [...document.querySelectorAll('.export-seg-btn.is-on')].map((b) => b.textContent.trim()),
    summary: document.querySelector('.export-summary')?.textContent ?? '',
    note: document.querySelector('.export-note')?.textContent ?? '',
    canExport: !document.querySelector('.modal-actions .btn-primary')?.disabled,
  }))()`);
  console.log('INFO', JSON.stringify(info));

  await evaluate(`(() => {
    const btn = document.querySelector('.modal-actions .btn-primary');
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    window.__gromaExportPoint = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    return true;
  })()`);
  const point = await evaluate(`window.__gromaExportPoint`);
  if (!point) throw new Error('没有导出按钮');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(2200);

  const result = await evaluate(`(() => ({
    toast: document.querySelector('.toast')?.textContent ?? '',
    path: document.querySelector('.toast-path')?.textContent ?? '',
    error: document.querySelector('.export-error')?.textContent ?? '',
    busy: document.querySelector('.modal-actions .btn-primary')?.textContent ?? '',
  }))()`);
  console.log('RESULT', JSON.stringify(result));
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });

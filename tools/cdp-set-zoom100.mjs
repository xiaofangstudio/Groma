const port = process.env.CDP_PORT || '9239';
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
  await send('Runtime.enable');
  await sleep(350);
  await send('Runtime.evaluate', {
    expression: `(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', code: 'Digit0', shiftKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: '0', code: 'Digit0', shiftKey: true, bubbles: true }));
      return true;
    })()`,
    returnByValue: true,
  });
  await sleep(900);
  const res = await send('Runtime.evaluate', { expression: `document.querySelector('.zoom-value')?.textContent ?? ''`, returnByValue: true });
  console.log('ZOOM', res.result?.value ?? '');
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });

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
  await send('Runtime.enable');
  await sleep(300);
  const data = await evaluate(`(() => {
    const rect = (el) => el ? { left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right), top: Math.round(el.getBoundingClientRect().top), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
    const topbar = document.querySelector('.topbar');
    return {
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      topbar: rect(topbar),
      left: rect(document.querySelector('.topbar-left')),
      name: rect(document.querySelector('.doc-name')),
      tools: rect(document.querySelector('.topbar-tools')),
      right: rect(document.querySelector('.topbar-right')),
      nameValue: document.querySelector('.doc-name')?.value,
      toolCount: document.querySelectorAll('.topbar-tools .tool-btn').length
    };
  })()`);
  console.log('TOPBAR', JSON.stringify(data));
  ws.close();
}

main().catch((error) => { console.error('CDP ERROR', error.message); process.exit(1); });

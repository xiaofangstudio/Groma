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
  await sleep(2800);
  const opened = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.export-btn')].find((b) => b.title.includes('导出'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  if (!opened) throw new Error('没有导出按钮');
  await sleep(500);
  const picked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.export-body .export-seg-btn')].find((b) => b.textContent.trim() === 'HTML');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(500);
  console.log(JSON.stringify(await evaluate(`(() => ({
    picked: ${'true'},
    active: [...document.querySelectorAll('.export-seg-btn.is-on')].map((b) => b.textContent.trim()),
    summary: document.querySelector('.export-summary')?.textContent ?? '',
    note: document.querySelector('.export-note')?.textContent ?? '',
    sizeRow: Boolean(document.querySelector('.export-scale-row')),
  }))()`)));
  console.log('PICKED', picked);
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });

const port = process.env.CDP_PORT || '9238';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
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
  await sleep(450);
  await evaluate(`(() => {
    const frame = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('桌面 1440'));
    frame?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(300);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('黄色卡片'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(500);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2', shiftKey: true, bubbles: true }))`);
  await sleep(800);
  console.log('FIT_STATE', await evaluate(`(() => ({
    selected: document.querySelector('.inspector-name-input')?.value ?? '',
    zoom: [...document.querySelectorAll('.zoom-btn')].map((b) => b.textContent).find((text) => /%/.test(text)) ?? '',
  }))()`));
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });

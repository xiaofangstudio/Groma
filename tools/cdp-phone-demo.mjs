import fs from 'node:fs';
const port = process.env.CDP_PORT || '9241';
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
  await sleep(800);
  await evaluate(`(() => {
    const demo = [...document.querySelectorAll('.topbar-right button')].find((item) => item.textContent.includes('演示'));
    demo?.click();
    return Boolean(demo);
  })()`);
  await sleep(1200);
  const state = await evaluate(`(() => {
    const frame = document.querySelector('.proto-frame');
    const card = document.querySelector('.proto-card');
    if (!frame) return null;
    return {
      isDevice: frame.classList.contains('is-device'),
      frameRadius: getComputedStyle(frame).borderRadius,
      cardBg: getComputedStyle(card).backgroundColor,
      hint: document.querySelector('.proto-hint')?.textContent ?? '',
    };
  })()`);
  console.log('PHONE_DEMO', JSON.stringify(state));
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync('shots/proto-phone.png', Buffer.from(shot.data, 'base64'));
  ws.close();
}
main().catch((error) => { console.error('FAILED', error); process.exit(1); });

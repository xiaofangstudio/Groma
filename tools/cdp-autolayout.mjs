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
  await sleep(3000);
  await evaluate(`(() => {
    const artboard = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('自动布局验收画板'));
    artboard?.querySelector('.layer-caret')?.click();
    return Boolean(artboard);
  })()`);
  await sleep(500);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((el) => el.textContent.includes('按钮组'));
    row?.click();
    return Boolean(row);
  })()`);
  await sleep(700);
  const info = await evaluate(`(() => {
    const canvas = document.querySelector('canvas.canvas');
    const r = canvas?.getBoundingClientRect();
    const key = Object.keys(localStorage).find((k) => k.includes('AutoLayout'));
    const raw = key ? localStorage.getItem(key) : null;
    return { canvas: r ? { x: r.x, y: r.y } : null, raw };
  })()`);
  if (!info.canvas || !info.raw) throw new Error('没有 canvas 或 viewport');
  await sleep(900);
  const state = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '自动布局');
    if (!sec) return { ok: false, text: document.querySelector('.inspector-name')?.textContent ?? '' };
    sec.scrollIntoView({ block: 'center' });
    const overflow = [...document.querySelectorAll('.right-panel *')]
      .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
      .slice(0, 12)
      .map((el) => ({
        tag: el.tagName,
        cls: String(el.className).slice(0, 60),
        text: (el.textContent || '').trim().slice(0, 30),
        cw: el.clientWidth,
        sw: el.scrollWidth,
      }));
    return {
      ok: true,
      name: document.querySelector('.inspector-name')?.value ?? document.querySelector('.inspector-name')?.textContent ?? '',
      text: sec.innerText.replace(/\\n/g, ' | '),
      mode: [...sec.querySelectorAll('.auto-layout-mode-btn')].find((b) => b.classList.contains('is-on'))?.textContent ?? '',
      children: document.querySelectorAll('.layer-row').length,
      overflow,
    };
  })()`);
  console.log('AUTO_LAYOUT', JSON.stringify(state));
  await sleep(500);
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });

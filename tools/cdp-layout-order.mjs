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
  const info = await evaluate(`(() => {
    const canvas = document.querySelector('canvas.canvas');
    const r = canvas?.getBoundingClientRect();
    const key = Object.keys(localStorage).find((k) => k.includes('AutoLayout'));
    const raw = key ? localStorage.getItem(key) : null;
    return { canvas: r ? { x: r.x, y: r.y } : null, raw };
  })()`);
  if (!info.canvas || !info.raw) throw new Error('没有 canvas 或 viewport');
  const parsed = JSON.parse(info.raw);
  const pageId = parsed.pageId || Object.keys(parsed.viewports)[0];
  const v = parsed.viewports[pageId];
  // 第一颗按钮：画板 120 + 内边距 20 + 半宽 75；上 180 + 28 + 半高 32。
  const sx = Math.round(info.canvas.x + v.x + 215 * v.scale);
  const sy = Math.round(info.canvas.y + v.y + 240 * v.scale);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type, x: sx, y: sy,
      ...(type === 'mouseMoved' ? {} : { button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }),
    });
  }
  await sleep(900);
  const before = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '布局顺序');
    if (!sec) return { ok: false, name: document.querySelector('.inspector-name')?.textContent ?? '' };
    sec.scrollIntoView({ block: 'center' });
    return { ok: true, name: document.querySelector('.inspector-name')?.value ?? '', text: sec.innerText.replace(/\\n/g, ' | ') };
  })()`);
  const clicked = await evaluate(`(() => {
    const icon = document.querySelector('.layout-order-down');
    const btn = icon?.closest('button');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(700);
  const after = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.ins-section')].find((s) => s.querySelector('.ins-title')?.textContent === '布局顺序');
    return sec ? sec.innerText.replace(/\\n/g, ' | ') : '';
  })()`);
  const overflow = await evaluate(`(() => [...document.querySelectorAll('.right-panel *')]
    .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
    .slice(0, 12)
    .map((el) => ({
      tag: el.tagName,
      cls: String(el.className).slice(0, 60),
      text: (el.textContent || '').trim().slice(0, 30),
      cw: el.clientWidth,
      sw: el.scrollWidth,
    })))()`);
  console.log('LAYOUT_ORDER', JSON.stringify({ before, clicked, after, overflow }));
  await sleep(500);
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });

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
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  };

  await send('Runtime.enable');
  await sleep(4500);
  await evaluate(`(() => {
    window.__engineDurs = [];
    window.__engineCreates = 0;
    const origRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => origRaf((ts) => {
      const t0 = performance.now();
      cb(ts);
      window.__engineDurs.push(performance.now() - t0);
    });
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag, ...args) => {
      const el = origCreate(tag, ...args);
      if (String(tag).toLowerCase() === 'canvas') window.__engineCreates += 1;
      return el;
    };
    return true;
  })()`);
  await sleep(800);

  const info = await evaluate(`(() => {
    const canvas = document.querySelector('canvas.canvas');
    const r = canvas?.getBoundingClientRect();
    return {
      zoom: document.querySelector('.zoom-value')?.textContent ?? '',
      canvas: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    };
  })()`);
  if (!info.canvas) throw new Error('canvas 不存在');
  console.log('START', JSON.stringify(info));

  const cx = Math.round(info.canvas.x + info.canvas.w / 2);
  const cy = Math.round(info.canvas.y + info.canvas.h / 2);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });
  const reset = () => evaluate('window.__engineDurs = []; window.__engineCreates = 0; true');
  const read = async (label) => {
    const result = await evaluate(`(() => {
      const durs = window.__engineDurs || [];
      const sorted = [...durs].sort((a, b) => a - b);
      const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
      return {
        label: ${JSON.stringify(label)},
        zoom: document.querySelector('.zoom-value')?.textContent ?? '',
        rafCount: durs.length,
        rafP50: +pick(0.5).toFixed(2),
        rafP95: +pick(0.95).toFixed(2),
        rafMax: +(sorted.at(-1) ?? 0).toFixed(2),
        long16: durs.filter((v) => v > 16).length,
        canvases: window.__engineCreates,
        selected: document.querySelectorAll('.layer-row.selected').length,
      };
    })()`);
    console.log('PERF', JSON.stringify(result));
  };

  await reset();
  await sleep(900);
  await read('fit-idle');

  // 7% 总览拉到约 35%：一次滚轮，缩放预览结束后进入中倍画板小图补齐。
  await reset();
  await send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: cx,
    y: cy,
    deltaX: 0,
    deltaY: -1050,
    modifiers: 0,
  });
  await sleep(2600);
  await read('zoom-warm');

  // 选中一次：只应重绘选中覆盖层，不应重画 600 块画板。
  await reset();
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(600);
  await read('select-once');
  ws.close();
}
main().catch((error) => { console.error(error); process.exit(1); });

import fs from 'node:fs';

const port = process.env.CDP_PORT || '9241';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.text || 'exception');
    if (!msg.id) return;
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    msg.error ? slot.rej(new Error(msg.error.message)) : slot.res(msg.result);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  };
  const key = async (keyName, code, vk, mods = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods });
    await sleep(80);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods });
    await sleep(180);
  };
  const mouse = (type, x, y, opts = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: opts.button ?? 'none', buttons: opts.buttons ?? 0, clickCount: opts.clickCount ?? 0, modifiers: opts.modifiers ?? 0 });
  const click = async (x, y) => {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 });
    await sleep(60);
    await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 });
    await sleep(220);
  };
  const drag = async (x1, y1, x2, y2, mods = 0) => {
    await mouse('mouseMoved', x1, y1, { modifiers: mods });
    await mouse('mousePressed', x1, y1, { button: 'left', buttons: 1, clickCount: 1, modifiers: mods });
    for (let i = 1; i <= 16; i++) {
      await mouse('mouseMoved', x1 + (x2 - x1) * i / 16, y1 + (y2 - y1) * i / 16, { buttons: 1, modifiers: mods });
      await sleep(25);
    }
    await mouse('mouseReleased', x2, y2, { button: 'left', clickCount: 1, modifiers: mods });
    await sleep(350);
  };
  const layers = () => evaluate(`(() => ({
    count: document.querySelectorAll('.layer-row').length,
    names: [...document.querySelectorAll('.layer-row')].map((e) => e.textContent.trim().replace(/\\s+/g, ' ')),
    fields: [...document.querySelectorAll('.right-panel input[type="number"]')].slice(0, 4).map((e) => e.value),
    panel: document.querySelector('.right-panel')?.innerText.slice(0, 300) ?? '',
  }))()`);

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(2400);
  const canvas = await evaluate(`(() => { const r = document.querySelector('.canvas-host').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const at = (fx, fy) => ({ x: canvas.x + canvas.w * fx, y: canvas.y + canvas.h * fy });

  await key('r', 'KeyR', 82);
  const a = at(0.34, 0.28);
  const b = at(0.56, 0.46);
  await drag(a.x, a.y, b.x, b.y);
  console.log('RECT', JSON.stringify(await layers()));

  await key('v', 'KeyV', 86);
  const center = at(0.45, 0.37);
  const to = { x: center.x + 88, y: center.y + 52 };
  const before = await layers();
  await drag(center.x, center.y, to.x, to.y, 1);
  const after = await layers();
  console.log('ALT_DRAG', JSON.stringify({ before: before.count, after: after.count, fields: after.fields, names: after.names }));

  const shifted = { x: to.x + 120, y: to.y + 44 };
  await drag(to.x, to.y, shifted.x, shifted.y, 8);
  console.log('SHIFT_DRAG', JSON.stringify(await layers()));

  console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const out = 'D:\\20533\\deskbox\\fangwork\\Groma\\shots\\ux-alt-drag.png';
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SHOT', out, fs.statSync(out).size);
  ws.close();
}

main().catch((e) => { console.error('FAIL', e.stack || e); process.exit(1); });

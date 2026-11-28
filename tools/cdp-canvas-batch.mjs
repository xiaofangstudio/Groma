const port = process.env.CDP_PORT || '9241';
import fs from 'node:fs';
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
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  };

  await send('Runtime.enable');
  await sleep(500);
  const box = await evaluate(`(() => {
    const canvas = document.querySelector('.canvas-host canvas.canvas');
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);

  async function mouse(type, x, y, button = 'left', buttons = 1, modifiers = 0) {
    await send('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button, buttons, modifiers, clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
  }
  async function drag(x1, y1, x2, y2, shift = false, steps = 12) {
    const modifiers = shift ? 8 : 0;
    await mouse('mouseMoved', x1, y1, 'none', 0, modifiers);
    await mouse('mousePressed', x1, y1, 'left', 1, modifiers);
    for (let i = 1; i <= steps; i += 1) {
      await mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, 'left', 1, modifiers);
      await sleep(25);
    }
    await mouse('mouseReleased', x2, y2, 'left', 0, modifiers);
    await sleep(500);
  }
  async function click(label) {
    await evaluate(`document.querySelector('[aria-label="${label}"]')?.click()`);
    await sleep(250);
  }
  async function shape(tool) {
    await evaluate(`document.querySelector('[aria-label="形状菜单"]')?.click()`);
    await sleep(180);
    await evaluate(`document.querySelector('[role="menuitem"][data-tool="${tool}"]')?.click()`);
    await sleep(300);
  }
  async function readFields() {
    return evaluate(`(() => [...document.querySelectorAll('.right-panel label.field')].map((label) => ({ label: label.querySelector('.field-label')?.textContent ?? '', value: label.querySelector('input')?.value ?? '' })))()`);
  }
  async function selectedCount() {
    return evaluate(`document.querySelectorAll('.layer-row.is-selected').length`);
  }
  async function selectedNames() {
    return evaluate(`(() => [...document.querySelectorAll('.layer-row.is-selected')].map((row) => row.innerText.replace(/\\s+/g, ' ').trim()))()`);
  }
  async function shoot(path) {
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path, Buffer.from(shot.data, 'base64'));
    console.log('SHOT', path, fs.statSync(path).size);
  }
  async function selectLayer(name) {
    const click = (label) => evaluate(`(() => {
      const row = [...document.querySelectorAll('.layer-row')].find((item) => item.innerText.includes('${label}'));
      if (!row) return false;
      row.click();
      return true;
    })()`);
    if (await click(name)) { await sleep(450); return true; }
    await evaluate(`(() => {
      const frame = [...document.querySelectorAll('.layer-row')].find((item) => item.innerText.includes('天气图标'));
      frame?.querySelector('.layer-caret')?.click();
      return Boolean(frame);
    })()`);
    await sleep(450);
    const ok = await click(name);
    await sleep(450);
    return ok;
  }

  // 1. Shift 正圆：拖一个明显非正方形的手势，最终 W/H 必须相等。
  await shape('ellipse');
  await drag(box.left + 60, box.top + 110, box.left + 160, box.top + 200, true);
  const circleFields = await readFields();
  const circle = Object.fromEntries(circleFields.map((f) => [f.label, f.value]));
  console.log('SHIFT_ELLIPSE', JSON.stringify({ W: circle.W, H: circle.H, rotation: circle.rotation }));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
  await sleep(400);

  // 2. 在画板内画两个矩形，用移动工具在画板空白处框选，检查多选与矢量入口。
  await shape('rect');
  await drag(box.left + 150, box.top + 690, box.left + 220, box.top + 745);
  await shape('rect');
  await drag(box.left + 245, box.top + 690, box.left + 315, box.top + 745);
  await click('移动工具');
  await drag(box.left + 135, box.top + 675, box.left + 335, box.top + 760);
  const marqueeCount = await selectedCount();
  const marqueeNames = await selectedNames();
  const vectorButton = await evaluate(`Boolean(document.querySelector('[aria-label="布尔与矢量运算"]'))`);
  const toolGroups = await evaluate(`(() => [...document.querySelectorAll('.tool-split')].map((el) => ({ label: el.querySelector('.tool-split-main')?.getAttribute('aria-label'), caret: el.querySelector('.tool-split-caret')?.getAttribute('aria-label') })))()`);
  if (vectorButton) {
    await evaluate(`document.querySelector('[aria-label="布尔与矢量运算"]')?.click()`);
    await sleep(300);
  }
  const vectorMenu = await evaluate(`(() => {
    const menu = document.querySelector('.bool-menu-wrap .bool-menu, [aria-label="布尔与矢量运算"] + .bool-menu');
    return menu ? [...menu.querySelectorAll('button.bool-menu-item')].map((button) => ({ text: button.innerText.trim(), disabled: button.disabled, title: button.title })) : [];
  })()`);
  const vectorReason = await evaluate(`document.querySelector('.bool-menu-reason')?.textContent ?? ''`);
  console.log('MARQUEE', JSON.stringify({ selected: marqueeCount, names: marqueeNames, vectorButton, toolGroups, vectorReason, vectorMenu }));
  await shoot('shots/canvas-multiselect.png');
  await evaluate(`document.querySelector('[aria-label="关闭矢量菜单"]')?.click()`);
  await sleep(200);
  for (let i = 0; i < 2; i += 1) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
    await sleep(300);
  }

  // 3. 选中太阳，检查径向渐变手柄；拖圆心，确认 cx 改变。
  await selectLayer('太阳');
  const gradientBefore = await evaluate(`(() => {
    const svg = document.querySelector('.gradient-overlay');
    const dot = svg?.querySelector('.gradient-center-handle');
    if (!svg || !dot) return null;
    const r = svg.getBoundingClientRect();
    return { cx: Number(dot.getAttribute('cx')), cy: Number(dot.getAttribute('cy')), left: r.left, top: r.top };
  })()`);
  if (gradientBefore) {
    await shoot('shots/canvas-gradient.png');
    await drag(gradientBefore.left + gradientBefore.cx, gradientBefore.top + gradientBefore.cy, gradientBefore.left + gradientBefore.cx + 36, gradientBefore.top + gradientBefore.cy + 8);
  }
  const gradientAfter = await evaluate(`(() => {
    const dot = document.querySelector('.gradient-center-handle');
    return dot ? { cx: Number(dot.getAttribute('cx')), cy: Number(dot.getAttribute('cy')) } : null;
  })()`);
  console.log('GRADIENT', JSON.stringify({ before: gradientBefore, after: gradientAfter }));

  // 4. 选中太阳后拖旋转手柄到右侧，Shift 15° 步进；读旋转字段。
  const rotateBefore = await evaluate(`(() => {
    const svg = document.querySelector('.rotate-overlay');
    const dot = svg?.querySelector('.rotate-handle');
    const line = svg?.querySelector('.rotate-tether');
    if (!svg || !dot || !line) return null;
    const r = svg.getBoundingClientRect();
    return {
      hx: Number(dot.getAttribute('cx')), hy: Number(dot.getAttribute('cy')),
      tx: Number(line.getAttribute('x1')), ty: Number(line.getAttribute('y1')),
      left: r.left, top: r.top,
    };
  })()`);
  if (rotateBefore) {
    const h = 116;
    const scale = 1.1;
    const centerY = rotateBefore.top + rotateBefore.ty + (h * scale) / 2;
    const radius = Math.abs(centerY - (rotateBefore.top + rotateBefore.hy));
    await drag(
      rotateBefore.left + rotateBefore.hx,
      rotateBefore.top + rotateBefore.hy,
      rotateBefore.left + rotateBefore.tx + radius,
      centerY,
      true,
    );
  }
  const rotateAfter = (await readFields()).find((f) => f.label === '旋转')?.value;
  console.log('ROTATE', JSON.stringify({ before: rotateBefore, rotation: rotateAfter }));
  // 撤销旋转和渐变拖动，保持太阳为原样。
  for (let i = 0; i < 2; i += 1) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
    await sleep(300);
  }

  // 5. 选中天空，检查「对齐与变换」里的圆角快速入口；再在玻璃卡上检查内阴影/背景模糊。
  await selectLayer('天空渐变');
  await sleep(450);
  const quickFields = await readFields();
  const corner = quickFields.find((f) => f.label === '圆角')?.value;
  await selectLayer('玻璃卡');
  await sleep(450);
  await evaluate(`(() => {
    const add = [...document.querySelectorAll('.effect-add-row .mini-action')].find((item) => item.textContent.includes('背景模糊'));
    add?.click();
    return Boolean(add);
  })()`);
  await sleep(350);
  await evaluate(`(() => {
    const add = [...document.querySelectorAll('.effect-add-row .mini-action')].find((item) => item.textContent.includes('内阴影'));
    add?.click();
    return Boolean(add);
  })()`);
  await sleep(450);
  const effectCards = await evaluate(`(() => [...document.querySelectorAll('.effect-card .effect-type')].map((item) => item.textContent.trim()))()`);
  console.log('QUICK_EFFECTS', JSON.stringify({ corner, effectCards }));
  await evaluate(`(() => {
    const section = [...document.querySelectorAll('.ins-section')].find((item) => item.querySelector('.ins-title')?.textContent.trim() === '效果');
    section?.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await sleep(350);
  await shoot('shots/canvas-effects.png');
  for (let i = 0; i < 2; i += 1) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
    await sleep(300);
  }

  // 6. 演示框主题：打开演示，检查 backdrop 不是黑色。
  await evaluate(`(() => {
    const demo = [...document.querySelectorAll('.topbar-right button')].find((item) => item.textContent.includes('演示'));
    demo?.click();
    return Boolean(demo);
  })()`);
  await sleep(900);
  const proto = await evaluate(`(() => {
    const card = document.querySelector('.proto-card');
    const backdrop = document.querySelector('.proto-backdrop');
    if (!card) return null;
    return {
      cardBg: getComputedStyle(card).backgroundColor,
      backdropBg: backdrop ? getComputedStyle(backdrop).backgroundColor : '',
      cardText: card.innerText.slice(0, 60),
    };
  })()`);
  console.log('PROTOTYPE', JSON.stringify(proto));
  await shoot('shots/proto-theme.png');
  ws.close();
}

main().catch((error) => { console.error('FAILED', error); process.exit(1); });

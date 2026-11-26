const port = process.env.CDP_PORT || '9238';
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
  await evaluate(`(() => {
    const frame = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('桌面 1440'));
    frame?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(300);
  const selected = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((item) => item.textContent.includes('高原湖泊'));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (!selected) throw new Error('图层树里没有高原湖泊');
  await sleep(500);
  const entered = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.wide-action')].find((item) => item.textContent.trim() === '裁剪图片');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!entered) throw new Error('没有裁剪图片按钮');
  await sleep(600);

  const state = () => evaluate(`(() => ({
    button: [...document.querySelectorAll('.wide-action')].find((item) => item.textContent.includes('裁剪'))?.textContent.trim() ?? '',
    note: document.querySelector('.ins-note')?.innerText.trim() ?? '',
    visible: [...document.querySelectorAll('.inspector-scroll .ins-row')].find((item) => item.innerText.includes('可见'))?.innerText.trim() ?? '',
    overlay: Boolean(document.querySelector('.crop-overlay')),
    handles: document.querySelectorAll('.crop-overlay rect[rx="1"]').length,
    tip: document.querySelector('.canvas-tip')?.innerText.trim() ?? ''
  }))()`);
  console.log('CROP', JSON.stringify(await state()));
  await evaluate(`document.querySelector('[aria-label="适应画板"]')?.click()`);
  await sleep(550);

  if (process.env.CROP_DRAG === '1') {
    const handle = await evaluate(`(() => {
      const rects = [...document.querySelectorAll('.crop-overlay rect[rx="1"]')];
      const target = rects[rects.length - 1];
      if (!target) return null;
      const box = target.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    if (!handle) throw new Error('没有找到裁剪手柄');
    console.log('CROP_HANDLE', JSON.stringify(handle));
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: handle.x, y: handle.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 8; i += 1) {
      await sleep(35);
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: handle.x - 110 * i / 8,
        y: handle.y - 70 * i / 8,
        button: 'left',
        buttons: 1,
      });
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: handle.x - 110, y: handle.y - 70, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(500);
  }

  console.log('CROP_AFTER', JSON.stringify(await state()));
  if (process.env.CROP_UNDO === '1') {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
    await sleep(450);
    console.log('CROP_UNDO', JSON.stringify(await state()));
  }
  if (process.env.CROP_ESCAPE === '1') {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(400);
    console.log('CROP_ESCAPE_STATE', JSON.stringify(await state()));
  }
  await sleep(1200);
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

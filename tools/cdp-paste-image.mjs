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
  const dispatched = await evaluate(`(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 480, 320);
    gradient.addColorStop(0, '#1D6FE8');
    gradient.addColorStop(0.55, '#7AD7C9');
    gradient.addColorStop(1, '#F2B45C');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 480, 320);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(60, 210, 360, 64);
    ctx.fillStyle = '#12323D';
    ctx.font = '600 30px sans-serif';
    ctx.fillText('PASTE', 170, 254);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'paste-test.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return { size: file.size, defaultPrevented: event.defaultPrevented };
  })()`);
  console.log('PASTE_DISPATCH', JSON.stringify(dispatched));
  await sleep(2600);
  const state = await evaluate(`(() => ({
    toastTitle: document.querySelector('.toast strong')?.innerText ?? '',
    toastDetail: document.querySelector('.toast-path')?.innerText ?? '',
    imageRows: [...document.querySelectorAll('.layer-row')].map((row) => row.innerText.trim()).filter((text) => text.includes('粘贴') || text.includes('图片')),
    save: document.querySelector('.status-save')?.textContent ?? '',
  }))()`);
  console.log('PASTE_STATE', JSON.stringify(state));

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 });
  await sleep(2500);
  console.log('PASTE_SAVED', await evaluate(`document.querySelector('.status-save')?.textContent ?? ''`));
  await sleep(800);
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

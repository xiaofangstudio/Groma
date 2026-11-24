import fs from 'node:fs';

const port = process.env.CDP_PORT || '9223';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|127\.0\.0\.1|localhost/.test(t.url)) ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到 Groma 页面');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id) return;
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(msg.error.message));
    else slot.resolve(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      const detail =
        res.exceptionDetails.exception?.description ??
        res.exceptionDetails.text ??
        JSON.stringify(res.exceptionDetails);
      throw new Error(detail);
    }
    return res.result?.value;
  };

  await send('Runtime.enable');
  await sleep(500);

  const picked = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    const target = rows.find((item) => item.innerText.trim() === '渐变行一');
    if (target) { target.click(); return target.innerText.trim(); }
    const frame = rows.find((item) => item.innerText.includes('PDF 实机验收'));
    frame?.querySelector('.layer-caret')?.click();
    return frame ? 'expanded' : 'no frame';
  })()`);
  if (picked === 'expanded') {
    await sleep(400);
    const clicked = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.layer-row')];
      const target = rows.find((item) => item.innerText.trim() === '渐变行一');
      if (!target) return 'no layer';
      target.click();
      return target.innerText.trim();
    })()`);
    if (clicked === 'no layer') throw new Error('展开后仍没有找到渐变文本图层');
  }
  await sleep(700);

  const before = await evaluate(`(() => {
    const panel = document.querySelector('.right-panel');
    const rows = panel?.querySelectorAll('.gradient-stop-row') ?? [];
    const field = (label) => [...(panel?.querySelectorAll('.field') ?? [])].find(
      (item) => item.querySelector('.field-label')?.innerText === label
    );
    return {
      selected: panel?.querySelector('.inspector-name-input')?.value ?? '',
      fillType: [...(panel?.querySelectorAll('.fill-type-btn') ?? [])].find((b) => b.classList.contains('is-on'))?.innerText ?? '',
      stops: rows.length,
      angle: field('角度')?.querySelector('input')?.value ?? '',
      font: field('字体')?.querySelector('input')?.value ?? '',
      hasStroke: Boolean(panel?.querySelector('.ins-section .field-select')),
    };
  })()`);

  await evaluate(`(() => {
    document.querySelector('.gradient-add')?.click();
    return document.querySelectorAll('.gradient-stop-row').length;
  })()`);
  await sleep(600);

  await evaluate(`(() => {
    const panel = document.querySelector('.right-panel');
    const field = [...panel.querySelectorAll('.field')].find(
      (item) => item.querySelector('.field-label')?.innerText === '角度'
    );
    const input = field?.querySelector('input');
    if (!input) return 'no angle';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '45');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    input.blur();
    return input.value;
  })()`);
  await sleep(500);

  await evaluate(`(() => {
    const panel = document.querySelector('.right-panel');
    const field = [...panel.querySelectorAll('.field')].find(
      (item) => item.querySelector('.field-label')?.innerText === '字体'
    );
    const input = field?.querySelector('input');
    if (!input) return 'no font';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Microsoft YaHei');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    input.blur();
    return input.value;
  })()`);
  await sleep(600);

  const after = await evaluate(`(() => {
    const panel = document.querySelector('.right-panel');
    const rows = panel?.querySelectorAll('.gradient-stop-row') ?? [];
    const field = (label) => [...(panel?.querySelectorAll('.field') ?? [])].find(
      (item) => item.querySelector('.field-label')?.innerText === label
    );
    return {
      selected: panel?.querySelector('.inspector-name-input')?.value ?? '',
      fillType: [...(panel?.querySelectorAll('.fill-type-btn') ?? [])].find((b) => b.classList.contains('is-on'))?.innerText ?? '',
      stops: rows.length,
      stopOffsets: [...rows].map((row) => row.querySelectorAll('.stop-num')[0]?.value ?? ''),
      stopAlphas: [...rows].map((row) => row.querySelectorAll('.stop-num')[1]?.value ?? ''),
      angle: field('角度')?.querySelector('input')?.value ?? '',
      font: field('字体')?.querySelector('input')?.value ?? '',
      panelText: panel?.innerText.slice(0, 220) ?? '',
    };
  })()`);

  console.log('PICKED', picked);
  console.log('BEFORE', JSON.stringify(before));
  console.log('AFTER', JSON.stringify(after));

  await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    return 'save';
  })()`);
  await sleep(1200);
  console.log('SAVED');
  const scrollTop = await evaluate(`(() => {
    const scroll = document.querySelector('.inspector-scroll');
    const title = [...(document.querySelectorAll('.right-panel .ins-title') ?? [])].find(
      (item) => item.textContent?.trim() === '文本'
    );
    if (!scroll || !title) return -1;
    const delta = title.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
    scroll.scrollTop = scroll.scrollTop + delta - 10;
    return scroll.scrollTop;
  })()`);
  console.log('SCROLL', scrollTop);
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const shotPath = process.env.FEATURE_SHOT_OUT;
  if (shotPath) {
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    console.log('SHOT', shotPath, fs.statSync(shotPath).size);
  }
  ws.close();
}

main().catch((error) => {
  console.error('CDP ERROR', error.message);
  process.exitCode = 1;
});

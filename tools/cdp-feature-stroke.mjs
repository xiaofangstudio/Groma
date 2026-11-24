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
    const target = rows.find((item) => item.innerText.trim() === '路径');
    if (target) { target.click(); return target.innerText.trim(); }
    const frame = rows.find((item) => item.innerText.includes('PDF 实机验收'));
    frame?.querySelector('.layer-caret')?.click();
    return frame ? 'expanded' : 'no frame';
  })()`);
  if (picked === 'expanded') {
    await sleep(400);
    const clicked = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.layer-row')];
      const target = rows.find((item) => item.innerText.trim() === '路径');
      if (!target) return 'no layer';
      target.click();
      return target.innerText.trim();
    })()`);
    if (clicked === 'no layer') throw new Error('展开后仍没有找到路径图层');
  }
  await sleep(700);

  const before = await evaluate(`(() => {
    const panel = document.querySelector('.right-panel');
    const selects = [...(panel?.querySelectorAll('.select-field') ?? [])].map((field) => ({
      label: field.querySelector('.field-label')?.innerText ?? '',
      value: field.querySelector('select')?.value ?? '',
    }));
    const field = [...(panel?.querySelectorAll('.field') ?? [])].find(
      (item) => item.querySelector('.field-label')?.innerText === '宽度'
    );
    return {
      selected: panel?.querySelector('.inspector-name-input')?.value ?? '',
      fillType: [...(panel?.querySelectorAll('.fill-type-btn') ?? [])].find((b) => b.classList.contains('is-on'))?.innerText ?? '',
      selects,
      width: field?.querySelector('input')?.value ?? '',
    };
  })()`);

  const changed = await evaluate(`(() => {
    const panel = document.querySelector('.right-panel');
    const setSelect = (label, value) => {
      const field = [...panel.querySelectorAll('.select-field')].find(
        (item) => item.querySelector('.field-label')?.innerText === label
      );
      const select = field?.querySelector('select');
      if (!select) return 'no ' + label;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    };
    return {
      dash: setSelect('线型', 'dashed'),
      cap: setSelect('端点', 'round'),
      join: setSelect('转角', 'round'),
    };
  })()`);
  await sleep(700);

  await evaluate(`(() => {
    const panel = document.querySelector('.right-panel');
    const field = [...panel.querySelectorAll('.field')].find(
      (item) => item.querySelector('.field-label')?.innerText === '宽度'
    );
    const input = field?.querySelector('input');
    if (!input) return 'no width';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '12');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    input.blur();
    return input.value;
  })()`);
  await sleep(600);

  const after = await evaluate(`(() => {
    const panel = document.querySelector('.right-panel');
    const selects = [...(panel?.querySelectorAll('.select-field') ?? [])].map((field) => ({
      label: field.querySelector('.field-label')?.innerText ?? '',
      value: field.querySelector('select')?.value ?? '',
    }));
    const field = [...(panel?.querySelectorAll('.field') ?? [])].find(
      (item) => item.querySelector('.field-label')?.innerText === '宽度'
    );
    return {
      selected: panel?.querySelector('.inspector-name-input')?.value ?? '',
      fillType: [...(panel?.querySelectorAll('.fill-type-btn') ?? [])].find((b) => b.classList.contains('is-on'))?.innerText ?? '',
      selects,
      width: field?.querySelector('input')?.value ?? '',
      strokeText: [...(panel?.querySelectorAll('.ins-section') ?? [])].find((s) => s.querySelector('.ins-title')?.textContent === '描边')?.innerText ?? '',
    };
  })()`);

  console.log('PICKED', picked);
  console.log('BEFORE', JSON.stringify(before));
  console.log('CHANGED', JSON.stringify(changed));
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
      (item) => item.textContent?.trim() === '描边'
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

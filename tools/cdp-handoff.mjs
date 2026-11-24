const port = process.env.CDP_PORT || "9222";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === "page" && /tauri|127\.0\.0\.1|localhost/.test(t.url)) ?? targets.find((t) => t.type === "page");
  if (!page) throw new Error("没有找到 Groma 页面");

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
    const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result?.value;
  };

  await send("Runtime.enable");
  await sleep(600);

  const before = await evaluate(`(() => ({
    buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean).slice(0, 20),
    body: document.body.innerText.slice(0, 300)
  }))()`);
  console.log("BEFORE", JSON.stringify(before));

  const opened = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button.export-btn')];
    const b = buttons.find((item) => item.innerText.trim() === '导出');
    if (!b) return 'no export button';
    b.click();
    return 'opened';
  })()`);
  console.log("OPEN", opened);
  await sleep(500);

  const dialog = await evaluate(`(() => {
    const d = document.querySelector('.export-card');
    return d ? { text: d.innerText, buttons: [...d.querySelectorAll('button')].map(b => b.innerText.trim()) } : null;
  })()`);
  console.log("DIALOG", JSON.stringify(dialog));

  if (process.env.HANDOFF_SCOPE === "page") {
    const scopeResult = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll('.export-seg-btn')];
      const b = buttons.find(x => x.innerText.includes('本页全部'));
      if (!b) return 'no page scope';
      b.click();
      return b.innerText;
    })()`);
    console.log("SCOPE", scopeResult);
    await sleep(450);
  }

  const format = process.env.HANDOFF_FORMAT || "png";
  const formatPick = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('.export-seg-btn')];
    const b = buttons.find(x => x.innerText.trim() === '${format.toUpperCase()}');
    if (!b) return 'no format';
    b.click();
    return 'format ${format}';
  })()`);
  console.log("FORMAT", formatPick);
  await sleep(450);

  if (process.env.EXPORT_TRANSPARENT === "1") {
    const toggled = await evaluate(`(() => {
      const input = document.querySelector('.export-toggle input');
      if (!input) return 'no transparent toggle';
      input.click();
      return input.checked;
    })()`);
    console.log("TRANSPARENT", toggled);
    await sleep(300);
  }

  const action = await evaluate(`(() => {
    const primary = document.querySelector('.export-actions .btn-primary');
    return { text: primary?.innerText, disabled: primary?.disabled };
  })()`);
  console.log("ACTION", JSON.stringify(action));

  if (process.env.HANDOFF_STOP === "1") {
    console.log("STOP BEFORE RUN");
    ws.close();
    return;
  }

  const clicked = await evaluate(`(() => {
    const primary = document.querySelector('.export-actions .btn-primary');
    if (!primary) return 'no primary';
    primary.click();
    return 'clicked';
  })()`);
  console.log("RUN", clicked);

  let toast = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    toast = await evaluate(`(() => {
      const el = document.querySelector('.toast');
      return el ? { title: el.querySelector('strong')?.innerText, detail: el.querySelector('.toast-path')?.innerText } : null;
    })()`);
    if (toast) break;
  }
  console.log("TOAST", JSON.stringify(toast));

  const after = await evaluate(`(() => ({
    modal: Boolean(document.querySelector('.export-card')),
    body: document.body.innerText.slice(0, 300)
  }))()`);
  console.log("AFTER", JSON.stringify(after));

  ws.close();
  if (!toast) process.exitCode = 2;
}

main().catch((e) => {
  console.error("CDP ERROR", e.message);
  process.exitCode = 1;
});

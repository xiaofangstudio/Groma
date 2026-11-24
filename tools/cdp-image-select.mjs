const port = process.env.CDP_PORT || "9222";
const name = process.env.LAYER_NAME;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!name) throw new Error("缺少 LAYER_NAME");
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
  await sleep(500);
  const expanded = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    const target = rows.find((item) => item.innerText.includes(${JSON.stringify(name)}));
    if (target) return 'already';
    const frameRow = rows.find((item) => item.innerText.includes('桌面 1440'));
    const caret = frameRow?.querySelector('.layer-caret');
    caret?.click();
    return 'expanded';
  })()`);
  await sleep(400);
  const picked = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    const row = rows.find((item) => item.innerText.includes(${JSON.stringify(name)}));
    if (!row) return 'no layer';
    row.click();
    return row.innerText.trim();
  })()`);
  console.log("EXPAND", expanded);
  console.log("PICKED", picked);
  await sleep(500);
  const state = await evaluate(`(() => ({
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 320),
    layers: [...document.querySelectorAll('.layer-row')].map((x) => x.innerText.trim())
  }))()`);
  console.log("STATE", JSON.stringify(state));
  ws.close();
  if (picked === 'no layer') process.exitCode = 2;
}

main().catch((error) => {
  console.error("CDP ERROR", error.message);
  process.exitCode = 1;
});

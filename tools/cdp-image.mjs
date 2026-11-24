const port = process.env.CDP_PORT || "9222";
const path = process.env.IMAGE_PATH;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!path) throw new Error("缺少 IMAGE_PATH");
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
  await send("DOM.enable");
  await sleep(500);

  const before = await evaluate(`(() => ({
    body: document.body.innerText.slice(0, 220),
    layers: [...document.querySelectorAll('.layer-row')].map(x => x.innerText.trim())
  }))()`);
  console.log("BEFORE", JSON.stringify(before));

  const documentInfo = await send("DOM.getDocument", { depth: 1 });
  const input = await send("DOM.querySelector", {
    nodeId: documentInfo.root.nodeId,
    selector: 'input[type=file]',
  });
  if (!input.nodeId) throw new Error("没有找到导入文件输入框");
  await send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [path] });
  console.log("FILE SET", path);

  let toast = null;
  for (let i = 0; i < 20; i += 1) {
    await sleep(400);
    toast = await evaluate(`(() => {
      const el = document.querySelector('.toast');
      return el ? { title: el.querySelector('strong')?.innerText, detail: el.querySelector('.toast-path')?.innerText } : null;
    })()`);
    if (toast) break;
  }
  console.log("TOAST", JSON.stringify(toast));

  const after = await evaluate(`(() => ({
    body: document.body.innerText.slice(0, 300),
    layers: [...document.querySelectorAll('.layer-row')].map(x => x.innerText.trim()),
    inspector: document.querySelector('.right-panel .inspector-scroll')?.innerText.slice(0, 320),
    assets: document.body.innerText.includes('图片')
  }))()`);
  console.log("AFTER", JSON.stringify(after));

  // Ctrl+S，等待自动保存链稳定；不清缓存，不重新打开。
  await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    return 'save';
  })()`);
  await sleep(1200);
  console.log("SAVED");

  ws.close();
  if (!toast || !toast.title.includes('已导入')) process.exitCode = 2;
}

main().catch((error) => {
  console.error("CDP ERROR", error.message);
  process.exitCode = 1;
});

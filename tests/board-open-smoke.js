const path = require("path");
const { spawn, execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const defaultElectron = path.join(root, "node_modules", "electron", "dist", "electron.exe");
const executable = process.argv[2] ? path.resolve(process.argv[2]) : defaultElectron;
const isPackaged = executable !== defaultElectron;
const port = isPackaged ? 9372 : 9371;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  let page;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      page = pages.find((entry) => entry.type === "page" && entry.url.includes("renderer/index.html"));
      if (page) break;
    } catch {
      // App is still starting.
    }
    await wait(100);
  }
  if (!page) throw new Error("Timed out waiting for board window");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    evaluate(expression) {
      const requestId = ++id;
      const result = new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
      socket.send(JSON.stringify({
        id: requestId,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true }
      }));
      return result;
    },
    close: () => socket.close()
  };
}

async function main() {
  const args = isPackaged ? [`--remote-debugging-port=${port}`] : [`--remote-debugging-port=${port}`, "."];
  const child = spawn(executable, args, { cwd: root, stdio: "ignore", windowsHide: true });
  const client = await connect();
  try {
    const response = await client.evaluate(`(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const boards = state.library.boards.filter((entry) => Array.isArray(entry.items));
      if (!boards.length) throw new Error("No board available");
      const opened = [];
      for (const board of boards) {
        const link = document.querySelector('[data-board="' + CSS.escape(board.id) + '"]');
        if (!link) throw new Error("Board link missing: " + board.name);
        link.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        opened.push({
          id: board.id,
          name: board.name,
          active: state.activeBoardId === board.id,
          renderedItems: document.querySelectorAll("[data-board-item]").length,
          sourceItems: board.items.length
        });
      }
      const board = boards.at(-1);
      const dock = document.querySelector("#boardDock");
      const area = document.querySelector("[data-board-area]");
      const canvas = area?.querySelector(".board-canvas");
      const dockRect = dock?.getBoundingClientRect();
      const areaRect = area?.getBoundingClientRect();
      return {
        boardId: board.id,
        workspaceMode: state.workspaceMode,
        activeBoardId: state.activeBoardId,
        dockHidden: dock?.classList.contains("hidden"),
        dockWidth: Math.round(dockRect?.width || 0),
        dockHeight: Math.round(dockRect?.height || 0),
        areaWidth: Math.round(areaRect?.width || 0),
        areaHeight: Math.round(areaRect?.height || 0),
        tabCount: document.querySelectorAll("[data-board-tab]").length,
        renderedItems: canvas?.querySelectorAll("[data-board-item]").length || 0,
        sourceItems: board.items.length,
        opened
      };
    })()`);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    const result = response.result.value;
    const valid = result.workspaceMode === "boards"
      && result.activeBoardId === result.boardId
      && !result.dockHidden
      && result.dockWidth > 0
      && result.dockHeight > 0
      && result.areaWidth > 0
      && result.areaHeight > 0
      && result.tabCount > 0
      && result.opened.every((board) => board.active && board.renderedItems <= board.sourceItems);
    if (!valid) throw new Error(`Board did not open correctly: ${JSON.stringify(result)}`);
    console.log(`PASS: ${JSON.stringify(result)}`);
  } finally {
    client.close();
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      child.kill();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

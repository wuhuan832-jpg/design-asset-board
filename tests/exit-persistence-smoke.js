const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const electron = path.join(root, "node_modules", "electron", "dist", "electron.exe");
const stateFile = path.join(root, "library", "meta", "state.json");
const testName = `__EXIT_PERSISTENCE_TEST_${Date.now()}__`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDebugger(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Electron is still starting.
    }
    await wait(100);
  }
  throw new Error("Timed out waiting for Electron debugger");
}

async function connect(port) {
  const socket = new WebSocket(await waitForDebugger(port));
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
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
      const id = nextId++;
      socket.send(JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true }
      }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      socket.close();
    }
  };
}

function launch(port) {
  return spawn(electron, [`--remote-debugging-port=${port}`, "."], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true
  });
}

async function waitForExit(child) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    wait(8000).then(() => {
      child.kill();
      throw new Error("Electron did not finish its graceful close");
    })
  ]);
}

async function closeApp(client, child) {
  await client.evaluate("setTimeout(() => window.close(), 0); true");
  client.close();
  await waitForExit(child);
}

async function main() {
  const original = fs.readFileSync(stateFile);
  let testBoardId = "";
  try {
    const first = launch(9335);
    const firstClient = await connect(9335);
    await wait(500);
    const created = await firstClient.evaluate(`(async () => {
      const next = await api.createBoard(${JSON.stringify(testName)});
      setLibrary(next);
      const board = state.library.boards.find((entry) => entry.name === ${JSON.stringify(testName)});
      const asset = state.library.assets[0] || state.library.boardAssets[0];
      if (!board || !asset) throw new Error("Test requires one existing asset");
      ensureInternalBoardWindow(board.id);
      board.items.push({
        id: crypto.randomUUID(), assetId: asset.id,
        x: 321, y: 654, width: 260, height: 180,
        rotation: 0, flipX: false, flipY: false
      });
      return { boardId: board.id, assetId: asset.id };
    })()`).then((result) => result.result.value);
    testBoardId = created.boardId;
    await wait(250);
    const beforeCloseCount = await firstClient.evaluate(`state.library.boards.find((board) => board.id === ${JSON.stringify(testBoardId)})?.items?.length ?? -1`)
      .then((result) => result.result.value);
    if (beforeCloseCount !== 1) throw new Error(`Board item disappeared before close: ${beforeCloseCount}`);
    await closeApp(firstClient, first);

    const shutdownFile = `${stateFile}.shutdown`;
    const persisted = JSON.parse(fs.readFileSync(fs.existsSync(shutdownFile) ? shutdownFile : stateFile, "utf8"));
    const savedBoard = persisted.boards.find((board) => board.id === testBoardId);
    if (!savedBoard || savedBoard.items.length !== 1 || savedBoard.items[0].assetId !== created.assetId) {
      throw new Error("Unsaved board item was lost during app exit");
    }
    JSON.parse(fs.readFileSync(`${stateFile}.bak`, "utf8"));

    const second = launch(9336);
    const secondClient = await connect(9336);
    const reopenedCount = await secondClient.evaluate(`(async () => {
      const library = await api.getLibrary();
      const board = library.boards.find((entry) => entry.id === ${JSON.stringify(testBoardId)});
      const count = board?.items?.length ?? -1;
      await api.deleteBoard(${JSON.stringify(testBoardId)});
      return count;
    })()`).then((result) => result.result.value);
    if (reopenedCount !== 1) throw new Error(`Expected one item after restart, got ${reopenedCount}`);
    await closeApp(secondClient, second);

    const cleaned = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (cleaned.boards.some((board) => board.id === testBoardId)) throw new Error("Temporary test board was not removed");
    console.log("PASS: unsaved board item survived graceful exit and restart");
  } catch (error) {
    fs.writeFileSync(stateFile, original);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

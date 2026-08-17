const path = require("path");
const { spawn, execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const electron = path.join(root, "node_modules", "electron", "dist", "electron.exe");
const port = 9347;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  let page;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      page = pages.find((entry) => entry.type === "page" && entry.url.includes("renderer/index.html"));
      if (page) break;
    } catch {
      // Electron is still starting.
    }
    await wait(100);
  }
  if (!page) throw new Error("Electron debugger did not start");
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
      socket.send(JSON.stringify({ id: requestId, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
      return result;
    },
    close: () => socket.close()
  };
}

async function main() {
  const child = spawn(electron, [`--remote-debugging-port=${port}`, "--remote-allow-origins=*", "."], { cwd: root, stdio: "ignore", windowsHide: true });
  const client = await connect();
  try {
    const result = await client.evaluate(`(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const originalAssetIds = state.library.assets.slice(0, 2).map((asset) => asset.id);
      if (originalAssetIds.length < 2) throw new Error("Test requires two assets");

      await createFolder("");
      const folderId = state.renamingFolderId;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const folderInput = document.querySelector('[data-folder-name-input="' + CSS.escape(folderId) + '"]');
      const folderFocused = document.activeElement === folderInput;
      folderInput.value = "__INLINE_FOLDER_TEST__";
      els.workspace.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      const folderSaved = getFolder(folderId)?.name === "__INLINE_FOLDER_TEST__";

      for (const assetId of originalAssetIds) setLibrary(await api.setFolderMembership(assetId, folderId, true));
      state.currentFolderId = folderId;
      state.selectedAssetIds = originalAssetIds;
      const created = await api.createGroupFromAssets(folderId, originalAssetIds);
      setLibrary(created.state);
      state.renamingGroupId = created.groupId;
      renderAssetGrid();
      focusGroupRenameInput(created.groupId);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const groupInput = document.querySelector('[data-group-name-input="' + CSS.escape(created.groupId) + '"]');
      const groupFocused = document.activeElement === groupInput;
      groupInput.value = "__INLINE_GROUP_TEST__";
      els.workspace.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      const groupSaved = getGroup(created.groupId)?.name === "__INLINE_GROUP_TEST__";
      setLibrary(await api.updateGroup(created.groupId, { collapsed: true }));
      await new Promise((resolve) => setTimeout(resolve, 40));
      const cards = [...document.querySelectorAll('[data-asset-group="' + CSS.escape(created.groupId) + '"] .grouped-asset-tile')];
      const groupRect = cards[0].parentElement.getBoundingClientRect();
      const cardRects = cards.map((card) => card.getBoundingClientRect());
      const firstAtRight = Math.abs(cardRects[0].right - groupRect.right) < 2;
      const layersExtendLeft = cardRects.slice(1).every((rect, index) => rect.left < cardRects[index].left);
      const color = getGroup(created.groupId)?.color;

      setLibrary(await api.deleteGroup(created.groupId));
      setLibrary(await api.deleteFolder(folderId));
      return { folderFocused, folderSaved, groupFocused, groupSaved, firstAtRight, layersExtendLeft, color };
    })()`);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    const value = result.result.value;
    const expected = ["folderFocused", "folderSaved", "groupFocused", "groupSaved", "firstAtRight", "layersExtendLeft"];
    const failed = expected.filter((key) => value[key] !== true);
    if (failed.length) throw new Error(`Failed checks: ${failed.join(", ")} ${JSON.stringify(value)}`);
    console.log(`PASS: ${JSON.stringify(value)}`);
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

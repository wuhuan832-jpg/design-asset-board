const api = window.assetBoard;
const boardId = new URLSearchParams(location.search).get("boardId");

const els = {
  title: document.querySelector("#floatingBoardTitle"),
  pinWindowBtn: document.querySelector("#pinWindowBtn"),
  area: document.querySelector("#floatingBoardArea"),
  canvas: document.querySelector("#floatingBoardCanvas")
};

function applyFloatingTheme() {
  try {
    const settings = JSON.parse(localStorage.getItem("assetBoardSettings") || "{}");
    document.body.dataset.theme = settings.theme || "palette-b";
    api.setWindowTheme?.(document.body.dataset.theme);
  } catch {
    document.body.dataset.theme = "palette-b";
    api.setWindowTheme?.("palette-b");
  }
}

const state = {
  library: { assets: [], boardAssets: [], boards: [] },
  selectedBoardItemId: "",
  selectedBoardItemIds: [],
  boardSelection: null,
  boardInteraction: null,
  boardPanning: false,
  alwaysOnTop: false,
  boardPanStart: { x: 0, y: 0 },
  boardUndoStack: [],
  boardClipboard: null,
  boardClipboardHash: "",
  suppressNextPasteEvent: false,
  pendingBoardPasteTimer: 0
};

applyFloatingTheme();
window.addEventListener("storage", applyFloatingTheme);
window.addEventListener("focus", applyFloatingTheme);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setLibrary(nextState) {
  state.library = {
    assets: nextState?.assets || [],
    boardAssets: nextState?.boardAssets || [],
    boards: nextState?.boards || []
  };
  render();
}

function getBoard() {
  return state.library.boards.find((board) => board.id === boardId);
}

function getAsset(assetId) {
  return state.library.assets.find((asset) => asset.id === assetId)
    || state.library.boardAssets.find((asset) => asset.id === assetId);
}

function rememberBoard(board) {
  state.boardUndoStack.push(clone(board));
  if (state.boardUndoStack.length > 30) state.boardUndoStack.shift();
}

async function saveBoard(board) {
  setLibrary(await api.saveBoard(board));
}

function screenToBoardPoint(event, board = getBoard()) {
  const rect = els.area.getBoundingClientRect();
  return {
    x: Math.round((event.clientX - rect.left - board.viewport.x) / board.viewport.scale),
    y: Math.round((event.clientY - rect.top - board.viewport.y) / board.viewport.scale)
  };
}

function boardPastePoint(board) {
  return {
    x: Math.round((els.area.clientWidth / 2 - board.viewport.x) / board.viewport.scale),
    y: Math.round((els.area.clientHeight / 2 - board.viewport.y) / board.viewport.scale)
  };
}

function boardItemSize(board, item) {
  const asset = getAsset(item.assetId);
  const width = Math.max(60, Number(item.width) || 260);
  const aspect = asset?.width && asset?.height ? asset.height / asset.width : 0.72;
  return { width, height: Math.max(40, Math.round(width * aspect)) };
}

function setBoardSelection(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  state.selectedBoardItemIds = unique;
  state.selectedBoardItemId = unique.at(-1) || "";
}

function getSelectedBoardItems(board) {
  if (!board) return [];
  const selectedIds = state.selectedBoardItemIds.length
    ? state.selectedBoardItemIds
    : state.selectedBoardItemId
      ? [state.selectedBoardItemId]
      : [];
  return board.items.filter((item) => selectedIds.includes(item.id));
}

function normalizeRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}

function getBoardItemBounds(board, item) {
  const size = boardItemSize(board, item);
  return {
    x: item.x || 0,
    y: item.y || 0,
    width: size.width,
    height: size.height
  };
}

function rectsIntersect(a, b) {
  return a.x <= b.x + b.width
    && a.x + a.width >= b.x
    && a.y <= b.y + b.height
    && a.y + a.height >= b.y;
}

function snapBoardItem(board, item, x, y) {
  const current = boardItemSize(board, item);
  const threshold = Math.max(4, 10 / Math.max(0.2, board.viewport.scale));
  let snappedX = x;
  let snappedY = y;
  let bestX = threshold + 1;
  let bestY = threshold + 1;
  const movingX = [x, x + current.width / 2, x + current.width];
  const movingY = [y, y + current.height / 2, y + current.height];

  board.items.forEach((other) => {
    if (other.id === item.id) return;
    const otherSize = boardItemSize(board, other);
    const targetX = [other.x || 0, (other.x || 0) + otherSize.width / 2, (other.x || 0) + otherSize.width];
    const targetY = [other.y || 0, (other.y || 0) + otherSize.height / 2, (other.y || 0) + otherSize.height];

    movingX.forEach((source) => {
      targetX.forEach((target) => {
        const delta = target - source;
        if (Math.abs(delta) < bestX && Math.abs(delta) <= threshold) {
          bestX = Math.abs(delta);
          snappedX = x + delta;
        }
      });
    });

    movingY.forEach((source) => {
      targetY.forEach((target) => {
        const delta = target - source;
        if (Math.abs(delta) < bestY && Math.abs(delta) <= threshold) {
          bestY = Math.abs(delta);
          snappedY = y + delta;
        }
      });
    });
  });

  return { x: Math.round(snappedX), y: Math.round(snappedY) };
}
async function readClipboardImageFiles() {
  const systemImage = await api.readClipboardImage?.();
  if (systemImage?.bytes) {
    return [{
      file: new File([systemImage.bytes], systemImage.name || `clipboard-${Date.now()}.png`, { type: systemImage.type || "image/png" }),
      hash: systemImage.hash || ""
    }];
  }
  if (!navigator.clipboard?.read) return [];
  try {
    const clipboardItems = await navigator.clipboard.read();
    const files = [];
    for (const clipboardItem of clipboardItems) {
      const imageType = clipboardItem.types.find((type) => type.startsWith("image/"));
      if (!imageType) continue;
      const blob = await clipboardItem.getType(imageType);
      const ext = imageType.split("/")[1]?.replace("jpeg", "jpg") || "png";
      files.push({ file: new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imageType }), hash: "" });
    }
    return files;
  } catch {
    return [];
  }
}

function zoomBoardAtPoint(board, clientX, clientY, deltaY) {
  const rect = els.area.getBoundingClientRect();
  const oldScale = board.viewport.scale || 1;
  const nextScale = Math.min(8, Math.max(0.08, oldScale * (deltaY > 0 ? 0.92 : 1.08)));
  const pointerX = clientX - rect.left;
  const pointerY = clientY - rect.top;
  const boardX = (pointerX - board.viewport.x) / oldScale;
  const boardY = (pointerY - board.viewport.y) / oldScale;
  board.viewport.scale = nextScale;
  board.viewport.x = Math.round(pointerX - boardX * nextScale);
  board.viewport.y = Math.round(pointerY - boardY * nextScale);
}

function render() {
  const board = getBoard();
  if (!board) {
    els.title.textContent = "\u753b\u677f\u4e0d\u5b58\u5728";
    els.canvas.innerHTML = "";
    return;
  }
  els.title.textContent = board.name;
  const { x, y, scale } = board.viewport;
  els.canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  const selectedIds = state.selectedBoardItemIds.length
    ? state.selectedBoardItemIds
    : state.selectedBoardItemId
      ? [state.selectedBoardItemId]
      : [];
  els.canvas.innerHTML = board.items.map((item) => {
    const asset = getAsset(item.assetId);
    if (!asset) return "";
    const rotation = numberOr(item.rotation);
    const flipX = item.flipX ? -1 : 1;
    const flipY = item.flipY ? -1 : 1;
    const selected = selectedIds.includes(item.id);
    const singleSelected = selected && selectedIds.length === 1;
    return `
      <div class="board-item ${selected ? "selected" : ""}" data-board-item="${escapeHtml(item.id)}" style="left:${numberOr(item.x)}px; top:${numberOr(item.y)}px; width:${Math.max(60, numberOr(item.width, 260))}px; transform: rotate(${rotation}deg);">
        <div class="board-item-inner" style="transform: scale(${flipX}, ${flipY});">
          <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)}" draggable="false" />
        </div>
        ${singleSelected ? `<button class="rotate-handle" data-board-handle="rotate"></button>
          <button class="resize-handle" data-board-handle="resize"></button>
        ` : ""}
      </div>
    `;
  }).join("");
  const selection = state.boardSelection;
  if (selection) {
    const rect = normalizeRect(selection.start, selection.current);
    els.area.querySelector(".board-selection-box")?.remove();
    els.area.insertAdjacentHTML("beforeend", `
      <div class="board-selection-box" style="
        left:${rect.x * scale + x}px;
        top:${rect.y * scale + y}px;
        width:${rect.width * scale}px;
        height:${rect.height * scale}px;
      "></div>
    `);
  } else {
    els.area.querySelector(".board-selection-box")?.remove();
  }
}

async function addAssetToBoard(assetId, point) {
  const board = getBoard();
  const asset = getAsset(assetId);
  if (!board || !asset) return;
  rememberBoard(board);
  const aspect = asset.width && asset.height ? asset.height / asset.width : 0.72;
  const item = {
    id: window.crypto.randomUUID(),
    assetId,
    x: point.x,
    y: point.y,
    width: 260,
    height: Math.round(260 * aspect),
    rotation: 0,
    flipX: false,
    flipY: false
  };
  board.items.push(item);
  state.selectedBoardItemId = item.id;
  await saveBoard(board);
}

async function importFilesToBoard(files, point) {
  const imageFiles = [...files].filter((file) => file.type?.startsWith("image/"));
  if (!imageFiles.length) return;
  const payloads = await Promise.all(imageFiles.map(async (file, index) => ({
    name: file.name || `\u753b\u677f\u56fe\u7247-${Date.now()}-${index + 1}`,
    type: file.type || "image/png",
    boardOnly: true,
    bytes: await file.arrayBuffer()
  })));
  const added = await api.importImageData(payloads);
  setLibrary(await api.getLibrary());
  for (let index = added.length - 1; index >= 0; index -= 1) {
    await addAssetToBoard(added[index].id, { x: point.x + index * 28, y: point.y + index * 28 });
  }
}

async function updateSelected(updater) {
  const board = getBoard();
  const item = board?.items.find((entry) => entry.id === state.selectedBoardItemId);
  if (!board || !item) return;
  rememberBoard(board);
  updater(item);
  await saveBoard(board);
}

async function deleteSelected() {
  const board = getBoard();
  const selected = getSelectedBoardItems(board);
  if (!board || !selected.length) return;
  rememberBoard(board);
  const selectedIds = new Set(selected.map((item) => item.id));
  board.items = board.items.filter((item) => !selectedIds.has(item.id));
  setBoardSelection([]);
  await saveBoard(board);
}

async function copySelected() {
  const board = getBoard();
  const selected = getSelectedBoardItems(board);
  if (!selected.length) return;
  const items = selected.map((item) => clone(item));
  state.boardClipboard = { items };
  const result = await api.writeAssetToClipboard?.(items[0].assetId);
  state.boardClipboardHash = result?.hash || "";
  await api.writeBoardClipboard?.({ items, hash: state.boardClipboardHash });
}

async function pasteSelected() {
  const board = getBoard();
  if (!board) return;
  const sharedClipboard = await api.readBoardClipboard?.();
  const clipboard = state.boardClipboard || sharedClipboard;
  const sourceItems = Array.isArray(clipboard?.items) ? clipboard.items : clipboard ? [clipboard] : [];
  if (!sourceItems.length) return;
  rememberBoard(board);
  const minX = Math.min(...sourceItems.map((item) => item.x || 0));
  const minY = Math.min(...sourceItems.map((item) => item.y || 0));
  const point = boardPastePoint(board);
  const pasted = sourceItems.map((source, index) => ({
    ...clone(source),
    id: window.crypto.randomUUID(),
    x: Math.round(point.x + ((source.x || 0) - minX) + 28 + index * 2),
    y: Math.round(point.y + ((source.y || 0) - minY) + 28 + index * 2)
  }));
  board.items.push(...pasted);
  state.boardClipboard = { items: pasted.map((item) => clone(item)) };
  const result = await api.writeAssetToClipboard?.(pasted[0].assetId);
  state.boardClipboardHash = result?.hash || state.boardClipboardHash;
  await api.writeBoardClipboard?.({ items: state.boardClipboard.items, hash: state.boardClipboardHash });
  setBoardSelection(pasted.map((item) => item.id));
  await saveBoard(board);
}

async function pasteExternalClipboardToBoard() {
  const board = getBoard();
  if (!board) return false;
  const entries = await readClipboardImageFiles();
  if (!entries.length) return false;
  const currentHash = entries[0]?.hash || "";
  if (state.boardClipboard && currentHash && currentHash === state.boardClipboardHash) return false;
  state.boardClipboard = null;
  state.boardClipboardHash = "";
  await importFilesToBoard(entries.map((entry) => entry.file), boardPastePoint(board));
  return true;
}

function getPasteEventFiles(event) {
  const files = [...event.clipboardData?.files || []].filter((file) => file?.type?.startsWith("image/"));
  const itemFiles = [...event.clipboardData?.items || []]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file) => file?.type?.startsWith("image/"));
  return files.length ? files : itemFiles;
}

function suppressNextPasteEventBriefly() {
  state.suppressNextPasteEvent = true;
  window.setTimeout(() => {
    state.suppressNextPasteEvent = false;
  }, 500);
}

function clearPendingBoardPaste() {
  if (!state.pendingBoardPasteTimer) return;
  window.clearTimeout(state.pendingBoardPasteTimer);
  state.pendingBoardPasteTimer = 0;
}

function scheduleBoardPasteFallback() {
  clearPendingBoardPaste();
  state.pendingBoardPasteTimer = window.setTimeout(async () => {
    state.pendingBoardPasteTimer = 0;
    await pasteSelected();
  }, 400);
}

async function undoBoard() {
  const previous = state.boardUndoStack.pop();
  if (!previous) return;
  setBoardSelection([]);
  await saveBoard(previous);
}

document.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-board-action]");
  if (!action) return;
  if (action.dataset.boardAction === "mirror-x") await updateSelected((item) => { item.flipX = !item.flipX; });
  if (action.dataset.boardAction === "mirror-y") await updateSelected((item) => { item.flipY = !item.flipY; });
  if (action.dataset.boardAction === "copy") await copySelected();
  if (action.dataset.boardAction === "delete") await deleteSelected();
});

els.area.addEventListener("wheel", async (event) => {
  const board = getBoard();
  if (!board) return;
  event.preventDefault();
  zoomBoardAtPoint(board, event.clientX, event.clientY, event.deltaY);
  render();
  await api.saveBoard(board);
});

els.area.addEventListener("pointerdown", (event) => {
  const board = getBoard();
  if (!board || event.target.closest("[data-board-action]")) return;
  const itemEl = event.target.closest("[data-board-item]");
  const handle = event.target.closest("[data-board-handle]");
  if (event.button === 1) {
    event.preventDefault();
    setBoardSelection([]);
    state.boardPanning = true;
    state.boardPanStart = { x: event.clientX - board.viewport.x, y: event.clientY - board.viewport.y };
    render();
    return;
  }
  if (itemEl && event.button === 0) {
    const item = board.items.find((entry) => entry.id === itemEl.dataset.boardItem);
    const alreadySelected = state.selectedBoardItemIds.includes(item.id);
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      setBoardSelection(alreadySelected
        ? state.selectedBoardItemIds.filter((id) => id !== item.id)
        : [...state.selectedBoardItemIds, item.id]);
    } else if (!alreadySelected) {
      setBoardSelection([item.id]);
    } else {
      setBoardSelection(state.selectedBoardItemIds.length ? state.selectedBoardItemIds : [item.id]);
    }
    render();
    if (handle?.dataset.boardHandle === "resize") {
      rememberBoard(board);
      state.boardInteraction = { type: "resize", item, startX: event.clientX, originWidth: numberOr(item.width, 260) };
      return;
    }
    if (handle?.dataset.boardHandle === "rotate") {
      rememberBoard(board);
      const rect = itemEl.getBoundingClientRect();
      state.boardInteraction = { type: "rotate", item, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 };
      return;
    }
    rememberBoard(board);
    state.boardInteraction = {
      type: "move",
      item,
      items: getSelectedBoardItems(board).map((entry) => ({
        item: entry,
        originX: entry.x || 0,
        originY: entry.y || 0
      })),
      startX: event.clientX,
      startY: event.clientY,
      originX: item.x,
      originY: item.y
    };
  } else if (event.button === 0) {
    const start = screenToBoardPoint(event, board);
    setBoardSelection([]);
    state.boardSelection = { start, current: start };
    render();
  }
});

els.pinWindowBtn.addEventListener("click", async () => {
  state.alwaysOnTop = !state.alwaysOnTop;
  const actual = await api.setAlwaysOnTop(state.alwaysOnTop);
  state.alwaysOnTop = Boolean(actual);
  els.pinWindowBtn.classList.toggle("active", state.alwaysOnTop);
  els.pinWindowBtn.title = state.alwaysOnTop ? "\u5df2\u7f6e\u9876" : "\u7f6e\u9876\u7a97\u53e3";
  els.pinWindowBtn.setAttribute("aria-label", els.pinWindowBtn.title);
});

window.addEventListener("pointermove", (event) => {
  const board = getBoard();
  if (state.boardInteraction && board) {
    const op = state.boardInteraction;
    if (op.type === "move") {
      const deltaX = (event.clientX - op.startX) / board.viewport.scale;
      const deltaY = (event.clientY - op.startY) / board.viewport.scale;
      if (op.items?.length > 1) {
        op.items.forEach((entry) => {
          entry.item.x = Math.round(entry.originX + deltaX);
          entry.item.y = Math.round(entry.originY + deltaY);
        });
      } else {
        const next = snapBoardItem(
          board,
          op.item,
          op.originX + deltaX,
          op.originY + deltaY
        );
        op.item.x = next.x;
        op.item.y = next.y;
      }
    }
    if (op.type === "resize") op.item.width = Math.max(60, Math.round(op.originWidth + (event.clientX - op.startX) / board.viewport.scale));
    if (op.type === "rotate") op.item.rotation = Math.round(Math.atan2(event.clientY - op.centerY, event.clientX - op.centerX) * 180 / Math.PI + 90);
    render();
  }
  if (state.boardPanning && board) {
    board.viewport.x = event.clientX - state.boardPanStart.x;
    board.viewport.y = event.clientY - state.boardPanStart.y;
    render();
  }
  if (state.boardSelection && board) {
    state.boardSelection.current = screenToBoardPoint(event, board);
    const rect = normalizeRect(state.boardSelection.start, state.boardSelection.current);
    const selected = board.items
      .filter((item) => rectsIntersect(rect, getBoardItemBounds(board, item)))
      .map((item) => item.id);
    setBoardSelection(selected);
    render();
  }
});

window.addEventListener("pointerup", async () => {
  const board = getBoard();
  if ((state.boardInteraction || state.boardPanning) && board) await api.saveBoard(board);
  state.boardSelection = null;
  state.boardInteraction = null;
  state.boardPanning = false;
  render();
});

document.addEventListener("paste", async (event) => {
  if (state.suppressNextPasteEvent) {
    state.suppressNextPasteEvent = false;
    event.preventDefault();
    return;
  }
  let pastedFiles = getPasteEventFiles(event);
  let clipboardEntries = [];
  if (!pastedFiles.length) {
    if (!clipboardEntries.length) clipboardEntries = await readClipboardImageFiles();
    if (state.pendingBoardPasteTimer && state.boardClipboard) {
      const currentHash = clipboardEntries[0]?.hash || "";
      if (currentHash && currentHash === state.boardClipboardHash) {
        event.preventDefault();
        return;
      }
    }
    pastedFiles = clipboardEntries.map((entry) => entry.file);
  }
  const board = getBoard();
  if (!board || !pastedFiles.length) return;
  const point = boardPastePoint(board);
  clearPendingBoardPaste();
  state.boardClipboard = null;
  state.boardClipboardHash = "";
  event.preventDefault();
  await importFilesToBoard(pastedFiles, point);
});

document.addEventListener("dragover", (event) => {
  event.preventDefault();
  document.body.classList.add("drag-active");
});

document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) document.body.classList.remove("drag-active");
});

document.addEventListener("drop", async (event) => {
  const board = getBoard();
  if (!board) return;
  event.preventDefault();
  document.body.classList.remove("drag-active");
  const point = screenToBoardPoint(event, board);
  const assetId = event.dataTransfer.getData("text/asset-id");
  if (assetId) await addAssetToBoard(assetId, point);
  else await importFilesToBoard(event.dataTransfer?.files || [], point);
});

window.addEventListener("keydown", async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    await undoBoard();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    await copySelected();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && state.boardClipboard) {
    scheduleBoardPasteFallback();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
    scheduleBoardPasteFallback();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    await deleteSelected();
  }
});

api.onLibraryUpdated(setLibrary);
api.getLibrary().then(setLibrary);


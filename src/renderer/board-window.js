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
  boardPanning: null,
  pendingBoardSave: Promise.resolve(),
  alwaysOnTop: false,
  boardUndoStack: [],
  boardClipboard: null,
  boardClipboardHash: "",
  suppressNextPasteEvent: false,
  pendingBoardPasteTimer: 0,
  lastBoardPointer: null
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
  const liveBoard = state.boardInteraction?.board || state.boardPanning?.board;
  const boards = nextState?.boards || [];
  state.library = {
    assets: nextState?.assets || [],
    boardAssets: nextState?.boardAssets || [],
    boards: boards.map((board) => liveBoard?.id === board.id ? liveBoard : board)
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
  if (!board) return;
  const snapshot = clone(board);
  const save = async () => setLibrary(await api.saveBoard(snapshot));
  state.pendingBoardSave = state.pendingBoardSave.then(save, save);
  return state.pendingBoardSave;
}

function getBoardForClose() {
  const board = state.boardInteraction?.board || state.boardPanning?.board || getBoard();
  return board ? clone(board) : null;
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
  if (item.type === "text") {
    return {
      width: Math.max(120, Number(item.width) || 220),
      height: Math.max(36, Number(item.height) || 56)
    };
  }
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
    const isText = item.type === "text";
    const asset = isText ? null : getAsset(item.assetId);
    if (!isText && !asset) return "";
    const rotation = numberOr(item.rotation);
    const flipX = item.flipX ? -1 : 1;
    const flipY = item.flipY ? -1 : 1;
    const selected = selectedIds.includes(item.id);
    const singleSelected = selected && selectedIds.length === 1;
    const size = boardItemSize(board, item);
    return `
      <div class="board-item ${isText ? "board-text-item" : ""} ${selected ? "selected" : ""}" data-board-item="${escapeHtml(item.id)}" style="left:${numberOr(item.x)}px; top:${numberOr(item.y)}px; width:${size.width}px;${isText ? ` height:${size.height}px;` : ""} transform: rotate(${rotation}deg);">
        <div class="board-item-inner" style="transform: scale(${flipX}, ${flipY});">
          ${isText
            ? `<div class="board-text-content">${escapeHtml(item.text || "文字")}</div>`
            : `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)}" draggable="false" />`}
        </div>
        ${singleSelected && !isText ? `<button class="rotate-handle" data-board-handle="rotate"></button>
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

async function addTextToBoard(text, point) {
  const board = getBoard();
  const value = String(text || "").trim();
  if (!board || !value) return;
  rememberBoard(board);
  const item = {
    id: window.crypto.randomUUID(),
    type: "text",
    text: value,
    x: point.x,
    y: point.y,
    width: Math.max(140, Math.min(720, Array.from(value).length * 30 + 28)),
    height: 56,
    rotation: 0
  };
  board.items.push(item);
  setBoardSelection([item.id]);
  await saveBoard(board);
}

function openBoardTextInput() {
  const board = getBoard();
  if (!board) return;
  document.querySelector(".board-text-entry")?.remove();
  const point = state.lastBoardPointer || boardPastePoint(board);
  const input = document.createElement("input");
  input.className = "board-text-entry";
  input.type = "text";
  input.placeholder = "输入文字，按 Enter 放入画板";
  input.setAttribute("aria-label", "画板文字");
  const screenX = point.x * board.viewport.scale + board.viewport.x;
  const screenY = point.y * board.viewport.scale + board.viewport.y;
  input.style.left = `${Math.max(12, Math.min(els.area.clientWidth - 332, screenX))}px`;
  input.style.top = `${Math.max(12, Math.min(els.area.clientHeight - 52, screenY))}px`;
  input.addEventListener("pointerdown", (event) => event.stopPropagation());
  input.addEventListener("keydown", async (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      input.remove();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = input.value;
    input.remove();
    await addTextToBoard(value, point);
    render();
  });
  input.addEventListener("blur", () => setTimeout(() => input.remove(), 0));
  els.area.appendChild(input);
  input.focus();
}

async function copySelected() {
  const board = getBoard();
  const selected = getSelectedBoardItems(board);
  if (!selected.length) return;
  const items = selected.map((item) => clone(item));
  state.boardClipboard = { items };
  const imageItem = items.find((item) => item.assetId);
  const result = imageItem ? await api.writeAssetToClipboard?.(imageItem.assetId) : null;
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
  const imageItem = pasted.find((item) => item.assetId);
  const result = imageItem ? await api.writeAssetToClipboard?.(imageItem.assetId) : null;
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
  if (state.boardPanning) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  zoomBoardAtPoint(board, event.clientX, event.clientY, event.deltaY);
  render();
  await saveBoard(board);
});

els.area.addEventListener("pointerdown", (event) => {
  const board = getBoard();
  if (!board || event.target.closest("[data-board-action]")) return;
  const itemEl = event.target.closest("[data-board-item]");
  const handle = event.target.closest("[data-board-handle]");
  if (event.button === 1) {
    event.preventDefault();
    setBoardSelection([]);
    state.boardInteraction = null;
    state.boardSelection = null;
    state.boardPanning = {
      board,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: board.viewport.x,
      originY: board.viewport.y
    };
    els.area.classList.add("panning");
    els.area.setPointerCapture?.(event.pointerId);
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
      state.boardInteraction = { type: "resize", board, item, startX: event.clientX, originWidth: numberOr(item.width, 260) };
      return;
    }
    if (handle?.dataset.boardHandle === "rotate") {
      rememberBoard(board);
      const rect = itemEl.getBoundingClientRect();
      state.boardInteraction = { type: "rotate", board, item, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 };
      return;
    }
    rememberBoard(board);
    state.boardInteraction = {
      type: "move",
      board,
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
  if (board && els.area.contains(event.target)) {
    state.lastBoardPointer = screenToBoardPoint(event, board);
  }
  if (state.boardPanning && board) {
    const pan = state.boardPanning;
    if (event.pointerId !== pan.pointerId) return;
    board.viewport.x = Math.round(pan.originX + event.clientX - pan.startX);
    board.viewport.y = Math.round(pan.originY + event.clientY - pan.startY);
    els.canvas.style.transform = `translate(${board.viewport.x}px, ${board.viewport.y}px) scale(${board.viewport.scale})`;
    return;
  }
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

window.addEventListener("pointerup", async (event) => {
  const board = getBoard();
  if (state.boardPanning) {
    if (event.pointerId !== state.boardPanning.pointerId) return;
    const pan = state.boardPanning;
    els.area.classList.remove("panning");
    if (els.area.hasPointerCapture?.(pan.pointerId)) els.area.releasePointerCapture(pan.pointerId);
    if (pan.board || board) await saveBoard(pan.board || board);
    state.boardPanning = null;
    return;
  }
  if (state.boardInteraction?.board || board) await saveBoard(state.boardInteraction?.board || board);
  state.boardSelection = null;
  state.boardInteraction = null;
  render();
});

window.addEventListener("pointercancel", async (event) => {
  const pan = state.boardPanning;
  if (!pan || event.pointerId !== pan.pointerId) return;
  els.area.classList.remove("panning");
  const board = pan.board || getBoard();
  if (board) await saveBoard(board);
  state.boardPanning = null;
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
  if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
  if (event.key.toLowerCase() === "t" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    openBoardTextInput();
    return;
  }
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
api.onPrepareToClose?.(async () => {
  clearPendingBoardPaste();
  const liveBoard = getBoardForClose();
  await state.pendingBoardSave.catch(() => {});
  if (liveBoard) await api.saveBoards([clone(liveBoard)]);
});
window.addEventListener("beforeunload", () => {
  const board = getBoardForClose();
  api.flushBoardsSync?.(board ? [board] : []);
});
api.getLibrary().then(setLibrary);


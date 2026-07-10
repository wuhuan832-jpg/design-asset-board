const api = window.assetBoard;

const els = {
  openImportBtn: document.querySelector("#openImportBtn"),
  importBtn: document.querySelector("#importBtn"),
  dropHint: document.querySelector("#dropHint"),
  newBoardBtn: document.querySelector("#newBoardBtn"),
  newFolderBtn: document.querySelector("#newFolderBtn"),
  assetGrid: document.querySelector("#assetGrid"),
  boardDock: document.querySelector("#boardDock"),
  boardTabStrip: document.querySelector("#boardTabStrip"),
  boardDesktop: document.querySelector("#boardDesktop"),
  appShell: document.querySelector(".app-shell"),
  workspace: document.querySelector(".workspace"),
  folderList: document.querySelector("#folderList"),
  boardList: document.querySelector("#boardList"),
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  allCount: document.querySelector("#allCount"),
  libraryPath: document.querySelector("#libraryPath"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  assetInfo: document.querySelector("#assetInfo"),
  folderPopover: document.querySelector("#folderPopover"),
  folderContextMenu: document.querySelector("#folderContextMenu"),
  boardContextMenu: document.querySelector("#boardContextMenu"),
  viewer: document.querySelector("#viewer"),
  closeViewerBtn: document.querySelector("#closeViewerBtn"),
  viewerImage: document.querySelector("#viewerImage"),
  imagePlane: document.querySelector("#imagePlane"),
  annotationCanvas: document.querySelector("#annotationCanvas"),
  viewerMeta: document.querySelector("#viewerMeta"),
  filmstrip: document.querySelector("#filmstrip"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  fitBtn: document.querySelector("#fitBtn"),
  actualBtn: document.querySelector("#actualBtn"),
  toggleAnnotationsBtn: document.querySelector("#toggleAnnotationsBtn"),
  undoBtn: document.querySelector("#undoBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  colorInput: document.querySelector("#colorInput"),
  strokeInput: document.querySelector("#strokeInput")
};

const state = {
  library: { assets: [], boardAssets: [], recycleBin: [], folders: [], boards: [], annotations: {}, notes: [], mindMaps: [], settings: {} },
  workspaceMode: "assets",
  view: "all",
  currentFolderId: "",
  selectedAssetId: "",
  viewerAssetId: "",
  viewerZoom: 1,
  viewerPan: { x: 0, y: 0 },
  viewerDragging: false,
  viewerDragStart: { x: 0, y: 0 },
  tool: "pen",
  folderPopoverAssetId: "",
  renamingFolderId: "",
  renamingBoardId: "",
  openBoardIds: [],
  activeBoardId: "",
  internalBoardWindows: {},
  internalBoardInteraction: null,
  internalBoardPanning: false,
  internalBoardPanStart: { x: 0, y: 0 },
  internalBoardUndoStack: [],
  internalBoardClipboard: null,
  internalBoardClipboardHash: "",
  suppressNextPasteEvent: false,
  pendingInternalBoardPasteTimer: 0,
  selectedInternalBoardItemId: "",
  boardTabDrag: null,
  suppressBoardTabClick: false,
  annotationsVisible: true,
  drawing: false,
  draftShape: null
};

const defaultAppSettings = {
  theme: "palette-b",
  shortcuts: {
    undo: "Ctrl+Z",
    copy: "Ctrl+C",
    paste: "Ctrl+V",
    delete: "Delete"
  }
};

const appSettings = loadAppSettings();

function loadAppSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("assetBoardSettings") || "{}");
    return {
      ...defaultAppSettings,
      ...saved,
      shortcuts: { ...defaultAppSettings.shortcuts, ...(saved.shortcuts || {}) }
    };
  } catch {
    return structuredClone(defaultAppSettings);
  }
}

function saveAppSettings() {
  localStorage.setItem("assetBoardSettings", JSON.stringify(appSettings));
  applyAppSettings();
}

function applyAppSettings() {
  document.body.dataset.theme = appSettings.theme;
  api.setWindowTheme?.(appSettings.theme);
}

function normalizeShortcut(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .split("+")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "control") return "Ctrl";
      if (lower === "cmd" || lower === "command" || lower === "meta") return "Meta";
      if (lower === "esc") return "Escape";
      if (lower.length === 1) return lower.toUpperCase();
      return part[0]?.toUpperCase() + part.slice(1);
    })
    .join("+");
}

function shortcutFromEvent(event) {
  const parts = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const key = event.key === " " ? "Space" : event.key;
  if (!["Control", "Meta", "Alt", "Shift"].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
  }
  return parts.join("+");
}

function matchesShortcut(event, action) {
  return shortcutFromEvent(event) === normalizeShortcut(appSettings.shortcuts[action]);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderSettingsPanel() {
  const existing = document.querySelector("#settingsOverlay");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = "settingsOverlay";
  overlay.className = "settings-overlay";
  overlay.innerHTML = `
    <section class="settings-panel" role="dialog" aria-modal="true" aria-label="\u8bbe\u7f6e">
      <header class="settings-header">
        <div>
          <h2>\u8bbe\u7f6e</h2>
          <p>\u5916\u89c2\u548c\u5e38\u7528\u5feb\u6377\u952e</p>
        </div>
        <button class="settings-close" data-close-settings>\u00d7</button>
      </header>
      <div class="settings-section">
        <h3>\u5916\u89c2</h3>
        <label class="settings-field">
          <span>\u914d\u8272\u65b9\u6848</span>
          <select data-setting-theme>
            <option value="palette-b" ${appSettings.theme === "palette-b" ? "selected" : ""}>\u8584\u5de7</option>
            <option value="mint-brown" ${appSettings.theme === "mint-brown" ? "selected" : ""}>A \u8584\u5de7</option>
            <option value="dark-cyan" ${appSettings.theme === "dark-cyan" ? "selected" : ""}>\u6697\u8272\u9752\u7eff</option>
            <option value="light-rose" ${appSettings.theme === "light-rose" ? "selected" : ""}>\u660e\u4eae\u73ab\u7470</option>
          </select>
        </label>
      </div>
      <div class="settings-section">
        <h3>\u4fdd\u5b58</h3>
        <label class="settings-field settings-field-wide">
          <span>\u7d20\u6750\u4fdd\u5b58\u8def\u5f84</span>
          <button data-choose-library-path>\u66f4\u6539\u4f4d\u7f6e</button>
        </label>
        <p class="settings-path">${escapeHtml(state.library.settings.libraryPath || "\u9ed8\u8ba4\u5185\u90e8\u5e93")}</p>
      </div>
      <div class="settings-section">
        <h3>\u56de\u6536\u7ad9</h3>
        <label class="settings-field">
          <span>\u4fdd\u7559\u5929\u6570</span>
          <input data-recycle-days type="number" min="1" max="365" value="${escapeHtml(state.library.settings.recycleRetentionDays || 7)}" />
        </label>
      </div>
      <div class="settings-section">
        <h3>\u5feb\u6377\u952e</h3>
        ${[
          ["undo", "\u64a4\u9500"],
          ["copy", "\u590d\u5236\u753b\u677f\u56fe\u7247"],
          ["paste", "\u7c98\u8d34\u753b\u677f\u56fe\u7247"],
          ["delete", "\u5220\u9664\u9009\u4e2d\u5185\u5bb9"]
        ].map(([key, label]) => `
          <label class="shortcut-row">
            <span>${label}</span>
            <input data-shortcut="${key}" value="${escapeHtml(appSettings.shortcuts[key])}" readonly />
          </label>
        `).join("")}
      </div>
    </section>
  `;
  document.body.appendChild(overlay);
}

function closeSettingsPanel() {
  document.querySelector("#settingsOverlay")?.remove();
}
function formatBytes(bytes) {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function normalizeLibrary(nextState) {
  return {
    assets: nextState?.assets || [],
    boardAssets: nextState?.boardAssets || [],
    recycleBin: nextState?.recycleBin || [],
    folders: nextState?.folders || [],
    boards: nextState?.boards || [],
    annotations: nextState?.annotations || {},
    notes: nextState?.notes || [],
    mindMaps: nextState?.mindMaps || [],
    settings: nextState?.settings || {}
  };
}

function getAsset(assetId) {
  return state.library.assets.find((asset) => asset.id === assetId)
    || state.library.boardAssets.find((asset) => asset.id === assetId)
    || state.library.recycleBin.find((item) => item.asset?.id === assetId)?.asset;
}

function getFolder(folderId) {
  return state.library.folders.find((folder) => folder.id === folderId);
}

function getBoard(boardId = state.activeBoardId) {
  return state.library.boards.find((board) => board.id === boardId);
}

function getAssetNote(assetId) {
  return state.library.notes.find((note) => note.assetId === assetId)?.text || "";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function saveBoard(board) {
  setLibrary(await api.saveBoard(board));
}

async function detachBoardToFloating(boardId) {
  if (!getBoard(boardId)) return;
  await api.openFloatingBoard(boardId);
  state.openBoardIds = state.openBoardIds.filter((id) => id !== boardId);
  if (state.activeBoardId === boardId) state.activeBoardId = state.openBoardIds.at(-1) || "";
  state.selectedInternalBoardItemId = "";
  state.workspaceMode = "boards";
  render();
}

function ensureInternalBoardWindow(boardId) {
  if (!getBoard(boardId)) return;
  if (!state.openBoardIds.includes(boardId)) state.openBoardIds.push(boardId);
  state.activeBoardId = boardId;
  state.workspaceMode = "boards";
  if (!state.internalBoardWindows[boardId]) {
    const index = state.openBoardIds.length - 1;
    state.internalBoardWindows[boardId] = {
      x: 36 + index * 28,
      y: 54 + index * 28,
      width: 640,
      height: 380
    };
  }
  render();
}

function boardPointFromEvent(event, board, boardWindow) {
  const area = event.target.closest(".internal-board-area, .floating-board-area");
  if (!area) return { x: 0, y: 0 };
  const rect = area.getBoundingClientRect();
  return {
    x: Math.round((event.clientX - rect.left - board.viewport.x) / board.viewport.scale),
    y: Math.round((event.clientY - rect.top - board.viewport.y) / board.viewport.scale)
  };
}

function getInternalBoardArea(boardId) {
  return document.querySelector(`[data-board-area="${CSS.escape(boardId)}"]`);
}

function getInternalBoardPastePoint(board) {
  const area = getInternalBoardArea(board.id);
  const width = area?.clientWidth || 800;
  const height = area?.clientHeight || 520;
  return {
    x: Math.round((width / 2 - board.viewport.x) / board.viewport.scale),
    y: Math.round((height / 2 - board.viewport.y) / board.viewport.scale)
  };
}

function boardItemSize(board, item) {
  const asset = getAsset(item.assetId);
  const width = Math.max(60, Number(item.width) || 260);
  const aspect = asset?.width && asset?.height ? asset.height / asset.width : 0.72;
  return { width, height: Math.max(40, Math.round(width * aspect)) };
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

function zoomBoardAtPoint(board, area, clientX, clientY, deltaY) {
  const rect = area.getBoundingClientRect();
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

function getAssetFolderIds(asset) {
  if (Array.isArray(asset?.folderIds)) return asset.folderIds;
  return asset?.folderId ? [asset.folderId] : [];
}

function folderAssetCount(folderId) {
  return state.library.assets.filter((asset) => getAssetFolderIds(asset).includes(folderId)).length;
}

function getFolderDescendantIds(folderId) {
  const ids = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    state.library.folders.forEach((folder) => {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    });
  }
  return [...ids];
}

function renderFolderTree(parentId = "", depth = 0) {
  return state.library.folders
    .filter((folder) => (folder.parentId || "") === parentId)
    .map((folder) => {
      const children = renderFolderTree(folder.id, depth + 1);
      if (state.renamingFolderId === folder.id) {
        return `
          <div class="folder-link active folder-edit-row" style="--folder-depth:${depth}">
            <input class="folder-name-input" data-folder-name-input="${escapeHtml(folder.id)}" value="${escapeHtml(folder.name)}" />
            <button class="folder-save" data-save-folder="${escapeHtml(folder.id)}">\u4fdd\u5b58</button>
            <button class="folder-cancel" data-cancel-folder-rename="${escapeHtml(folder.id)}">\u53d6\u6d88</button>
          </div>
          ${children}
        `;
      }
      return `
        <div class="folder-link ${folder.id === state.currentFolderId ? "active" : ""}" data-folder="${escapeHtml(folder.id)}" style="--folder-depth:${depth}">
          <span class="folder-name">${escapeHtml(folder.name)}</span>
          <small>${folderAssetCount(folder.id)} \u5f20</small>
        </div>
        ${children}
      `;
    }).join("");
}

function renderFolderMembershipTree(asset, parentId = "", depth = 0) {
  const folderIds = getAssetFolderIds(asset);
  return state.library.folders
    .filter((folder) => (folder.parentId || "") === parentId)
    .map((folder) => `
      <label class="folder-check" style="--folder-depth:${depth}; --folder-indent:${depth * 18}px; --folder-line-indent:${Math.max(0, depth - 1) * 18}px;">
        <input type="checkbox" data-folder-membership="${escapeHtml(asset.id)}" data-folder-id="${escapeHtml(folder.id)}" ${folderIds.includes(folder.id) ? "checked" : ""} />
        <span class="folder-check-name">${escapeHtml(folder.name)}</span>
      </label>
      ${renderFolderMembershipTree(asset, folder.id, depth + 1)}
    `).join("");
}

function focusFolderRenameInput(folderId) {
  setTimeout(() => {
    const input = document.querySelector(`[data-folder-name-input="${CSS.escape(folderId)}"]`);
    input?.focus();
    input?.select();
  }, 0);
}

function focusBoardRenameInput(boardId) {
  setTimeout(() => {
    const input = document.querySelector(`[data-board-name-input="${CSS.escape(boardId)}"]`);
    input?.focus();
    input?.select();
  }, 0);
}

function getAssetsForView() {
  if (state.view === "trash") return state.library.recycleBin.map((item) => ({ ...item.asset, deletedAt: item.deletedAt })).filter(Boolean);
  let assets = [...state.library.assets];
  if (state.currentFolderId) {
    assets = assets.filter((asset) => getAssetFolderIds(asset).includes(state.currentFolderId));
  } else if (state.view === "recent") {
    assets = assets.slice(0, 60);
  } else if (state.view === "favorite") {
    assets = assets.filter((asset) => asset.favorite);
  } else if (state.view === "uncategorized") {
    assets = assets.filter((asset) => getAssetFolderIds(asset).length === 0);
  }

  const keyword = els.searchInput.value.trim().toLowerCase();
  if (keyword) assets = assets.filter((asset) => asset.name.toLowerCase().includes(keyword));

  const sort = els.sortSelect.value;
  if (sort === "largest") assets.sort((a, b) => b.width * b.height - a.width * a.height);
  else if (sort === "name") assets.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  else assets.sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
  return assets;
}

function currentImportFolderId() {
  return state.currentFolderId || "";
}

async function importBrowserFiles(files, sourceName = "\u56fe\u7247") {
  const imageFiles = [...files].filter((file) => file.type?.startsWith("image/"));
  if (!imageFiles.length) return;
  const folderId = currentImportFolderId();
  const payloads = await Promise.all(imageFiles.map(async (file, index) => ({
    name: file.name || `${sourceName}-${Date.now()}-${index + 1}`,
    type: file.type || "image/png",
    folderId,
    boardOnly: false,
    bytes: await file.arrayBuffer()
  })));
  const added = await api.importImageData(payloads);
  setLibrary(await api.getLibrary());
  if (added?.[0]) state.selectedAssetId = added[0].id;
  render();
}

function setLibrary(nextState) {
  if (!nextState) return;
  state.library = normalizeLibrary(nextState);
  if (state.currentFolderId && !getFolder(state.currentFolderId)) state.currentFolderId = "";
  render();
}

function render() {
  els.allCount.textContent = state.library.assets.length;
  els.libraryPath.textContent = "\u8f6f\u4ef6\u81ea\u52a8\u4fdd\u5b58\uff0c\u4e0d\u9700\u8981\u7535\u8111\u6587\u4ef6\u5939\u6574\u7406";
  els.appShell.classList.toggle("board-shell", state.workspaceMode === "boards");
  els.workspace.classList.toggle("board-workspace", state.workspaceMode === "boards");
  ensureTrashNav();
  renderNavigation();
  renderMain();
  renderInspector();
  renderInternalBoards();
}

function ensureTrashNav() {
  if (document.querySelector('[data-view="trash"]')) return;
  document.querySelector(".nav-group")?.insertAdjacentHTML("beforeend", `
    <button class="nav-item" data-view="trash">\u56de\u6536\u7ad9 <span id="trashCount">0</span></button>
  `);
}

function renderNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view && !state.currentFolderId);
  });
  const trashCount = document.querySelector("#trashCount");
  if (trashCount) trashCount.textContent = state.library.recycleBin.length;

  els.folderList.innerHTML = state.library.folders.length
    ? renderFolderTree()
    : `<p class="muted sidebar-note">\u70b9 + \u521b\u5efa\u8f6f\u4ef6\u5185\u6587\u4ef6\u5939\uff0c\u4e0d\u4f1a\u521b\u5efa\u7535\u8111\u771f\u5b9e\u6587\u4ef6\u5939\u3002</p>`;

  els.boardList.innerHTML = state.library.boards.map((board) => state.renamingBoardId === board.id ? `
    <div class="board-link active board-edit-row">
      <input class="folder-name-input" data-board-name-input="${escapeHtml(board.id)}" value="${escapeHtml(board.name)}" />
      <button class="folder-save" data-save-board="${escapeHtml(board.id)}">\u4fdd\u5b58</button>
      <button class="folder-cancel" data-cancel-board-rename="${escapeHtml(board.id)}">\u53d6\u6d88</button>
    </div>
  ` : `
    <button class="board-link" data-board="${escapeHtml(board.id)}" title="\u6253\u5f00\u753b\u677f">
      <span>${escapeHtml(board.name)}</span>
      <small>${board.items?.length || 0} \u5f20</small>
    </button>
  `).join("");
}

function renderMain() {
  const activeBoard = state.workspaceMode === "boards" ? getBoard(state.activeBoardId) : null;
  els.assetGrid.classList.toggle("hidden", Boolean(activeBoard));
  els.assetGrid.classList.toggle("hidden", state.workspaceMode === "boards");
  if (activeBoard) {
    els.viewTitle.textContent = activeBoard.name;
    els.viewSubtitle.textContent = "\u753b\u677f\u5df2\u96c6\u6210\u5728\u8f6f\u4ef6\u5185\u3002\u62d6\u52a8\u753b\u677f\u6807\u7b7e\u53ef\u62d6\u51fa\u4e3a\u72ec\u7acb\u7a97\u53e3\uff0c\u62d6\u56de\u6807\u7b7e\u680f\u53ef\u653e\u56de\u3002";
    return;
  }
  if (state.workspaceMode === "boards") {
    els.viewTitle.textContent = "\u753b\u677f";
    els.viewSubtitle.textContent = "\u8fd8\u6ca1\u6709\u6253\u5f00\u7684\u753b\u677f\u3002\u70b9\u51fb\u5de6\u4fa7\u753b\u677f\u6253\u5f00\uff0c\u6216\u628a\u72ec\u7acb\u753b\u677f\u62d6\u56de\u8fd9\u91cc\u3002";
    return;
  }
  const folder = getFolder(state.currentFolderId);
  els.viewTitle.textContent = folder?.name || { all: "\u5168\u90e8\u7d20\u6750", recent: "\u6700\u8fd1\u5bfc\u5165", favorite: "\u6536\u85cf", uncategorized: "\u672a\u5206\u7c7b", trash: "\u56de\u6536\u7ad9" }[state.view];
  els.viewSubtitle.textContent = folder
    ? "\u8fd9\u662f\u8f6f\u4ef6\u5185\u6587\u4ef6\u5939\uff0c\u53ea\u8d1f\u8d23\u7d20\u6750\u5206\u7c7b\u3002\u753b\u677f\u4f1a\u4f5c\u4e3a\u8f6f\u4ef6\u5185\u6807\u7b7e\u9875\u6253\u5f00\u3002"
    : state.view === "trash"
      ? `\u5220\u9664\u7684\u7d20\u6750\u4f1a\u4fdd\u7559 ${state.library.settings.recycleRetentionDays || 7} \u5929\u3002`
      : "\u76f4\u63a5 Ctrl+V \u7c98\u8d34\u56fe\u7247\u3002\u753b\u677f\u4f1a\u5148\u4f5c\u4e3a\u8f6f\u4ef6\u5185\u6807\u7b7e\u9875\u6253\u5f00\u3002";
  renderAssetGrid();
}
function renderAssetGrid() {
  const assets = getAssetsForView();
  if (!assets.length) {
    els.assetGrid.innerHTML = `
      <div class="empty-state">
        <h3>${state.view === "trash" ? "\u56de\u6536\u7ad9\u662f\u7a7a\u7684" : "\u8fd9\u91cc\u8fd8\u6ca1\u6709\u56fe\u7247"}</h3>
        <p>${state.view === "trash" ? "\u5220\u9664\u7684\u7d20\u6750\u4f1a\u5728\u8fd9\u91cc\u4fdd\u7559\u4e00\u6bb5\u65f6\u95f4\u3002" : "\u76f4\u63a5 Ctrl+V \u7c98\u8d34\u56fe\u7247\u3002"}</p>
      </div>
    `;
    return;
  }

  els.assetGrid.innerHTML = assets.map((asset) => `
    <article class="asset-card ${asset.id === state.selectedAssetId ? "selected" : ""}" data-asset="${escapeHtml(asset.id)}" draggable="true">
      <button class="favorite ${asset.favorite ? "on" : ""}" data-favorite="${escapeHtml(asset.id)}" title="\u6536\u85cf">\u2605</button>
      <button class="folder-chip" data-folder-menu="${escapeHtml(asset.id)}" title="\u653e\u5165\u8f6f\u4ef6\u5185\u6587\u4ef6\u5939">\u6587\u4ef6\u5939</button>
      <div class="thumb"><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)}" loading="lazy" /></div>
      <div class="asset-caption">
        <strong>${escapeHtml(asset.name)}</strong>
        <span>${state.view === "trash" ? `\u5220\u9664\u4e8e ${formatDate(asset.deletedAt)}` : `${escapeHtml(asset.width || "-")} \u00d7 ${escapeHtml(asset.height || "-")} \u00b7 ${escapeHtml(asset.ext)}`}</span>
      </div>
    </article>
  `).join("");
}

function renderInternalBoards() {
  state.openBoardIds = state.openBoardIds.filter((boardId) => getBoard(boardId));
  if (state.activeBoardId && !state.openBoardIds.includes(state.activeBoardId)) state.activeBoardId = "";
  els.boardDock.classList.toggle("hidden", state.workspaceMode !== "boards");
  els.boardDock.classList.toggle("board-mode", state.workspaceMode === "boards");
  els.boardDock.classList.toggle("asset-mode", state.workspaceMode === "assets");
  if (state.workspaceMode !== "boards") {
    els.boardTabStrip.innerHTML = "";
    els.boardDesktop.innerHTML = "";
    return;
  }

  els.boardTabStrip.innerHTML = state.openBoardIds.map((boardId) => {
    const board = getBoard(boardId);
    return `
      <button class="board-tab ${boardId === state.activeBoardId ? "active" : ""}" data-board-tab="${escapeHtml(boardId)}" data-detachable-board-tab="${escapeHtml(boardId)}">
        <span>${escapeHtml(board.name)}</span>
        <b data-close-board-tab="${escapeHtml(boardId)}">\u00d7</b>
      </button>
    `;
  }).join("");

  const board = getBoard(state.activeBoardId);
  if (!board) {
    els.boardDesktop.innerHTML = `
      <div class="empty-board-state">
        <h3>\u8fd8\u6ca1\u6709\u6253\u5f00\u7684\u753b\u677f</h3>
        <p>\u70b9\u51fb\u5de6\u4fa7\u753b\u677f\u6253\u5f00\uff0c\u6216\u628a\u72ec\u7acb\u753b\u677f\u62d6\u56de\u8fd9\u91cc\u3002</p>
      </div>
    `;
    return;
  }

  els.boardDesktop.innerHTML = `
    <section class="internal-board-window active" data-internal-board="${escapeHtml(board.id)}">
      <div class="internal-board-area" data-board-area="${escapeHtml(board.id)}">
        <div class="board-canvas" style="transform: translate(${board.viewport.x}px, ${board.viewport.y}px) scale(${board.viewport.scale});">
          ${board.items.map((item) => renderBoardItem(item, board.id)).join("")}
        </div>
      </div>
    </section>
  `;
}
function renderBoardItem(item, boardId) {
  const asset = getAsset(item.assetId);
  if (!asset) return "";
  const selected = state.activeBoardId === boardId && state.selectedInternalBoardItemId === item.id;
  const flipX = item.flipX ? -1 : 1;
  const flipY = item.flipY ? -1 : 1;
  return `
    <div class="board-item ${selected ? "selected" : ""}" data-board-item="${escapeHtml(item.id)}" style="left:${item.x || 0}px; top:${item.y || 0}px; width:${Math.max(60, item.width || 260)}px; transform: rotate(${item.rotation || 0}deg);">
      <div class="board-item-inner" style="transform: scale(${flipX}, ${flipY});">
        <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)}" draggable="false" />
      </div>
      ${selected ? `<button class="rotate-handle" data-board-handle="rotate"></button>
        <button class="resize-handle" data-board-handle="resize"></button>
      ` : ""}
    </div>
  `;
}

function renderInspector() {
  const selectedCardId = els.assetGrid?.querySelector(".asset-card.selected")?.dataset.asset || "";
  const selected = getAsset(state.selectedAssetId) || getAsset(selectedCardId);
  if (!selected) {
    els.assetInfo.innerHTML = `<div class="empty-info">\u9009\u62e9\u4e00\u5f20\u56fe\u7247\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u56fe\u7247\u4fe1\u606f\u3002</div>`;
    return;
  }

  const folders = state.library.folders.filter((folder) => getAssetFolderIds(selected).includes(folder.id));
  const inTrash = state.library.recycleBin.some((item) => item.asset?.id === selected.id);
  els.assetInfo.innerHTML = `
    <div class="info-preview"><img src="${escapeHtml(selected.url)}" alt="${escapeHtml(selected.name)}" /></div>
    <div class="asset-note-panel">
      <label for="assetNote-${escapeHtml(selected.id)}">\u6ce8\u91ca</label>
      <textarea id="assetNote-${escapeHtml(selected.id)}" class="asset-note-input" data-asset-note="${escapeHtml(selected.id)}" placeholder="\u6dfb\u52a0\u6ce8\u91ca">${escapeHtml(getAssetNote(selected.id))}</textarea>
    </div>
    <dl class="info-list">
      <dt>\u6587\u4ef6\u540d</dt><dd>${escapeHtml(selected.name)}</dd>
      <dt>\u5c3a\u5bf8</dt><dd>${escapeHtml(selected.width || "-")} \u00d7 ${escapeHtml(selected.height || "-")}</dd>
      <dt>\u683c\u5f0f</dt><dd>${escapeHtml(selected.ext || "-")}</dd>
      <dt>\u5927\u5c0f</dt><dd>${formatBytes(selected.size || selected.bytes)}</dd>
      <dt>\u5bfc\u5165</dt><dd>${formatDate(selected.importedAt)}</dd>
    </dl>
    <div class="folder-membership">
      <strong>\u6240\u5728\u8f6f\u4ef6\u5185\u6587\u4ef6\u5939</strong>
      ${folders.length ? folders.map((folder) => `<span>${escapeHtml(folder.name)}</span>`).join("") : `<p class="muted">\u672a\u52a0\u5165\u6587\u4ef6\u5939</p>`}
    </div>
    <div class="inspector-actions">
      ${inTrash
        ? `<button data-restore-asset="${escapeHtml(selected.id)}">\u6062\u590d\u56fe\u7247</button><button class="danger" data-purge-asset="${escapeHtml(selected.id)}">\u5f7b\u5e95\u5220\u9664</button>`
        : `<button data-open-viewer="${escapeHtml(selected.id)}">\u9ad8\u6e05\u67e5\u770b</button><button data-locate-asset="${escapeHtml(selected.id)}">\u5b9a\u4f4d\u6587\u4ef6</button><button class="danger" data-delete-asset="${escapeHtml(selected.id)}">\u5220\u9664\u56fe\u7247</button>`}
    </div>
  `;
}

function showFolderPopover(assetId, anchor) {
  const asset = getAsset(assetId);
  if (!asset) return;
  state.folderPopoverAssetId = assetId;
  const rect = anchor.getBoundingClientRect();
  els.folderPopover.innerHTML = `
    <strong>\u653e\u5165\u8f6f\u4ef6\u5185\u6587\u4ef6\u5939</strong>
    ${state.library.folders.length
      ? renderFolderMembershipTree(asset)
      : `<p class="muted">\u8fd8\u6ca1\u6709\u8f6f\u4ef6\u5185\u6587\u4ef6\u5939\u3002\u70b9\u5de6\u4fa7 + \u65b0\u5efa\u3002</p>`}
  `;
  els.folderPopover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 376))}px`;
  els.folderPopover.style.top = `${rect.bottom + 8}px`;
  els.folderPopover.classList.remove("hidden");
}

function hideFolderPopover() {
  state.folderPopoverAssetId = "";
  els.folderPopover.classList.add("hidden");
}

function showFolderContextMenu(folderId, event) {
  const folder = getFolder(folderId);
  if (!folder) return;
  els.folderContextMenu.innerHTML = `
    <button data-new-child-folder="${escapeHtml(folder.id)}">\u65b0\u5efa\u5b50\u6587\u4ef6\u5939</button>
    <button data-rename-folder="${escapeHtml(folder.id)}">\u91cd\u547d\u540d</button>
    <button class="danger" data-delete-folder="${escapeHtml(folder.id)}">\u5220\u9664</button>
  `;
  const x = Math.min(event.clientX, window.innerWidth - 176);
  const y = Math.min(event.clientY, window.innerHeight - 130);
  els.folderContextMenu.style.left = `${Math.max(8, x)}px`;
  els.folderContextMenu.style.top = `${Math.max(8, y)}px`;
  els.folderContextMenu.classList.remove("hidden");
}

function hideFolderContextMenu() {
  els.folderContextMenu.classList.add("hidden");
}

function showBoardContextMenu(boardId, event) {
  const board = getBoard(boardId);
  if (!board) return;
  els.boardContextMenu.innerHTML = `
    <button data-rename-board="${escapeHtml(board.id)}">\u91cd\u547d\u540d</button>
    <button class="danger" data-delete-board="${escapeHtml(board.id)}">\u5220\u9664</button>
  `;
  const x = Math.min(event.clientX, window.innerWidth - 176);
  const y = Math.min(event.clientY, window.innerHeight - 96);
  els.boardContextMenu.style.left = `${Math.max(8, x)}px`;
  els.boardContextMenu.style.top = `${Math.max(8, y)}px`;
  els.boardContextMenu.classList.remove("hidden");
}

function hideBoardContextMenu() {
  els.boardContextMenu.classList.add("hidden");
}

async function createFolder(parentId = "") {
  const parent = parentId ? getFolder(parentId) : null;
  const next = await api.createFolder(parent ? `${parent.name} \u5b50\u6587\u4ef6\u5939` : `\u6587\u4ef6\u5939 ${state.library.folders.length + 1}`, parentId);
  setLibrary(next);
  state.workspaceMode = "assets";
  state.activeBoardId = "";
  state.selectedInternalBoardItemId = "";
  state.currentFolderId = next.folders[0]?.id || "";
  state.view = "all";
  render();
}

async function createBoard() {
  const next = await api.createBoard(`\u753b\u677f ${state.library.boards.length + 1}`);
  setLibrary(next);
  const boardId = next.boards[0]?.id;
  if (boardId) ensureInternalBoardWindow(boardId);
  render();
}
function openViewer(assetId) {
  const asset = getAsset(assetId);
  if (!asset) return;
  state.viewerAssetId = assetId;
  state.viewerZoom = 1;
  state.viewerPan = { x: 0, y: 0 };
  els.viewer.classList.remove("hidden");
  els.viewerImage.src = asset.url;
  els.viewerImage.alt = asset.name;
  els.viewerImage.onload = () => {
    fitViewer();
    resizeCanvas();
    drawAnnotations();
  };
  renderViewerChrome();
}

function closeViewer() {
  els.viewer.classList.add("hidden");
  state.viewerAssetId = "";
}

function renderViewerChrome() {
  const asset = getAsset(state.viewerAssetId);
  if (!asset) return;
  const viewerNoteInput = document.querySelector("#viewerNoteInput");
  if (viewerNoteInput) {
    viewerNoteInput.dataset.assetNote = asset.id;
    viewerNoteInput.value = getAssetNote(asset.id);
  }
  els.viewerMeta.innerHTML = `
    <strong>${escapeHtml(asset.name)}</strong>
    <span>${escapeHtml(asset.width || "-")} \u00d7 ${escapeHtml(asset.height || "-")} \u00b7 ${formatBytes(asset.bytes)}</span>
  `;
  els.toggleAnnotationsBtn.textContent = state.annotationsVisible ? "\u9690\u85cf\u6279\u6ce8" : "\u663e\u793a\u6279\u6ce8";
  els.filmstrip.innerHTML = getAssetsForView().map((item) => `
    <button class="${item.id === asset.id ? "active" : ""}" data-film="${escapeHtml(item.id)}">
      <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}" />
    </button>
  `).join("");
}
function resizeCanvas() {
  const asset = getAsset(state.viewerAssetId);
  if (!asset) return;
  els.annotationCanvas.width = asset.width || els.viewerImage.naturalWidth;
  els.annotationCanvas.height = asset.height || els.viewerImage.naturalHeight;
}

function applyViewerTransform() {
  els.imagePlane.style.transform = `translate(${state.viewerPan.x}px, ${state.viewerPan.y}px) scale(${state.viewerZoom})`;
}

function fitViewer() {
  const asset = getAsset(state.viewerAssetId);
  if (!asset) return;
  const body = document.querySelector(".viewer-body");
  const panelWidth = document.querySelector(".annotation-tools")?.offsetWidth || 300;
  const availableWidth = Math.max(1, body.clientWidth - panelWidth - 48);
  const availableHeight = Math.max(1, body.clientHeight - 48);
  const naturalWidth = asset.width || els.viewerImage.naturalWidth || 1;
  const naturalHeight = asset.height || els.viewerImage.naturalHeight || 1;
  state.viewerZoom = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1);
  state.viewerPan = {
    x: Math.round((availableWidth - naturalWidth * state.viewerZoom) / 2 + 24),
    y: Math.round((availableHeight - naturalHeight * state.viewerZoom) / 2 + 24)
  };
  els.imagePlane.style.width = `${naturalWidth}px`;
  els.imagePlane.style.height = `${naturalHeight}px`;
  applyViewerTransform();
}

function actualViewer() {
  const body = document.querySelector(".viewer-body");
  const panelWidth = document.querySelector(".annotation-tools")?.offsetWidth || 300;
  const stageWidth = Math.max(1, body.clientWidth - panelWidth);
  const stageHeight = Math.max(1, body.clientHeight);
  const naturalWidth = els.viewerImage.naturalWidth || getAsset(state.viewerAssetId)?.width || 1;
  const naturalHeight = els.viewerImage.naturalHeight || getAsset(state.viewerAssetId)?.height || 1;
  state.viewerZoom = 1;
  state.viewerPan = {
    x: Math.round((stageWidth - naturalWidth) / 2),
    y: Math.round((stageHeight - naturalHeight) / 2)
  };
  applyViewerTransform();
}

function viewerPoint(event) {
  const rect = els.imagePlane.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / state.viewerZoom,
    y: (event.clientY - rect.top) / state.viewerZoom
  };
}

function getAnnotations() {
  return state.library.annotations[state.viewerAssetId] || [];
}

async function persistAnnotations(annotations) {
  setLibrary(await api.saveAnnotations(state.viewerAssetId, annotations));
  drawAnnotations();
}

async function undoAnnotation() {
  if (!state.viewerAssetId) return;
  state.draftShape = null;
  state.drawing = false;
  await persistAnnotations(getAnnotations().slice(0, -1));
}

function drawAnnotations() {
  const ctx = els.annotationCanvas.getContext("2d");
  ctx.clearRect(0, 0, els.annotationCanvas.width, els.annotationCanvas.height);
  if (!state.annotationsVisible) return;
  [...getAnnotations(), state.draftShape].filter(Boolean).forEach((shape) => drawShape(ctx, shape));
}

function drawShape(ctx, shape) {
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = shape.stroke;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (shape.type === "pen") {
    ctx.beginPath();
    shape.points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.stroke();
  }
  if (shape.type === "rect") ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
  if (shape.type === "arrow") {
    ctx.beginPath();
    ctx.moveTo(shape.x, shape.y);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
    const angle = Math.atan2(shape.y2 - shape.y, shape.x2 - shape.x);
    const head = 18;
    ctx.beginPath();
    ctx.moveTo(shape.x2, shape.y2);
    ctx.lineTo(shape.x2 - head * Math.cos(angle - Math.PI / 6), shape.y2 - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(shape.x2 - head * Math.cos(angle + Math.PI / 6), shape.y2 - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }
  if (shape.type === "text") {
    ctx.font = `${Math.max(18, shape.stroke * 5)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(shape.text, shape.x, shape.y);
  }
  ctx.restore();
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll(".tool").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
}

async function finishShape() {
  if (!state.draftShape) return;
  await persistAnnotations([...getAnnotations(), state.draftShape]);
  state.draftShape = null;
}

function goViewer(direction) {
  const assets = getAssetsForView();
  const index = assets.findIndex((asset) => asset.id === state.viewerAssetId);
  const next = assets[index + direction];
  if (next) openViewer(next.id);
}

function rememberInternalBoard(board) {
  state.internalBoardUndoStack.push(clone(board));
  if (state.internalBoardUndoStack.length > 30) state.internalBoardUndoStack.shift();
}

async function addAssetToInternalBoard(boardId, assetId, point) {
  const board = getBoard(boardId);
  const asset = getAsset(assetId);
  if (!board || !asset) return;
  rememberInternalBoard(board);
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
  state.activeBoardId = boardId;
  state.selectedInternalBoardItemId = item.id;
  await saveBoard(board);
}

async function importFilesToInternalBoard(boardId, files, point) {
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
    await addAssetToInternalBoard(boardId, added[index].id, { x: point.x + index * 28, y: point.y + index * 28 });
  }
}

async function updateSelectedInternalBoardItem(updater) {
  const board = getBoard(state.activeBoardId);
  const item = board?.items.find((entry) => entry.id === state.selectedInternalBoardItemId);
  if (!board || !item) return;
  rememberInternalBoard(board);
  updater(item);
  await saveBoard(board);
}

async function deleteSelectedInternalBoardItem() {
  const board = getBoard(state.activeBoardId);
  if (!board || !state.selectedInternalBoardItemId) return;
  rememberInternalBoard(board);
  board.items = board.items.filter((item) => item.id !== state.selectedInternalBoardItemId);
  state.selectedInternalBoardItemId = "";
  await saveBoard(board);
}

async function copySelectedInternalBoardItem() {
  const board = getBoard(state.activeBoardId);
  const item = board?.items.find((entry) => entry.id === state.selectedInternalBoardItemId);
  if (!item) return;
  state.internalBoardClipboard = clone(item);
  const result = await api.writeAssetToClipboard?.(item.assetId);
  state.internalBoardClipboardHash = result?.hash || "";
}

async function pasteInternalBoardItem() {
  const board = getBoard(state.activeBoardId);
  if (!board || !state.internalBoardClipboard) return;
  rememberInternalBoard(board);
  const item = {
    ...clone(state.internalBoardClipboard),
    id: window.crypto.randomUUID(),
    x: state.internalBoardClipboard.x + 28,
    y: state.internalBoardClipboard.y + 28
  };
  board.items.push(item);
  state.internalBoardClipboard = clone(item);
  const result = await api.writeAssetToClipboard?.(item.assetId);
  state.internalBoardClipboardHash = result?.hash || state.internalBoardClipboardHash;
  state.selectedInternalBoardItemId = item.id;
  await saveBoard(board);
}

async function pasteExternalClipboardToInternalBoard(boardId) {
  const board = getBoard(boardId);
  if (!board) return false;
  const entries = await readClipboardImageFiles();
  if (!entries.length) return false;
  const currentHash = entries[0]?.hash || "";
  if (state.internalBoardClipboard && currentHash && currentHash === state.internalBoardClipboardHash) return false;
  state.internalBoardClipboard = null;
  state.internalBoardClipboardHash = "";
  await importFilesToInternalBoard(board.id, entries.map((entry) => entry.file), getInternalBoardPastePoint(board));
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

function clearPendingInternalBoardPaste() {
  if (!state.pendingInternalBoardPasteTimer) return;
  window.clearTimeout(state.pendingInternalBoardPasteTimer);
  state.pendingInternalBoardPasteTimer = 0;
}

function scheduleInternalBoardPasteFallback() {
  clearPendingInternalBoardPaste();
  state.pendingInternalBoardPasteTimer = window.setTimeout(async () => {
    state.pendingInternalBoardPasteTimer = 0;
    await pasteInternalBoardItem();
  }, 400);
}

async function pasteFilesToCurrentSurface(files) {
  if (!files.length) return false;
  const board = getBoard(state.activeBoardId);
  if (board && state.workspaceMode === "boards" && state.openBoardIds.includes(board.id)) {
    clearPendingInternalBoardPaste();
    state.internalBoardClipboard = null;
    state.internalBoardClipboardHash = "";
    await importFilesToInternalBoard(board.id, files, getInternalBoardPastePoint(board));
    return true;
  }
  await importBrowserFiles(files, "粘贴图片");
  return true;
}

async function pasteSystemClipboardToAssets() {
  const entries = await readClipboardImageFiles();
  if (!entries.length) return false;
  await importBrowserFiles(entries.map((entry) => entry.file), "粘贴图片");
  return true;
}

async function undoInternalBoard() {
  const previous = state.internalBoardUndoStack.pop();
  if (!previous) return;
  state.selectedInternalBoardItemId = "";
  await saveBoard(previous);
}

els.openImportBtn.addEventListener("click", () => api.openImportFolder());
els.importBtn.addEventListener("click", async () => {
  await api.importImages();
  setLibrary(await api.getLibrary());
});
els.newFolderBtn.addEventListener("click", () => createFolder(""));
els.newBoardBtn.addEventListener("click", createBoard);
els.searchInput.addEventListener("input", render);
els.sortSelect.addEventListener("change", render);
els.closeViewerBtn.addEventListener("click", closeViewer);
els.fitBtn.addEventListener("click", fitViewer);
els.actualBtn.addEventListener("click", actualViewer);
els.prevBtn.addEventListener("click", () => goViewer(-1));
els.nextBtn.addEventListener("click", () => goViewer(1));
els.toggleAnnotationsBtn.addEventListener("click", () => {
  state.annotationsVisible = !state.annotationsVisible;
  renderViewerChrome();
  drawAnnotations();
});
els.undoBtn.addEventListener("click", undoAnnotation);
els.clearBtn.addEventListener("click", async () => {
  if (confirm("\u6e05\u9664\u5f53\u524d\u56fe\u7247\u7684\u5168\u90e8\u6279\u6ce8\uff1f")) await persistAnnotations([]);
});
document.addEventListener("paste", async (event) => {
  if (event.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
  if (state.suppressNextPasteEvent) {
    state.suppressNextPasteEvent = false;
    event.preventDefault();
    return;
  }
  let pastedFiles = getPasteEventFiles(event);
  let clipboardEntries = [];
  if (!pastedFiles.length) {
    if (!clipboardEntries.length) clipboardEntries = await readClipboardImageFiles();
    if (state.pendingInternalBoardPasteTimer && state.internalBoardClipboard) {
      const currentHash = clipboardEntries[0]?.hash || "";
      if (currentHash && currentHash === state.internalBoardClipboardHash) {
        event.preventDefault();
        return;
      }
    }
    pastedFiles = clipboardEntries.map((entry) => entry.file);
  }
  if (!pastedFiles.length) return;
  event.preventDefault();
  await pasteFilesToCurrentSurface(pastedFiles);
});

document.addEventListener("dragover", (event) => {
  if (state.boardTabDrag || event.target.closest("[data-detachable-board-tab]")) return;
  if (event.target.closest("[data-board-area]")) return;
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "none";
});

document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) document.body.classList.remove("drag-active");
});

document.addEventListener("drop", async (event) => {
  if (state.boardTabDrag || event.target.closest("[data-detachable-board-tab]")) return;
  if (event.target.closest("[data-board-area]")) return;
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  document.body.classList.remove("drag-active");
});

document.addEventListener("change", async (event) => {
  const themeSelect = event.target.closest("[data-setting-theme]");
  if (themeSelect) {
    appSettings.theme = themeSelect.value;
    saveAppSettings();
    return;
  }

  const recycleDays = event.target.closest("[data-recycle-days]");
  if (recycleDays) {
    const next = await api.setRecycleRetention(recycleDays.value);
    setLibrary(next);
    renderSettingsPanel();
    return;
  }

  const noteInput = event.target.closest("[data-asset-note]");
  if (noteInput) {
    const next = await api.setAssetNote(noteInput.dataset.assetNote, noteInput.value);
    setLibrary(next);
    if (state.viewerAssetId) renderViewerChrome();
    return;
  }

  const membership = event.target.closest("[data-folder-membership]");
  if (!membership) return;
  setLibrary(await api.setFolderMembership(
    membership.dataset.folderMembership,
    membership.dataset.folderId,
    membership.checked
  ));
  if (state.folderPopoverAssetId) {
    const anchor = [...document.querySelectorAll("[data-folder-menu]")]
      .find((item) => item.dataset.folderMenu === state.folderPopoverAssetId);
    if (anchor) showFolderPopover(state.folderPopoverAssetId, anchor);
  }
});

document.addEventListener("dragstart", (event) => {
  const assetEl = event.target.closest("[data-asset]");
  if (!assetEl) return;
  event.dataTransfer.setData("text/asset-id", assetEl.dataset.asset);
  event.dataTransfer.effectAllowed = "copy";
});

document.addEventListener("dragover", (event) => {
  const area = event.target.closest("[data-board-area]");
  if (!area) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

document.addEventListener("drop", async (event) => {
  const area = event.target.closest("[data-board-area]");
  if (!area) return;
  const board = getBoard(area.dataset.boardArea);
  if (!board) return;
  event.preventDefault();
  event.stopPropagation();
  document.body.classList.remove("drag-active");
  const point = boardPointFromEvent(event, board);
  const assetId = event.dataTransfer.getData("text/asset-id");
  if (assetId) await addAssetToInternalBoard(board.id, assetId, point);
  else await importFilesToInternalBoard(board.id, event.dataTransfer?.files || [], point);
});

document.addEventListener("contextmenu", (event) => {
  const folderLink = event.target.closest("[data-folder]");
  const boardLink = event.target.closest("[data-board]");
  if (folderLink) {
    event.preventDefault();
    hideBoardContextMenu();
    showFolderContextMenu(folderLink.dataset.folder, event);
    return;
  }
  if (boardLink) {
    event.preventDefault();
    hideFolderContextMenu();
    showBoardContextMenu(boardLink.dataset.board, event);
    return;
  }
  hideFolderContextMenu();
  hideBoardContextMenu();
});

document.addEventListener("dblclick", (event) => {
  const folderName = event.target.closest("[data-folder] .folder-name");
  if (folderName) {
    const folderLink = folderName.closest("[data-folder]");
    event.preventDefault();
    event.stopPropagation();
    state.renamingFolderId = folderLink.dataset.folder;
    renderNavigation();
    focusFolderRenameInput(state.renamingFolderId);
    return;
  }

  const boardName = event.target.closest("[data-board] span");
  if (boardName) {
    const boardLink = boardName.closest("[data-board]");
    event.preventDefault();
    event.stopPropagation();
    state.renamingBoardId = boardLink.dataset.board;
    renderNavigation();
    focusBoardRenameInput(state.renamingBoardId);
  }
});

document.addEventListener("click", async (event) => {
  if (event.target.closest(".brand-mark")) {
    renderSettingsPanel();
    return;
  }

  if (event.target.closest("[data-close-settings]") || event.target.id === "settingsOverlay") {
    closeSettingsPanel();
    return;
  }

  if (event.target.closest("[data-choose-library-path]")) {
    const next = await api.chooseLibraryPath();
    setLibrary(next);
    renderSettingsPanel();
    return;
  }

  if (!event.target.closest(".folder-popover") && !event.target.closest("[data-folder-menu]")) hideFolderPopover();
  if (!event.target.closest(".folder-context-menu")) hideFolderContextMenu();
  if (!event.target.closest(".board-context-menu")) hideBoardContextMenu();

  const boardTab = event.target.closest("[data-board-tab]");
  if (boardTab && !event.target.closest("[data-close-board-tab]")) {
    if (state.suppressBoardTabClick) {
      state.suppressBoardTabClick = false;
      return;
    }
    state.activeBoardId = boardTab.dataset.boardTab;
    state.selectedInternalBoardItemId = "";
    render();
    return;
  }

  const closeBoardTab = event.target.closest("[data-close-board-tab]");
  if (closeBoardTab) {
    const boardId = closeBoardTab.dataset.closeBoardTab;
    state.openBoardIds = state.openBoardIds.filter((id) => id !== boardId);
    if (state.activeBoardId === boardId) state.activeBoardId = state.openBoardIds.at(-1) || "";
    state.workspaceMode = "boards";
    render();
    return;
  }

  const detachBoard = event.target.closest("[data-detach-board]");
  if (detachBoard) {
    await detachBoardToFloating(detachBoard.dataset.detachBoard);
    return;
  }

  const boardAction = event.target.closest("[data-board-action]");
  if (boardAction) {
    const action = boardAction.dataset.boardAction;
    if (action === "mirror-x") await updateSelectedInternalBoardItem((item) => { item.flipX = !item.flipX; });
    if (action === "mirror-y") await updateSelectedInternalBoardItem((item) => { item.flipY = !item.flipY; });
    if (action === "copy") await copySelectedInternalBoardItem();
    if (action === "delete") await deleteSelectedInternalBoardItem();
    return;
  }

  const nav = event.target.closest(".nav-item");
  if (nav) {
    state.workspaceMode = "assets";
    state.activeBoardId = "";
    state.selectedInternalBoardItemId = "";
    state.view = nav.dataset.view;
    state.currentFolderId = "";
    render();
  }

  const renameFolderButton = event.target.closest("[data-rename-folder]");
  if (renameFolderButton) {
    hideFolderContextMenu();
    state.renamingFolderId = renameFolderButton.dataset.renameFolder;
    renderNavigation();
    focusFolderRenameInput(state.renamingFolderId);
    return;
  }

  const newChildFolderButton = event.target.closest("[data-new-child-folder]");
  if (newChildFolderButton) {
    hideFolderContextMenu();
    await createFolder(newChildFolderButton.dataset.newChildFolder);
    return;
  }

  const deleteFolderButton = event.target.closest("[data-delete-folder]");
  if (deleteFolderButton) {
    hideFolderContextMenu();
    const folderId = deleteFolderButton.dataset.deleteFolder;
    const folder = getFolder(folderId);
    if (!folder) return;
    const descendantIds = getFolderDescendantIds(folderId);
    const confirmed = confirm(`\u786e\u5b9a\u5220\u9664\u8fd9\u4e2a\u8f6f\u4ef6\u5185\u6587\u4ef6\u5939\u5417\uff1f\n\n${folder.name}\n\n\u5b50\u6587\u4ef6\u5939\u4e5f\u4f1a\u4e00\u8d77\u5220\u9664\u3002\u56fe\u7247\u4e0d\u4f1a\u88ab\u5220\u9664\uff0c\u53ea\u4f1a\u79fb\u51fa\u8fd9\u4e9b\u5206\u7c7b\u3002`);
    if (!confirmed) return;
    setLibrary(await api.deleteFolder(folderId));
    if (descendantIds.includes(state.currentFolderId)) state.currentFolderId = "";
    state.workspaceMode = "assets";
    render();
    return;
  }
  const saveFolderButton = event.target.closest("[data-save-folder]");
  if (saveFolderButton) {
    const folderId = saveFolderButton.dataset.saveFolder;
    const input = document.querySelector(`[data-folder-name-input="${folderId}"]`);
    const nextName = input?.value?.trim();
    if (!nextName) return;
    const next = await api.renameFolder(folderId, nextName);
    state.renamingFolderId = "";
    setLibrary(next);
    state.currentFolderId = folderId;
    render();
    return;
  }

  const cancelFolderRename = event.target.closest("[data-cancel-folder-rename]");
  if (cancelFolderRename) {
    state.renamingFolderId = "";
    renderNavigation();
    return;
  }

  const renameBoardButton = event.target.closest("[data-rename-board]");
  if (renameBoardButton) {
    hideBoardContextMenu();
    state.renamingBoardId = renameBoardButton.dataset.renameBoard;
    renderNavigation();
    focusBoardRenameInput(state.renamingBoardId);
    return;
  }

  const deleteBoardButton = event.target.closest("[data-delete-board]");
  if (deleteBoardButton) {
    hideBoardContextMenu();
    const boardId = deleteBoardButton.dataset.deleteBoard;
    const board = getBoard(boardId);
    if (!board) return;
    const confirmed = confirm(`\u786e\u5b9a\u5220\u9664\u8fd9\u4e2a\u753b\u677f\u5417\uff1f\n\n${board.name}\n\n\u753b\u677f\u91cc\u7684\u6446\u653e\u4f1a\u88ab\u5220\u9664\uff0c\u7d20\u6750\u5e93\u56fe\u7247\u4e0d\u4f1a\u88ab\u5220\u9664\u3002`);
    if (!confirmed) return;
    setLibrary(await api.deleteBoard(boardId));
    state.openBoardIds = state.openBoardIds.filter((id) => id !== boardId);
    if (state.activeBoardId === boardId) state.activeBoardId = state.openBoardIds.at(-1) || "";
    state.selectedInternalBoardItemId = "";
    state.workspaceMode = "boards";
    render();
    return;
  }
  const saveBoardButton = event.target.closest("[data-save-board]");
  if (saveBoardButton) {
    const boardId = saveBoardButton.dataset.saveBoard;
    const input = document.querySelector(`[data-board-name-input="${boardId}"]`);
    const nextName = input?.value?.trim();
    if (!nextName) return;
    const next = await api.renameBoard(boardId, nextName);
    state.renamingBoardId = "";
    setLibrary(next);
    ensureInternalBoardWindow(boardId);
    return;
  }

  const cancelBoardRename = event.target.closest("[data-cancel-board-rename]");
  if (cancelBoardRename) {
    state.renamingBoardId = "";
    renderNavigation();
    return;
  }

  const folderLink = event.target.closest("[data-folder]");
  if (folderLink && !event.target.closest("[data-rename-folder]") && !event.target.closest("[data-delete-folder]") && !event.target.closest("[data-new-child-folder]")) {
    state.workspaceMode = "assets";
    state.activeBoardId = "";
    state.selectedInternalBoardItemId = "";
    state.currentFolderId = folderLink.dataset.folder;
    state.view = "all";
    render();
  }

  const boardLink = event.target.closest("[data-board]");
  if (boardLink && !event.target.closest("[data-rename-board]") && !event.target.closest("[data-delete-board]")) {
    ensureInternalBoardWindow(boardLink.dataset.board);
    return;
  }

  const card = event.target.closest("[data-asset]");
  if (card && !event.target.closest("[data-favorite]") && !event.target.closest("[data-folder-menu]")) {
    state.selectedAssetId = card.dataset.asset;
    if (event.detail === 2) openViewer(card.dataset.asset);
    render();
    return;
  }

  const favorite = event.target.closest("[data-favorite]");
  if (favorite) setLibrary(await api.toggleFavorite(favorite.dataset.favorite));

  const folderMenu = event.target.closest("[data-folder-menu]");
  if (folderMenu) {
    showFolderPopover(folderMenu.dataset.folderMenu, folderMenu);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-asset]");
  if (deleteButton) {
    const asset = getAsset(deleteButton.dataset.deleteAsset);
    if (!asset) return;
    const confirmed = confirm(`\u786e\u5b9a\u5220\u9664\u8fd9\u5f20\u56fe\u7247\u5417\uff1f\n\n${asset.name}\n\n\u56fe\u7247\u4f1a\u8fdb\u5165\u56de\u6536\u7ad9\u3002`);
    if (!confirmed) return;
    const deletedId = asset.id;
    setLibrary(await api.deleteAsset(deletedId));
    if (state.selectedAssetId === deletedId) state.selectedAssetId = "";
    if (state.viewerAssetId === deletedId) closeViewer();
    render();
    return;
  }
  const restoreButton = event.target.closest("[data-restore-asset]");
  if (restoreButton) {
    const restoredId = restoreButton.dataset.restoreAsset;
    setLibrary(await api.restoreAsset(restoredId));
    state.selectedAssetId = restoredId;
    state.view = "all";
    render();
    return;
  }

  const purgeButton = event.target.closest("[data-purge-asset]");
  if (purgeButton) {
    const asset = getAsset(purgeButton.dataset.purgeAsset);
    if (!asset) return;
    const confirmed = confirm(`\u786e\u5b9a\u5f7b\u5e95\u5220\u9664\u8fd9\u5f20\u56fe\u7247\u5417\uff1f\n\n${asset.name}\n\n\u8fd9\u4e00\u6b65\u4e0d\u80fd\u64a4\u9500\u3002`);
    if (!confirmed) return;
    setLibrary(await api.purgeRecycledAsset(asset.id));
    state.selectedAssetId = "";
    render();
    return;
  }
  const open = event.target.closest("[data-open-viewer]");
  if (open) openViewer(open.dataset.openViewer);

  const reveal = event.target.closest("[data-reveal]");
  if (reveal) api.revealFile(reveal.dataset.reveal);

  const film = event.target.closest("[data-film]");
  if (film) openViewer(film.dataset.film);

  const tool = event.target.closest("[data-tool]");
  if (tool) setTool(tool.dataset.tool);
});

document.addEventListener("wheel", async (event) => {
  const area = event.target.closest?.("[data-board-area]");
  if (!area) return;
  const board = getBoard(area.dataset.boardArea);
  if (!board) return;
  event.preventDefault();
  zoomBoardAtPoint(board, area, event.clientX, event.clientY, event.deltaY);
  renderInternalBoards();
  await api.saveBoard(board);
}, { passive: false });

document.addEventListener("pointerdown", (event) => {
  const draggableTab = event.target.closest("[data-detachable-board-tab]");
  if (draggableTab && event.button === 0 && !event.target.closest("[data-close-board-tab]")) {
    state.boardTabDrag = {
      boardId: draggableTab.dataset.detachableBoardTab,
      startX: event.clientX,
      startY: event.clientY,
      rect: els.boardTabStrip.getBoundingClientRect()
    };
    state.activeBoardId = draggableTab.dataset.detachableBoardTab;
    render();
    return;
  }

  const titlebar = event.target.closest("[data-board-window-title]");
  if (titlebar && event.button === 0 && !event.target.closest("button")) {
    const boardId = titlebar.dataset.boardWindowTitle;
    const win = state.internalBoardWindows[boardId];
    state.activeBoardId = boardId;
    state.internalBoardInteraction = {
      type: "window",
      boardId,
      startX: event.clientX,
      startY: event.clientY,
      originX: win.x,
      originY: win.y
    };
    renderInternalBoards();
    return;
  }

  const area = event.target.closest("[data-board-area]");
  if (!area) return;
  const board = getBoard(area.dataset.boardArea);
  if (!board) return;
  const itemEl = event.target.closest("[data-board-item]");
  const handle = event.target.closest("[data-board-handle]");
  state.activeBoardId = board.id;

  if (event.button === 1) {
    event.preventDefault();
    state.selectedInternalBoardItemId = "";
    state.internalBoardPanning = true;
    state.internalBoardPanStart = { x: event.clientX - board.viewport.x, y: event.clientY - board.viewport.y };
    renderInternalBoards();
    return;
  }

  if (itemEl && event.button === 0) {
    const item = board.items.find((entry) => entry.id === itemEl.dataset.boardItem);
    state.selectedInternalBoardItemId = item.id;
    rememberInternalBoard(board);
    renderInternalBoards();
    if (handle?.dataset.boardHandle === "resize") {
      state.internalBoardInteraction = { type: "resize", boardId: board.id, item, startX: event.clientX, originWidth: item.width || 260 };
      return;
    }
    if (handle?.dataset.boardHandle === "rotate") {
      const rect = itemEl.getBoundingClientRect();
      state.internalBoardInteraction = { type: "rotate", boardId: board.id, item, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 };
      return;
    }
    state.internalBoardInteraction = {
      type: "move",
      boardId: board.id,
      item,
      startX: event.clientX,
      startY: event.clientY,
      originX: item.x,
      originY: item.y
    };
    return;
  }

  if (event.button === 0) {
    state.selectedInternalBoardItemId = "";
    renderInternalBoards();
  }
});

window.addEventListener("pointermove", (event) => {
  if (state.boardTabDrag) {
    const drag = state.boardTabDrag;
    const distanceY = Math.abs(event.clientY - drag.startY);
    const outsideStrip = event.clientY > drag.rect.bottom + 20
      || event.clientY < drag.rect.top - 20
      || event.clientX < drag.rect.left - 48
      || event.clientX > drag.rect.right + 48;
    if (distanceY > 34 || outsideStrip) {
      state.boardTabDrag = null;
      state.suppressBoardTabClick = true;
      document.body.classList.remove("drag-active");
      detachBoardToFloating(drag.boardId);
    }
    return;
  }

  const op = state.internalBoardInteraction;
  if (op) {
    if (op.type === "window") {
      const win = state.internalBoardWindows[op.boardId];
      win.x = op.originX + event.clientX - op.startX;
      win.y = op.originY + event.clientY - op.startY;
      renderInternalBoards();
      return;
    }
    const board = getBoard(op.boardId);
    if (!board) return;
    if (op.type === "move") {
      const next = snapBoardItem(
        board,
        op.item,
        op.originX + (event.clientX - op.startX) / board.viewport.scale,
        op.originY + (event.clientY - op.startY) / board.viewport.scale
      );
      op.item.x = next.x;
      op.item.y = next.y;
    }
    if (op.type === "resize") {
      op.item.width = Math.max(60, Math.round(op.originWidth + (event.clientX - op.startX) / board.viewport.scale));
    }
    if (op.type === "rotate") {
      op.item.rotation = Math.round(Math.atan2(event.clientY - op.centerY, event.clientX - op.centerX) * 180 / Math.PI + 90);
    }
    renderInternalBoards();
    return;
  }

  if (state.internalBoardPanning) {
    const board = getBoard(state.activeBoardId);
    if (!board) return;
    board.viewport.x = event.clientX - state.internalBoardPanStart.x;
    board.viewport.y = event.clientY - state.internalBoardPanStart.y;
    renderInternalBoards();
  }
});

window.addEventListener("pointerup", async () => {
  const op = state.internalBoardInteraction;
  const board = getBoard(state.activeBoardId);
  if (op && op.type !== "window") await saveBoard(getBoard(op.boardId));
  if (state.internalBoardPanning && board) await saveBoard(board);
  state.boardTabDrag = null;
  state.internalBoardInteraction = null;
  state.internalBoardPanning = false;
});

els.viewer.addEventListener("wheel", (event) => {
  if (!state.viewerAssetId) return;
  event.preventDefault();
  state.viewerZoom = Math.min(6, Math.max(0.08, state.viewerZoom * (event.deltaY > 0 ? 0.9 : 1.1)));
  applyViewerTransform();
}, { passive: false });

els.imagePlane.addEventListener("pointerdown", async (event) => {
  if (!state.viewerAssetId) return;
  if (event.button === 1 || event.altKey || event.target === els.viewerImage) {
    state.viewerDragging = true;
    state.viewerDragStart = { x: event.clientX - state.viewerPan.x, y: event.clientY - state.viewerPan.y };
    return;
  }
  return;
  const point = viewerPoint(event);
  if (state.tool === "text") {
    const text = prompt("\u6279\u6ce8\u6587\u5b57");
    const nextText = String(text || "").trim();
    if (nextText) {
      await persistAnnotations([...getAnnotations(), {
        id: window.crypto.randomUUID(),
        type: "text",
        color: els.colorInput.value,
        stroke: Number(els.strokeInput.value),
        x: point.x,
        y: point.y,
        text: nextText
      }]);
    }
    state.draftShape = null;
    state.drawing = false;
    return;
  }
  state.drawing = true;
  const base = {
    id: window.crypto.randomUUID(),
    type: state.tool,
    color: els.colorInput.value,
    stroke: Number(els.strokeInput.value)
  };
  if (state.tool === "pen") state.draftShape = { ...base, points: [point] };
  if (state.tool === "rect") state.draftShape = { ...base, x: point.x, y: point.y, w: 0, h: 0 };
  if (state.tool === "arrow") state.draftShape = { ...base, x: point.x, y: point.y, x2: point.x, y2: point.y };
  if (state.tool === "text") {
    const text = prompt("\u6279\u6ce8\u6587\u5b57");
    if (text) {
      state.draftShape = { ...base, x: point.x, y: point.y, text };
      await finishShape();
    }
    state.drawing = false;
  }
});

window.addEventListener("pointermove", (event) => {
  if (state.viewerDragging) {
    state.viewerPan = { x: event.clientX - state.viewerDragStart.x, y: event.clientY - state.viewerDragStart.y };
    applyViewerTransform();
    return;
  }
  if (!state.drawing || !state.draftShape) return;
  const point = viewerPoint(event);
  if (state.draftShape.type === "pen") state.draftShape.points.push(point);
  if (state.draftShape.type === "rect") {
    state.draftShape.w = point.x - state.draftShape.x;
    state.draftShape.h = point.y - state.draftShape.y;
  }
  if (state.draftShape.type === "arrow") {
    state.draftShape.x2 = point.x;
    state.draftShape.y2 = point.y;
  }
  drawAnnotations();
});

window.addEventListener("pointerup", async () => {
  state.viewerDragging = false;
  if (state.drawing) await finishShape();
  state.drawing = false;
});

window.addEventListener("keydown", async (event) => {
  const shortcutInput = event.target.closest?.("[data-shortcut]");
  if (shortcutInput) {
    event.preventDefault();
    const nextShortcut = shortcutFromEvent(event);
    if (!nextShortcut) return;
    appSettings.shortcuts[shortcutInput.dataset.shortcut] = nextShortcut;
    shortcutInput.value = nextShortcut;
    saveAppSettings();
    return;
  }

  if (event.target.closest?.(".settings-panel")) return;

  const renameInput = event.target.closest?.("[data-folder-name-input]");
  if (renameInput) {
    if (event.key === "Enter") {
      const folderId = renameInput.dataset.folderNameInput;
      const nextName = renameInput.value.trim();
      if (nextName) {
        const next = await api.renameFolder(folderId, nextName);
        state.renamingFolderId = "";
        setLibrary(next);
        state.currentFolderId = folderId;
        render();
      }
    }
    if (event.key === "Escape") {
      state.renamingFolderId = "";
      renderNavigation();
    }
    return;
  }

  const boardRenameInput = event.target.closest?.("[data-board-name-input]");
  if (boardRenameInput) {
    if (event.key === "Enter") {
      const boardId = boardRenameInput.dataset.boardNameInput;
      const nextName = boardRenameInput.value.trim();
      if (nextName) {
        const next = await api.renameBoard(boardId, nextName);
        state.renamingBoardId = "";
        setLibrary(next);
        ensureInternalBoardWindow(boardId);
      }
    }
    if (event.key === "Escape") {
      state.renamingBoardId = "";
      renderNavigation();
    }
    return;
  }

  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (typing) return;

  if (state.viewerAssetId) {
    if (matchesShortcut(event, "undo")) {
      event.preventDefault();
      await undoAnnotation();
      return;
    }
    if (event.key === "Escape") closeViewer();
    if (event.key === "ArrowLeft") goViewer(-1);
    if (event.key === "ArrowRight") goViewer(1);
    return;
  }

  if (state.activeBoardId && state.openBoardIds.includes(state.activeBoardId)) {
    if (matchesShortcut(event, "undo")) {
      event.preventDefault();
      await undoInternalBoard();
      return;
    }
    if (matchesShortcut(event, "copy")) {
      if (state.selectedInternalBoardItemId) {
        event.preventDefault();
        await copySelectedInternalBoardItem();
      }
      return;
    }
    if (matchesShortcut(event, "paste") && state.internalBoardClipboard) {
      scheduleInternalBoardPasteFallback();
      return;
    }
    if (matchesShortcut(event, "paste")) {
      return;
    }
    if (matchesShortcut(event, "delete") && state.selectedInternalBoardItemId) {
      event.preventDefault();
      await deleteSelectedInternalBoardItem();
      return;
    }
  }

  if (matchesShortcut(event, "paste")) {
    return;
  }

  if (matchesShortcut(event, "delete") && state.selectedAssetId) {
    const asset = getAsset(state.selectedAssetId);
    if (!asset) return;
    const inTrash = state.library.recycleBin.some((item) => item.asset?.id === asset.id);
    const message = inTrash
      ? `\u786e\u5b9a\u5f7b\u5e95\u5220\u9664\u8fd9\u5f20\u56fe\u7247\u5417\uff1f\n\n${asset.name}\n\n\u8fd9\u4e00\u6b65\u4e0d\u80fd\u64a4\u9500\u3002`
      : `\u786e\u5b9a\u5220\u9664\u8fd9\u5f20\u56fe\u7247\u5417\uff1f\n\n${asset.name}\n\n\u56fe\u7247\u4f1a\u8fdb\u5165\u56de\u6536\u7ad9\u3002`;
    const confirmed = confirm(message);
    if (!confirmed) return;
    setLibrary(inTrash ? await api.purgeRecycledAsset(asset.id) : await api.deleteAsset(asset.id));
    state.selectedAssetId = "";
    render();
  }
});

api.onLibraryUpdated(setLibrary);
api.onBoardReturned((boardId) => {
  if (!getBoard(boardId)) return;
  if (!state.openBoardIds.includes(boardId)) state.openBoardIds.push(boardId);
  state.workspaceMode = "boards";
  state.activeBoardId = boardId;
  state.selectedInternalBoardItemId = "";
  render();
});
applyAppSettings();
api.getLibrary().then(setLibrary);

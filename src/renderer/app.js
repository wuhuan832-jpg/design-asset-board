const api = window.assetBoard;

const els = {
  openImportBtn: document.querySelector("#openImportBtn"),
  importBtn: document.querySelector("#importBtn"),
  dropHint: document.querySelector("#dropHint"),
  newBoardBtn: document.querySelector("#newBoardBtn"),
  newNoteBtn: document.querySelector("#newNoteBtn"),
  newFolderBtn: document.querySelector("#newFolderBtn"),
  assetGrid: document.querySelector("#assetGrid"),
  boardDock: document.querySelector("#boardDock"),
  boardTabStrip: document.querySelector("#boardTabStrip"),
  boardDesktop: document.querySelector("#boardDesktop"),
  appShell: document.querySelector(".app-shell"),
  workspace: document.querySelector(".workspace"),
  folderList: document.querySelector("#folderList"),
  boardList: document.querySelector("#boardList"),
  noteList: document.querySelector("#noteList"),
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
  viewerBody: document.querySelector(".viewer-body"),
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
  library: { assets: [], boardAssets: [], recycleBin: [], folders: [], groups: [], boards: [], annotations: {}, notes: [], notePages: [], mindMaps: [], settings: {} },
  workspaceMode: "assets",
  view: "all",
  currentFolderId: "",
  selectedAssetId: "",
  selectedAssetIds: [],
  assetSelection: null,
  viewerAssetId: "",
  viewerZoom: 1,
  viewerPan: { x: 0, y: 0 },
  viewerDragging: false,
  viewerDragPointerId: null,
  viewerDragStart: { x: 0, y: 0 },
  tool: "hand",
  folderPopoverAssetId: "",
  expandedFolderIds: new Set(),
  renamingFolderId: "",
  renamingGroupId: "",
  renameCommitInProgress: false,
  renamingBoardId: "",
  selectedNoteId: "",
  noteSaveTimers: new Map(),
  openBoardIds: [],
  activeBoardId: "",
  internalBoardWindows: {},
  internalBoardInteraction: null,
  internalBoardPanning: null,
  pendingBoardSave: Promise.resolve(),
  internalBoardUndoStack: [],
  internalBoardClipboard: null,
  internalBoardClipboardHash: "",
  suppressNextPasteEvent: false,
  pendingInternalBoardPasteTimer: 0,
  selectedInternalBoardItemId: "",
  selectedInternalBoardItemIds: [],
  internalBoardSelection: null,
  internalBoardPointer: null,
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
    groups: nextState?.groups || [],
    boards: nextState?.boards || [],
    annotations: nextState?.annotations || {},
    notes: nextState?.notes || [],
    notePages: nextState?.notePages || [],
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

function getGroup(groupId) {
  return state.library.groups.find((group) => group.id === groupId);
}

function getNotePage(noteId = state.selectedNoteId) {
  return state.library.notePages.find((note) => note.id === noteId);
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
  if (!board) return;
  const snapshot = clone(board);
  const save = async () => setLibrary(await api.saveBoard(snapshot));
  state.pendingBoardSave = state.pendingBoardSave.then(save, save);
  return state.pendingBoardSave;
}

function getBoardsForClose() {
  const boards = new Map();
  for (const openBoardId of state.openBoardIds) {
    const board = getBoard(openBoardId);
    if (board) boards.set(board.id, board);
  }
  const liveBoard = state.internalBoardInteraction?.board || state.internalBoardPanning?.board;
  if (liveBoard) boards.set(liveBoard.id, liveBoard);
  return [...boards.values()].map(clone);
}

async function detachBoardToFloating(boardId) {
  if (!getBoard(boardId)) return;
  await api.openFloatingBoard(boardId);
  state.openBoardIds = state.openBoardIds.filter((id) => id !== boardId);
  if (state.activeBoardId === boardId) state.activeBoardId = state.openBoardIds.at(-1) || "";
  setInternalBoardSelection([]);
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
  const area = event.target.closest(".internal-board-area, .floating-board-area") || getInternalBoardArea(board.id);
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

function setInternalBoardSelection(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  state.selectedInternalBoardItemIds = unique;
  state.selectedInternalBoardItemId = unique.at(-1) || "";
}

function getSelectedInternalBoardItems(board) {
  if (!board) return [];
  const selectedIds = state.selectedInternalBoardItemIds.length
    ? state.selectedInternalBoardItemIds
    : state.selectedInternalBoardItemId
      ? [state.selectedInternalBoardItemId]
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
      const hasChildren = state.library.folders.some((item) => (item.parentId || "") === folder.id);
      const expanded = hasChildren && state.expandedFolderIds.has(folder.id);
      const children = expanded ? renderFolderTree(folder.id, depth + 1) : "";
      if (state.renamingFolderId === folder.id) {
        return `
          <div class="folder-link active folder-edit-row" style="--folder-depth:${depth}">
            <span class="folder-tree-spacer" aria-hidden="true"></span>
            <input class="folder-name-input" data-folder-name-input="${escapeHtml(folder.id)}" value="${escapeHtml(folder.name)}" aria-label="文件夹名称" />
          </div>
          ${children}
        `;
      }
      return `
        <div class="folder-link ${folder.id === state.currentFolderId ? "active" : ""} ${hasChildren ? "has-children" : ""}" data-folder="${escapeHtml(folder.id)}" style="--folder-depth:${depth}">
          ${hasChildren
            ? `<button class="folder-tree-toggle ${expanded ? "expanded" : ""}" data-toggle-folder-tree="${escapeHtml(folder.id)}" aria-expanded="${expanded}" title="${expanded ? "收起子文件夹" : "展开子文件夹"}" aria-label="${expanded ? "收起子文件夹" : "展开子文件夹"}"><span aria-hidden="true">›</span></button>`
            : `<span class="folder-tree-spacer" aria-hidden="true"></span>`}
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

function focusGroupRenameInput(groupId) {
  setTimeout(() => {
    const input = document.querySelector(`[data-group-name-input="${CSS.escape(groupId)}"]`);
    input?.focus();
    input?.select();
  }, 0);
}

async function commitGroupRename(input) {
  if (!input?.isConnected || state.renameCommitInProgress) return;
  const groupId = input.dataset.groupNameInput;
  const group = getGroup(groupId);
  const nextName = input.value.trim() || group?.name;
  if (!group || !nextName) return;
  state.renameCommitInProgress = true;
  state.renamingGroupId = "";
  try {
    setLibrary(await api.updateGroup(groupId, { name: nextName }));
  } finally {
    state.renameCommitInProgress = false;
  }
}

async function commitFolderRename(input) {
  if (!input?.isConnected || state.renameCommitInProgress) return;
  const folderId = input.dataset.folderNameInput;
  const folder = getFolder(folderId);
  const nextName = input.value.trim() || folder?.name;
  if (!folder || !nextName) return;
  state.renameCommitInProgress = true;
  state.renamingFolderId = "";
  try {
    const next = await api.renameFolder(folderId, nextName);
    setLibrary(next);
    state.currentFolderId = folderId;
    render();
  } finally {
    state.renameCommitInProgress = false;
  }
}

function commitInlineRenameBeforePointerAction(event) {
  if (event.button !== 0 || event.target.closest?.("[data-group-name-input], [data-folder-name-input]")) return;
  const groupInput = document.querySelector("[data-group-name-input]");
  const folderInput = document.querySelector("[data-folder-name-input]");
  if (groupInput) {
    void commitGroupRename(groupInput);
    return;
  }
  if (folderInput) void commitFolderRename(folderInput);
}

function noteContent(note) {
  if (typeof note?.content === "string" && note.content) return note.content;
  return escapeHtml(note?.text || "").replace(/\n/g, "<br>");
}

function sanitizeNoteContent(editor) {
  const clone = editor.cloneNode(true);
  clone.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => node.remove());
  clone.querySelectorAll("*").forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const keepImageAttribute = node.tagName === "IMG" && ["src", "alt", "data-note-asset-id"].includes(attribute.name);
      if (!keepImageAttribute) node.removeAttribute(attribute.name);
    }
  });
  return clone.innerHTML;
}

function scheduleNoteContentSave(editor) {
  const noteId = editor?.dataset.noteContent;
  const note = getNotePage(noteId);
  if (!note) return;
  note.content = sanitizeNoteContent(editor);
  clearTimeout(state.noteSaveTimers.get(noteId));
  state.noteSaveTimers.set(noteId, setTimeout(() => void flushNoteContentSave(noteId), 320));
}

async function flushNoteContentSave(noteId) {
  const timer = state.noteSaveTimers.get(noteId);
  if (!timer) return;
  clearTimeout(timer);
  state.noteSaveTimers.delete(noteId);
  const note = getNotePage(noteId);
  if (note) await api.updateNotePage(noteId, { content: note.content || "" });
}

async function flushAllNoteContentSaves() {
  await Promise.all([...state.noteSaveTimers.keys()].map((noteId) => flushNoteContentSave(noteId)));
}

function insertNodeAtRange(range, node) {
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

async function pasteImagesIntoNote(editor, files) {
  const imageFiles = [...files].filter((file) => file.type?.startsWith("image/"));
  if (!imageFiles.length) return false;
  const selection = window.getSelection();
  const range = selection?.rangeCount && editor.contains(selection.anchorNode)
    ? selection.getRangeAt(0).cloneRange()
    : document.createRange();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) range.selectNodeContents(editor);
  range.collapse(false);
  const payloads = await Promise.all(imageFiles.map(async (file, index) => ({
    name: file.name || `note-image-${Date.now()}-${index + 1}.png`,
    type: file.type || "image/png",
    boardOnly: true,
    bytes: await file.arrayBuffer()
  })));
  const added = await api.importNoteImages(editor.dataset.noteContent, payloads);
  for (const asset of added || []) {
    const image = document.createElement("img");
    image.src = asset.url;
    image.alt = asset.name || "note image";
    image.dataset.noteAssetId = asset.id;
    insertNodeAtRange(range, image);
    insertNodeAtRange(range, document.createElement("br"));
  }
  scheduleNoteContentSave(editor);
  return Boolean(added?.length);
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
  const liveBoards = new Map();
  if (state.internalBoardInteraction?.board) {
    liveBoards.set(state.internalBoardInteraction.board.id, state.internalBoardInteraction.board);
  }
  if (state.internalBoardPanning?.board) {
    liveBoards.set(state.internalBoardPanning.board.id, state.internalBoardPanning.board);
  }
  const normalized = normalizeLibrary(nextState);
  normalized.boards = normalized.boards.map((board) => liveBoards.get(board.id) || board);
  state.library = normalized;
  if (state.currentFolderId && !getFolder(state.currentFolderId)) state.currentFolderId = "";
  render();
}

function render() {
  els.allCount.textContent = state.library.assets.length;
  els.libraryPath.textContent = "\u8f6f\u4ef6\u81ea\u52a8\u4fdd\u5b58\uff0c\u4e0d\u9700\u8981\u7535\u8111\u6587\u4ef6\u5939\u6574\u7406";
  els.appShell.classList.toggle("board-shell", state.workspaceMode === "boards");
  els.appShell.classList.toggle("notes-shell", state.workspaceMode === "assets" && state.view === "notes");
  els.workspace.classList.toggle("board-workspace", state.workspaceMode === "boards");
  els.workspace.classList.toggle("notes-mode", state.workspaceMode === "assets" && state.view === "notes");
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

  els.noteList.innerHTML = state.library.notePages.map((note) => `
    <button class="note-link ${state.view === "notes" && state.selectedNoteId === note.id ? "active" : ""}" data-note-link="${escapeHtml(note.id)}" title="打开笔记">
      <span>${escapeHtml(note.title || "未命名笔记")}</span>
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
  if (state.view === "notes") {
    els.viewTitle.textContent = "笔记";
    els.viewSubtitle.textContent = "独立整理想法与文字草稿。笔记会自动保存在软件内部。";
    renderNotesWorkspace();
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

function renderNotesWorkspace() {
  const selected = getNotePage();
  els.assetGrid.classList.remove("grouped-assets");
  els.assetGrid.innerHTML = `
    <section class="notes-workspace">
      <div class="notes-toolbar" aria-label="笔记工具">
        <button class="primary-note-action" data-create-note><span aria-hidden="true">＋</span><span>新建</span></button>
        <span class="notes-toolbar-divider" aria-hidden="true"></span>
        <label class="note-toolbar-control"><span>纸张</span><select aria-label="纸张纹理" data-note-setting="paper" ${selected ? "" : "disabled"}>
          <option value="plain" ${selected?.paper === "plain" ? "selected" : ""}>素白</option>
          <option value="lined" ${selected?.paper === "lined" ? "selected" : ""}>横线</option>
          <option value="grid" ${selected?.paper === "grid" ? "selected" : ""}>方格</option>
          <option value="dot" ${selected?.paper === "dot" ? "selected" : ""}>点阵</option>
          <option value="soft" ${selected?.paper === "soft" ? "selected" : ""}>柔和纸纹</option>
        </select></label>
        <label class="note-toolbar-control note-font-control"><span>字体</span><select aria-label="字体" data-note-setting="fontFamily" ${selected ? "" : "disabled"}>
          ${["Microsoft YaHei", "SimSun", "KaiTi", "Arial", "Georgia"].map((font) => `<option value="${font}" ${selected?.fontFamily === font ? "selected" : ""}>${font}</option>`).join("")}
        </select></label>
        <label class="note-toolbar-control note-size-control"><span>字号</span><select aria-label="字号" data-note-setting="fontSize" ${selected ? "" : "disabled"}>
          ${[14, 16, 18, 20, 24, 28, 36, 48, 60, 72].map((size) => `<option value="${size}" ${Number(selected?.fontSize) === size ? "selected" : ""}>${size}</option>`).join("")}
        </select></label>
        <label class="note-toolbar-control note-color-control"><span>颜色</span><input aria-label="文字颜色" data-note-setting="color" type="color" value="${escapeHtml(selected?.color || "#3a2d2b")}" ${selected ? "" : "disabled"} /></label>
        <span class="note-selection-actions">${selected ? `<button class="note-delete" data-delete-note="${escapeHtml(selected.id)}" title="删除当前笔记">删除</button>` : `<span class="notes-toolbar-hint">选择或新建一篇笔记</span>`}</span>
      </div>
      <div class="notes-canvas" data-notes-canvas>
        ${selected ? `
          <article class="note-page paper-${escapeHtml(selected.paper || "plain")}" data-note-page="${escapeHtml(selected.id)}" style="--note-ink:${escapeHtml(selected.color || "#3a2d2b")};--note-font:${escapeHtml(selected.fontFamily || "Microsoft YaHei")};--note-size:${Number(selected.fontSize) || 18}px;">
            <div class="note-page-header">
              <input class="note-title-input" data-note-title="${escapeHtml(selected.id)}" value="${escapeHtml(selected.title || "未命名笔记")}" placeholder="无标题" aria-label="笔记标题" />
            </div>
            <div class="note-body-input" data-note-content="${escapeHtml(selected.id)}" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="从这里开始记录，也可以直接粘贴图片……">${noteContent(selected)}</div>
          </article>
        ` : `<div class="notes-empty"><div class="notes-empty-icon" aria-hidden="true">▤</div><h3>开始一篇笔记</h3><p>记录设计思路、项目草稿或参考说明，也可以直接粘贴图片。</p><button data-create-note>新建笔记</button></div>`}
      </div>
    </section>
  `;
}

function syncNoteSelectionUI() {
  const note = getNotePage();
  document.querySelectorAll("[data-note-page]").forEach((page) => {
    page.classList.toggle("selected", page.dataset.notePage === state.selectedNoteId);
  });
  document.querySelectorAll("[data-note-setting]").forEach((control) => {
    control.disabled = !note;
    if (note && Object.hasOwn(note, control.dataset.noteSetting)) control.value = note[control.dataset.noteSetting];
  });
  const actions = document.querySelector(".note-selection-actions");
  if (actions) actions.innerHTML = note
    ? `<button class="note-delete" data-delete-note="${escapeHtml(note.id)}">删除笔记</button>`
    : `<span class="notes-toolbar-hint">先选择一张笔记</span>`;
  renderInspector();
}

function renderAssetCard(asset) {
  const selected = state.selectedAssetIds.includes(asset.id) || (!state.selectedAssetIds.length && asset.id === state.selectedAssetId);
  return `
    <article class="asset-card ${selected ? "selected" : ""}" data-asset="${escapeHtml(asset.id)}" draggable="true">
      <button class="favorite ${asset.favorite ? "on" : ""}" data-favorite="${escapeHtml(asset.id)}" title="收藏">★</button>
      <button class="folder-chip" data-folder-menu="${escapeHtml(asset.id)}" title="放入软件内文件夹">文件夹</button>
      <div class="thumb"><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)}" loading="lazy" /></div>
      <div class="asset-caption">
        <strong>${escapeHtml(asset.name)}</strong>
        <span>${state.view === "trash" ? `删除于 ${formatDate(asset.deletedAt)}` : `${escapeHtml(asset.width || "-")} × ${escapeHtml(asset.height || "-")} · ${escapeHtml(asset.ext)}`}</span>
      </div>
    </article>
  `;
}

function renderGroupedAssetTile(asset) {
  const selected = state.selectedAssetIds.includes(asset.id) || (!state.selectedAssetIds.length && asset.id === state.selectedAssetId);
  return `
    <article class="grouped-asset-tile ${selected ? "selected" : ""}" data-asset="${escapeHtml(asset.id)}" draggable="true" title="${escapeHtml(asset.name)}">
      <button class="favorite ${asset.favorite ? "on" : ""}" data-favorite="${escapeHtml(asset.id)}" title="收藏">★</button>
      <button class="folder-chip" data-folder-menu="${escapeHtml(asset.id)}" title="放入软件内文件夹">文件夹</button>
      <div class="grouped-asset-thumb"><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)}" loading="lazy" /></div>
      <div class="grouped-asset-caption">
        <strong>${escapeHtml(asset.name)}</strong>
        <span>${escapeHtml(asset.width || "-")} × ${escapeHtml(asset.height || "-")}</span>
      </div>
    </article>
  `;
}

function renderAssetGroupStack(group, assets) {
  const editing = state.renamingGroupId === group.id;
  const groupColor = group.color || "#9A4F60";
  const visibleAssets = group.collapsed ? assets.slice(0, 3) : assets;
  const hiddenCount = assets.length - visibleAssets.length;
  const groupSpan = Math.min(Math.max(assets.length, 2), 3);
  const itemCountClass = visibleAssets.length > 3 ? "many" : String(Math.max(visibleAssets.length, 1));
  return `
    <section class="asset-group-stack ${group.collapsed ? "collapsed" : "expanded"}" data-asset-group="${escapeHtml(group.id)}" data-group-drop="${escapeHtml(group.id)}" style="--group-color:${escapeHtml(groupColor)};--group-span:${groupSpan};--group-count:${visibleAssets.length}">
      <header class="asset-group-stack-header" data-asset-group-meta>
        <button class="group-collapse" data-toggle-group="${escapeHtml(group.id)}" title="${group.collapsed ? "展开组" : "收起组"}" aria-label="${group.collapsed ? "展开组" : "收起组"}">${group.collapsed ? "▸" : "▾"}</button>
        <span class="group-color-mark" aria-hidden="true"></span>
        ${editing ? `
          <input class="group-name-input" data-group-name-input="${escapeHtml(group.id)}" value="${escapeHtml(group.name)}" aria-label="组名称" />
        ` : `<button class="asset-group-name" data-group-name="${escapeHtml(group.id)}" title="双击重命名">${escapeHtml(group.name)}</button>`}
        <span class="group-count">${assets.length} 张</span>
        <input class="group-color-input" data-group-color="${escapeHtml(group.id)}" type="color" value="${escapeHtml(groupColor)}" title="更改组颜色" aria-label="更改组颜色" />
        <button class="group-more" data-group-more="${escapeHtml(group.id)}" title="组设置" aria-label="组设置">•••</button>
      </header>
      <div class="asset-group-stack-items group-items-${itemCountClass}">
        ${visibleAssets.map((asset) => renderGroupedAssetTile(asset)).join("")}
        ${hiddenCount ? `<button class="group-hidden-count" data-toggle-group="${escapeHtml(group.id)}" title="展开查看全部图片">+${hiddenCount}</button>` : ""}
      </div>
    </section>
  `;
}

function renderChildFolders() {
  if (!state.currentFolderId) return "";
  const children = state.library.folders.filter((folder) => (folder.parentId || "") === state.currentFolderId);
  if (!children.length) return "";
  return `
    <section class="child-folder-block">
      <header><strong>子文件夹</strong><span>${children.length} 个</span></header>
      <div class="child-folder-list">
        ${children.map((folder) => `
          <button class="child-folder-tile" data-open-child-folder="${escapeHtml(folder.id)}">
            <span class="child-folder-icon" aria-hidden="true"></span>
            <strong>${escapeHtml(folder.name)}</strong>
            <small>${folderAssetCount(folder.id)} 张</small>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderAssetGrid() {
  const assets = getAssetsForView();
  const folderGroups = state.currentFolderId
    ? state.library.groups.filter((group) => group.folderId === state.currentFolderId)
    : [];
  const childFolders = renderChildFolders();
  els.assetGrid.classList.remove("grouped-assets");
  els.assetGrid.classList.toggle("group-marked-assets", Boolean(folderGroups.length));
  els.assetGrid.classList.toggle("has-child-folders", Boolean(childFolders));
  if (!assets.length) {
    els.assetGrid.innerHTML = `${childFolders}<div class="empty-state"><h3>${state.view === "trash" ? "回收站是空的" : "这里还没有图片"}</h3><p>${state.view === "trash" ? "删除的素材会在这里保留一段时间。" : "直接 Ctrl+V 粘贴图片。"}</p></div>`;
    return;
  }
  const groupByAssetId = new Map();
  folderGroups.forEach((group) => {
    (group.assetIds || []).forEach((assetId) => {
      if (!groupByAssetId.has(assetId)) groupByAssetId.set(assetId, group);
    });
  });
  const visibleAssetsByGroup = new Map(folderGroups.map((group) => [
    group.id,
    assets.filter((asset) => (group.assetIds || []).includes(asset.id))
  ]));
  const renderedGroups = new Set();
  const cards = assets.map((asset) => {
    const group = groupByAssetId.get(asset.id);
    if (!group) return renderAssetCard(asset);
    if (renderedGroups.has(group.id)) return "";
    renderedGroups.add(group.id);
    return renderAssetGroupStack(group, visibleAssetsByGroup.get(group.id) || []);
  }).join("");
  els.assetGrid.innerHTML = `${childFolders}${cards}`;
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
        ${renderBoardSelectionBox(board)}
      </div>
    </section>
  `;
}

function renderBoardItem(item, boardId) {
  const isText = item.type === "text";
  const asset = isText ? null : getAsset(item.assetId);
  if (!isText && !asset) return "";
  const selectedIds = state.selectedInternalBoardItemIds.length
    ? state.selectedInternalBoardItemIds
    : state.selectedInternalBoardItemId
      ? [state.selectedInternalBoardItemId]
      : [];
  const selected = state.activeBoardId === boardId && selectedIds.includes(item.id);
  const singleSelected = selected && selectedIds.length === 1;
  const flipX = item.flipX ? -1 : 1;
  const flipY = item.flipY ? -1 : 1;
  const size = boardItemSize(getBoard(boardId), item);
  return `
    <div class="board-item ${isText ? "board-text-item" : ""} ${selected ? "selected" : ""}" data-board-item="${escapeHtml(item.id)}" style="left:${item.x || 0}px; top:${item.y || 0}px; width:${size.width}px;${isText ? ` height:${size.height}px;` : ""} transform: rotate(${item.rotation || 0}deg);">
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
}

function renderBoardSelectionBox(board) {
  const selection = state.internalBoardSelection;
  if (!selection || selection.boardId !== board.id) return "";
  const rect = normalizeRect(selection.start, selection.current);
  return `
    <div class="board-selection-box" style="
      left:${rect.x * board.viewport.scale + board.viewport.x}px;
      top:${rect.y * board.viewport.scale + board.viewport.y}px;
      width:${rect.width * board.viewport.scale}px;
      height:${rect.height * board.viewport.scale}px;
    "></div>
  `;
}

function renderInspector() {
  if (state.workspaceMode === "assets" && state.view === "notes") {
    const note = getNotePage();
    els.assetInfo.innerHTML = note ? `
      <div class="note-inspector-summary">
        <strong>${escapeHtml(note.title || "未命名笔记")}</strong>
        <span>${escapeHtml(note.paper || "plain")} · ${escapeHtml(note.fontFamily || "Microsoft YaHei")} · ${Number(note.fontSize) || 18} px</span>
        <p>拖动笔记空白处可移动，拖动右下角可调整大小。</p>
      </div>
    ` : `<div class="empty-info">选择一张笔记后，这里会显示笔记信息。</div>`;
    return;
  }
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

function showAssetSelectionContextMenu(event) {
  const count = state.selectedAssetIds.length;
  if (!state.currentFolderId || count < 2) return false;
  els.folderContextMenu.innerHTML = `
    <button data-create-group-from-selection>将所选 ${count} 张图片建组</button>
  `;
  const x = Math.min(event.clientX, window.innerWidth - 220);
  const y = Math.min(event.clientY, window.innerHeight - 64);
  els.folderContextMenu.style.left = `${Math.max(8, x)}px`;
  els.folderContextMenu.style.top = `${Math.max(8, y)}px`;
  els.folderContextMenu.classList.remove("hidden");
  return true;
}

function showGroupContextMenu(groupId, event) {
  const group = getGroup(groupId);
  if (!group) return;
  els.folderContextMenu.innerHTML = `
    <button data-rename-group="${escapeHtml(group.id)}">重命名</button>
    <button data-toggle-group="${escapeHtml(group.id)}">${group.collapsed ? "展开组" : "收起组"}</button>
    <button class="danger" data-delete-group="${escapeHtml(group.id)}">删除组</button>
  `;
  const x = Math.min(event.clientX, window.innerWidth - 176);
  const y = Math.min(event.clientY, window.innerHeight - 116);
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
  setInternalBoardSelection([]);
  state.currentFolderId = next.folders[0]?.id || "";
  state.renamingFolderId = state.currentFolderId;
  if (parentId) state.expandedFolderIds.add(parentId);
  state.view = "all";
  render();
  focusFolderRenameInput(state.currentFolderId);
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
  setTool("hand");
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
  els.viewer.classList.toggle("hand-tool", tool === "hand");
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
  const selected = getSelectedInternalBoardItems(board);
  if (!board || !selected.length) return;
  rememberInternalBoard(board);
  const selectedIds = new Set(selected.map((item) => item.id));
  board.items = board.items.filter((item) => !selectedIds.has(item.id));
  setInternalBoardSelection([]);
  await saveBoard(board);
}

async function addTextToInternalBoard(boardId, text, point) {
  const board = getBoard(boardId);
  const value = String(text || "").trim();
  if (!board || !value) return;
  rememberInternalBoard(board);
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
  setInternalBoardSelection([item.id]);
  await saveBoard(board);
}

function openInternalBoardTextInput(board) {
  const area = getInternalBoardArea(board.id);
  if (!area) return;
  document.querySelector(".board-text-entry")?.remove();
  const remembered = state.internalBoardPointer?.boardId === board.id ? state.internalBoardPointer.point : null;
  const point = remembered || getInternalBoardPastePoint(board);
  const input = document.createElement("input");
  input.className = "board-text-entry";
  input.type = "text";
  input.placeholder = "输入文字，按 Enter 放入画板";
  input.setAttribute("aria-label", "画板文字");
  const screenX = point.x * board.viewport.scale + board.viewport.x;
  const screenY = point.y * board.viewport.scale + board.viewport.y;
  input.style.left = `${Math.max(12, Math.min(area.clientWidth - 332, screenX))}px`;
  input.style.top = `${Math.max(12, Math.min(area.clientHeight - 52, screenY))}px`;
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
    await addTextToInternalBoard(board.id, value, point);
    renderInternalBoards();
  });
  input.addEventListener("blur", () => setTimeout(() => input.remove(), 0));
  area.appendChild(input);
  input.focus();
}

async function copySelectedInternalBoardItem() {
  const board = getBoard(state.activeBoardId);
  const selected = getSelectedInternalBoardItems(board);
  if (!selected.length) return;
  const items = selected.map((item) => clone(item));
  state.internalBoardClipboard = { items };
  const imageItem = items.find((item) => item.assetId);
  const result = imageItem ? await api.writeAssetToClipboard?.(imageItem.assetId) : null;
  state.internalBoardClipboardHash = result?.hash || "";
  await api.writeBoardClipboard?.({ items, hash: state.internalBoardClipboardHash });
}

async function pasteInternalBoardItem() {
  const board = getBoard(state.activeBoardId);
  if (!board) return;
  const sharedClipboard = await api.readBoardClipboard?.();
  const clipboard = state.internalBoardClipboard || sharedClipboard;
  const sourceItems = Array.isArray(clipboard?.items) ? clipboard.items : clipboard ? [clipboard] : [];
  if (!sourceItems.length) return;
  rememberInternalBoard(board);
  const minX = Math.min(...sourceItems.map((item) => item.x || 0));
  const minY = Math.min(...sourceItems.map((item) => item.y || 0));
  const pastePoint = getInternalBoardPastePoint(board);
  const pasted = sourceItems.map((source, index) => ({
    ...clone(source),
    id: window.crypto.randomUUID(),
    x: Math.round(pastePoint.x + ((source.x || 0) - minX) + 28 + index * 2),
    y: Math.round(pastePoint.y + ((source.y || 0) - minY) + 28 + index * 2)
  }));
  board.items.push(...pasted);
  state.internalBoardClipboard = { items: pasted.map((item) => clone(item)) };
  const imageItem = pasted.find((item) => item.assetId);
  const result = imageItem ? await api.writeAssetToClipboard?.(imageItem.assetId) : null;
  state.internalBoardClipboardHash = result?.hash || state.internalBoardClipboardHash;
  await api.writeBoardClipboard?.({ items: state.internalBoardClipboard.items, hash: state.internalBoardClipboardHash });
  setInternalBoardSelection(pasted.map((item) => item.id));
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
  setInternalBoardSelection([]);
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
els.viewerBody.addEventListener("click", (event) => {
  if (event.target === els.viewerBody) closeViewer();
});
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
  const noteEditor = event.target.closest?.("[data-note-content]");
  if (noteEditor) {
    let files = getPasteEventFiles(event);
    const plainText = event.clipboardData?.getData("text/plain");
    if (!files.length && !plainText) {
      event.preventDefault();
      const clipboardEntries = await readClipboardImageFiles();
      files = clipboardEntries.map((entry) => entry.file);
    }
    if (files.length) {
      event.preventDefault();
      await pasteImagesIntoNote(noteEditor, files);
      return;
    }
    if (plainText) {
      event.preventDefault();
      const selection = window.getSelection();
      if (selection?.rangeCount) insertNodeAtRange(selection.getRangeAt(0), document.createTextNode(plainText));
      scheduleNoteContentSave(noteEditor);
    }
    return;
  }
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
  const groupTarget = event.target.closest?.(".asset-group-stack, .asset-card, .collapsed-group-card");
  if (groupTarget && !groupTarget.contains(event.relatedTarget)) groupTarget.classList.remove("group-drop-active");
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

  const groupPicker = event.target.closest("[data-asset-group-select]");
  if (groupPicker) {
    setLibrary(await api.setAssetGroup(state.currentFolderId, groupPicker.dataset.assetGroupSelect, groupPicker.value));
    return;
  }

  const groupColor = event.target.closest("[data-group-color]");
  if (groupColor) {
    setLibrary(await api.updateGroup(groupColor.dataset.groupColor, { color: groupColor.value }));
    return;
  }

  const noteSetting = event.target.closest("[data-note-setting]");
  if (noteSetting && state.selectedNoteId) {
    await flushNoteContentSave(state.selectedNoteId);
    const key = noteSetting.dataset.noteSetting;
    const value = key === "fontSize" ? Number(noteSetting.value) : noteSetting.value;
    setLibrary(await api.updateNotePage(state.selectedNoteId, { [key]: value }));
    return;
  }

  const noteTitle = event.target.closest("[data-note-title]");
  if (noteTitle) {
    const next = await api.updateNotePage(noteTitle.dataset.noteTitle, { title: noteTitle.value.trim() || "未命名笔记" });
    setLibrary(next);
    return;
  }

  const noteText = event.target.closest("[data-note-text]");
  if (noteText) {
    const next = await api.updateNotePage(noteText.dataset.noteText, { text: noteText.value });
    setLibrary(next);
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
  const groupDrop = event.target.closest("[data-group-drop]");
  if (groupDrop && event.dataTransfer?.types?.includes("text/asset-id")) {
    event.preventDefault();
    groupDrop.closest(".asset-group-stack, .asset-card, .collapsed-group-card")?.classList.add("group-drop-active");
    event.dataTransfer.dropEffect = "move";
    return;
  }
  const area = event.target.closest("[data-board-area]");
  if (!area) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

document.addEventListener("drop", async (event) => {
  const groupDrop = event.target.closest("[data-group-drop]");
  const groupedAssetId = event.dataTransfer.getData("text/asset-id");
  if (groupDrop && groupedAssetId && state.currentFolderId) {
    event.preventDefault();
    event.stopPropagation();
    document.querySelectorAll(".group-drop-active").forEach((item) => item.classList.remove("group-drop-active"));
    setLibrary(await api.setAssetGroup(state.currentFolderId, groupedAssetId, groupDrop.dataset.groupDrop));
    return;
  }
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

document.addEventListener("input", (event) => {
  const noteEditor = event.target.closest?.("[data-note-content]");
  if (noteEditor) scheduleNoteContentSave(noteEditor);
});

document.addEventListener("contextmenu", (event) => {
  const assetCard = event.target.closest("[data-asset]");
  const groupHeader = event.target.closest("[data-asset-group-meta]");
  const folderLink = event.target.closest("[data-folder]");
  const boardLink = event.target.closest("[data-board]");
  if (groupHeader) {
    const groupId = groupHeader.closest("[data-asset-group]")?.dataset.assetGroup;
    if (groupId) {
      event.preventDefault();
      hideBoardContextMenu();
      showGroupContextMenu(groupId, event);
      return;
    }
  }
  if (assetCard) {
    const assetId = assetCard.dataset.asset;
    if (!state.selectedAssetIds.includes(assetId)) {
      state.selectedAssetIds = [assetId];
      state.selectedAssetId = assetId;
      document.querySelectorAll("[data-asset]").forEach((card) => {
        card.classList.toggle("selected", card.dataset.asset === assetId);
      });
    }
    if (showAssetSelectionContextMenu(event)) {
      event.preventDefault();
      hideBoardContextMenu();
      return;
    }
  }
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
  const groupName = event.target.closest("[data-group-name]");
  if (groupName) {
    event.preventDefault();
    event.stopPropagation();
    state.renamingGroupId = groupName.dataset.groupName;
    renderAssetGrid();
    focusGroupRenameInput(state.renamingGroupId);
    return;
  }
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

document.addEventListener("focusout", (event) => {
  const groupInput = event.target.closest?.("[data-group-name-input]");
  if (groupInput) {
    queueMicrotask(() => commitGroupRename(groupInput));
    return;
  }
  const folderInput = event.target.closest?.("[data-folder-name-input]");
  if (folderInput) queueMicrotask(() => commitFolderRename(folderInput));
});

document.addEventListener("pointerdown", commitInlineRenameBeforePointerAction, true);

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
    setInternalBoardSelection([]);
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
    setInternalBoardSelection([]);
    state.view = nav.dataset.view;
    state.currentFolderId = "";
    render();
    return;
  }

  const createNoteButton = event.target.closest("[data-create-note]");
  if (createNoteButton) {
    await flushAllNoteContentSaves();
    const result = await api.createNotePage();
    state.selectedNoteId = result.noteId;
    state.view = "notes";
    state.workspaceMode = "assets";
    setLibrary(result.state);
    return;
  }

  const noteLink = event.target.closest("[data-note-link]");
  if (noteLink) {
    state.workspaceMode = "assets";
    state.view = "notes";
    state.currentFolderId = "";
    state.selectedNoteId = noteLink.dataset.noteLink;
    render();
    return;
  }

  const createGroupFromSelection = event.target.closest("[data-create-group-from-selection]");
  if (createGroupFromSelection) {
    hideFolderContextMenu();
    const result = await api.createGroupFromAssets(state.currentFolderId, state.selectedAssetIds);
    if (!result) return;
    state.selectedAssetIds = [];
    state.selectedAssetId = "";
    state.renamingGroupId = result.groupId;
    setLibrary(result.state);
    renderAssetGrid();
    focusGroupRenameInput(result.groupId);
    return;
  }

  const deleteNoteButton = event.target.closest("[data-delete-note]");
  if (deleteNoteButton) {
    await flushAllNoteContentSaves();
    const note = getNotePage(deleteNoteButton.dataset.deleteNote);
    if (note && confirm(`确定删除这张笔记吗？\n\n${note.title || "未命名笔记"}`)) {
      state.selectedNoteId = "";
      setLibrary(await api.deleteNotePage(note.id));
    }
    return;
  }

  const groupMore = event.target.closest("[data-group-more]");
  if (groupMore) {
    const rect = groupMore.getBoundingClientRect();
    showGroupContextMenu(groupMore.dataset.groupMore, { clientX: rect.right, clientY: rect.bottom });
    return;
  }

  const renameGroupButton = event.target.closest("[data-rename-group]");
  if (renameGroupButton) {
    hideFolderContextMenu();
    state.renamingGroupId = renameGroupButton.dataset.renameGroup;
    renderAssetGrid();
    focusGroupRenameInput(state.renamingGroupId);
    return;
  }

  const toggleGroupButton = event.target.closest("[data-toggle-group]");
  if (toggleGroupButton) {
    hideFolderContextMenu();
    const group = getGroup(toggleGroupButton.dataset.toggleGroup);
    if (group) setLibrary(await api.updateGroup(group.id, { collapsed: !group.collapsed }));
    return;
  }

  const saveGroupName = event.target.closest("[data-save-group-name]");
  if (saveGroupName) {
    const groupId = saveGroupName.dataset.saveGroupName;
    const input = document.querySelector(`[data-group-name-input="${CSS.escape(groupId)}"]`);
    if (input?.value.trim()) {
      state.renamingGroupId = "";
      setLibrary(await api.updateGroup(groupId, { name: input.value.trim() }));
    }
    return;
  }

  const cancelGroupName = event.target.closest("[data-cancel-group-name]");
  if (cancelGroupName) {
    state.renamingGroupId = "";
    renderAssetGrid();
    return;
  }

  const deleteGroupButton = event.target.closest("[data-delete-group]");
  if (deleteGroupButton) {
    hideFolderContextMenu();
    const group = getGroup(deleteGroupButton.dataset.deleteGroup);
    if (group && confirm(`确定删除这个组吗？\n\n${group.name}\n\n组内图片不会被删除，只会回到“未分组”。`)) {
      setLibrary(await api.deleteGroup(group.id));
    }
    return;
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
    setInternalBoardSelection([]);
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

  const folderTreeToggle = event.target.closest("[data-toggle-folder-tree]");
  if (folderTreeToggle) {
    event.preventDefault();
    event.stopPropagation();
    const folderId = folderTreeToggle.dataset.toggleFolderTree;
    if (state.expandedFolderIds.has(folderId)) state.expandedFolderIds.delete(folderId);
    else state.expandedFolderIds.add(folderId);
    renderNavigation();
    return;
  }

  const folderLink = event.target.closest("[data-folder]");
  if (folderLink && !event.target.closest("[data-rename-folder]") && !event.target.closest("[data-delete-folder]") && !event.target.closest("[data-new-child-folder]")) {
    if (event.detail >= 2 && event.target.closest(".folder-name")) {
      state.renamingFolderId = folderLink.dataset.folder;
      renderNavigation();
      focusFolderRenameInput(state.renamingFolderId);
      return;
    }
    state.workspaceMode = "assets";
    state.activeBoardId = "";
    setInternalBoardSelection([]);
    state.currentFolderId = folderLink.dataset.folder;
    state.view = "all";
    render();
    return;
  }

  const childFolder = event.target.closest("[data-open-child-folder]");
  if (childFolder) {
    state.workspaceMode = "assets";
    state.currentFolderId = childFolder.dataset.openChildFolder;
    state.view = "all";
    state.selectedAssetIds = [];
    render();
    return;
  }

  const boardLink = event.target.closest("[data-board]");
  if (boardLink && !event.target.closest("[data-rename-board]") && !event.target.closest("[data-delete-board]")) {
    ensureInternalBoardWindow(boardLink.dataset.board);
    return;
  }

  const card = event.target.closest("[data-asset]");
  if (card && !event.target.closest("[data-favorite]") && !event.target.closest("[data-folder-menu]") && !event.target.closest("[data-asset-group-select]") && !event.target.closest("[data-asset-group-meta]")) {
    const assetId = card.dataset.asset;
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      state.selectedAssetIds = state.selectedAssetIds.includes(assetId)
        ? state.selectedAssetIds.filter((id) => id !== assetId)
        : [...state.selectedAssetIds, assetId];
    } else {
      state.selectedAssetIds = [assetId];
    }
    state.selectedAssetId = state.selectedAssetIds.at(-1) || "";
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
  if (state.internalBoardPanning) {
    event.preventDefault();
    return;
  }
  const board = getBoard(area.dataset.boardArea);
  if (!board) return;
  event.preventDefault();
  zoomBoardAtPoint(board, area, event.clientX, event.clientY, event.deltaY);
  renderInternalBoards();
  await saveBoard(board);
}, { passive: false });

document.addEventListener("pointerdown", (event) => {
  const assetSurface = event.target.closest?.("#assetGrid");
  const blockedAssetSelection = event.target.closest?.("[data-asset], [data-asset-group-meta], button, input, textarea, select, [data-note-page], .child-folder-tile");
  if (assetSurface && !blockedAssetSelection && event.button === 0 && state.workspaceMode === "assets" && state.view !== "notes") {
    const box = document.createElement("div");
    box.className = "asset-selection-box";
    document.body.appendChild(box);
    state.assetSelection = {
      start: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
      box
    };
    if (!event.ctrlKey && !event.metaKey) state.selectedAssetIds = [];
    event.preventDefault();
    return;
  }

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
    setInternalBoardSelection([]);
    state.internalBoardInteraction = null;
    state.internalBoardSelection = null;
    state.internalBoardPanning = {
      boardId: board.id,
      board,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: board.viewport.x,
      originY: board.viewport.y,
      area,
      canvas: area.querySelector(".board-canvas")
    };
    area.classList.add("panning");
    area.setPointerCapture?.(event.pointerId);
    return;
  }

  if (itemEl && event.button === 0) {
    const item = board.items.find((entry) => entry.id === itemEl.dataset.boardItem);
    const alreadySelected = state.selectedInternalBoardItemIds.includes(item.id);
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      setInternalBoardSelection(alreadySelected
        ? state.selectedInternalBoardItemIds.filter((id) => id !== item.id)
        : [...state.selectedInternalBoardItemIds, item.id]);
    } else if (!alreadySelected) {
      setInternalBoardSelection([item.id]);
    } else {
      setInternalBoardSelection(state.selectedInternalBoardItemIds.length ? state.selectedInternalBoardItemIds : [item.id]);
    }
    rememberInternalBoard(board);
    renderInternalBoards();
    if (handle?.dataset.boardHandle === "resize") {
      state.internalBoardInteraction = { type: "resize", boardId: board.id, board, item, startX: event.clientX, originWidth: item.width || 260 };
      return;
    }
    if (handle?.dataset.boardHandle === "rotate") {
      const rect = itemEl.getBoundingClientRect();
      state.internalBoardInteraction = { type: "rotate", boardId: board.id, board, item, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 };
      return;
    }
    const movingItems = getSelectedInternalBoardItems(board);
    state.internalBoardInteraction = {
      type: "move",
      boardId: board.id,
      board,
      item,
      items: movingItems.map((entry) => ({
        item: entry,
        originX: entry.x || 0,
        originY: entry.y || 0
      })),
      startX: event.clientX,
      startY: event.clientY,
      originX: item.x,
      originY: item.y
    };
    return;
  }

  if (event.button === 0) {
    const start = boardPointFromEvent(event, board);
    setInternalBoardSelection([]);
    state.internalBoardSelection = {
      boardId: board.id,
      start,
      current: start
    };
    renderInternalBoards();
  }
});

window.addEventListener("pointermove", (event) => {
  const hoveredBoardArea = event.target.closest?.("[data-board-area]");
  if (hoveredBoardArea) {
    const hoveredBoard = getBoard(hoveredBoardArea.dataset.boardArea);
    if (hoveredBoard) {
      state.internalBoardPointer = {
        boardId: hoveredBoard.id,
        point: boardPointFromEvent(event, hoveredBoard)
      };
    }
  }
  if (state.assetSelection) {
    state.assetSelection.current = { x: event.clientX, y: event.clientY };
    const rect = normalizeRect(state.assetSelection.start, state.assetSelection.current);
    Object.assign(state.assetSelection.box.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    const selected = [...document.querySelectorAll("[data-asset]")]
      .filter((card) => {
        const cardRect = card.getBoundingClientRect();
        return rect.x < cardRect.right && rect.x + rect.width > cardRect.left && rect.y < cardRect.bottom && rect.y + rect.height > cardRect.top;
      })
      .map((card) => card.dataset.asset);
    state.selectedAssetIds = selected;
    state.selectedAssetId = selected.at(-1) || "";
    document.querySelectorAll("[data-asset]").forEach((card) => card.classList.toggle("selected", selected.includes(card.dataset.asset)));
    return;
  }

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

  if (state.internalBoardPanning) {
    const pan = state.internalBoardPanning;
    if (event.pointerId !== pan.pointerId) return;
    const board = getBoard(pan.boardId);
    if (!board) return;
    board.viewport.x = Math.round(pan.originX + event.clientX - pan.startX);
    board.viewport.y = Math.round(pan.originY + event.clientY - pan.startY);
    if (pan.canvas?.isConnected) pan.canvas.style.transform = `translate(${board.viewport.x}px, ${board.viewport.y}px) scale(${board.viewport.scale})`;
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
    if (op.type === "resize") {
      op.item.width = Math.max(60, Math.round(op.originWidth + (event.clientX - op.startX) / board.viewport.scale));
    }
    if (op.type === "rotate") {
      op.item.rotation = Math.round(Math.atan2(event.clientY - op.centerY, event.clientX - op.centerX) * 180 / Math.PI + 90);
    }
    renderInternalBoards();
    return;
  }

  if (state.internalBoardSelection) {
    const board = getBoard(state.internalBoardSelection.boardId);
    if (!board) return;
    state.internalBoardSelection.current = boardPointFromEvent(event, board);
    const rect = normalizeRect(state.internalBoardSelection.start, state.internalBoardSelection.current);
    const selected = board.items
      .filter((item) => rectsIntersect(rect, getBoardItemBounds(board, item)))
      .map((item) => item.id);
    setInternalBoardSelection(selected);
    renderInternalBoards();
  }
});

window.addEventListener("pointerup", async (event) => {
  if (state.assetSelection) {
    state.assetSelection.box.remove();
    state.assetSelection = null;
    renderInspector();
    return;
  }
  if (state.internalBoardPanning) {
    const pan = state.internalBoardPanning;
    if (event.pointerId !== pan.pointerId) return;
    pan.area?.classList.remove("panning");
    if (pan.area?.hasPointerCapture?.(pan.pointerId)) pan.area.releasePointerCapture(pan.pointerId);
    const pannedBoard = pan.board || getBoard(pan.boardId);
    if (pannedBoard) await saveBoard(pannedBoard);
    state.internalBoardPanning = null;
    return;
  }
  const op = state.internalBoardInteraction;
  if (op && op.type !== "window") await saveBoard(op.board || getBoard(op.boardId));
  const hadSelectionBox = Boolean(state.internalBoardSelection);
  if (state.internalBoardSelection) state.internalBoardSelection = null;
  state.boardTabDrag = null;
  state.internalBoardInteraction = null;
  if (hadSelectionBox) renderInternalBoards();
});

window.addEventListener("pointercancel", async (event) => {
  if (state.assetSelection) {
    state.assetSelection.box.remove();
    state.assetSelection = null;
  }
  const pan = state.internalBoardPanning;
  if (!pan || event.pointerId !== pan.pointerId) return;
  pan.area?.classList.remove("panning");
  const board = pan.board || getBoard(pan.boardId);
  if (board) await saveBoard(board);
  state.internalBoardPanning = null;
});

els.viewer.addEventListener("wheel", (event) => {
  if (!state.viewerAssetId) return;
  event.preventDefault();
  state.viewerZoom = Math.min(6, Math.max(0.08, state.viewerZoom * (event.deltaY > 0 ? 0.9 : 1.1)));
  applyViewerTransform();
}, { passive: false });

els.imagePlane.addEventListener("pointerdown", async (event) => {
  if (!state.viewerAssetId) return;
  const handDrag = state.tool === "hand" && event.button === 0;
  if (handDrag || event.button === 1 || event.altKey) {
    event.preventDefault();
    state.viewerDragging = true;
    state.viewerDragPointerId = event.pointerId;
    state.viewerDragStart = { x: event.clientX - state.viewerPan.x, y: event.clientY - state.viewerPan.y };
    els.imagePlane.classList.add("dragging");
    els.imagePlane.setPointerCapture?.(event.pointerId);
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
    if (state.viewerDragPointerId !== event.pointerId) return;
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

window.addEventListener("pointerup", async (event) => {
  if (state.viewerDragging && state.viewerDragPointerId === event.pointerId) {
    els.imagePlane.classList.remove("dragging");
    if (els.imagePlane.hasPointerCapture?.(event.pointerId)) els.imagePlane.releasePointerCapture(event.pointerId);
    state.viewerDragPointerId = null;
  }
  state.viewerDragging = false;
  if (state.drawing) await finishShape();
  state.drawing = false;
});

window.addEventListener("pointercancel", (event) => {
  if (state.viewerDragPointerId !== event.pointerId) return;
  els.imagePlane.classList.remove("dragging");
  state.viewerDragging = false;
  state.viewerDragPointerId = null;
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

  const groupRenameInput = event.target.closest?.("[data-group-name-input]");
  if (groupRenameInput) {
    if (event.key === "Enter") {
      event.preventDefault();
      await commitGroupRename(groupRenameInput);
    }
    if (event.key === "Escape") {
      state.renamingGroupId = "";
      renderAssetGrid();
    }
    return;
  }

  const renameInput = event.target.closest?.("[data-folder-name-input]");
  if (renameInput) {
    if (event.key === "Enter") {
      event.preventDefault();
      await commitFolderRename(renameInput);
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

  if (state.viewerAssetId && event.key === "Escape") {
    event.preventDefault();
    closeViewer();
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
    if (event.key === "ArrowLeft") goViewer(-1);
    if (event.key === "ArrowRight") goViewer(1);
    return;
  }

  if (state.activeBoardId && state.openBoardIds.includes(state.activeBoardId)) {
    if (event.key.toLowerCase() === "t" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const board = getBoard(state.activeBoardId);
      if (board) openInternalBoardTextInput(board);
      return;
    }
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
      scheduleInternalBoardPasteFallback();
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
  setInternalBoardSelection([]);
  render();
});
api.onPrepareToClose?.(async () => {
  clearPendingInternalBoardPaste();
  await flushAllNoteContentSaves();
  const boardsToFlush = getBoardsForClose();
  await state.pendingBoardSave.catch(() => {});
  if (boardsToFlush.length) await api.saveBoards(boardsToFlush);
});
window.addEventListener("beforeunload", () => {
  api.flushBoardsSync?.(getBoardsForClose());
});
applyAppSettings();
api.getLibrary().then(setLibrary);

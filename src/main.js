const { app, BrowserWindow, Menu, dialog, ipcMain, shell, clipboard, nativeImage } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);
app.setPath("userData", path.join(__dirname, "..", ".user-data"));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("in-process-gpu");

const DEFAULT_STATE = {
  assets: [],
  boardAssets: [],
  recycleBin: [],
  folders: [],
  boards: [],
  annotations: {},
  notes: [],
  mindMaps: [],
  settings: {
    libraryPath: "",
    importPath: "",
    recycleRetentionDays: 7
  }
};

let mainWindow;
let state = structuredClone(DEFAULT_STATE);
let statePath = "";
let libraryPath = "";
let importWatcher;
let importing = false;
let boardClipboard = null;
const boardWindows = new Map();
let currentWindowTheme = "palette-b";

const WINDOW_THEMES = {
  "palette-b": { background: "#eadfde", symbol: "#3a2d2b" },
  "mint-brown": { background: "#f2f3ee", symbol: "#483638" },
  "dark-cyan": { background: "#121212", symbol: "#ffffff" },
  "light-rose": { background: "#e6e6dc", symbol: "#2f3430" }
};

function getWindowTheme(themeName = currentWindowTheme) {
  return WINDOW_THEMES[themeName] || WINDOW_THEMES["palette-b"];
}

function applyWindowTheme(win, themeName = currentWindowTheme) {
  if (!win || win.isDestroyed()) return;
  const theme = getWindowTheme(themeName);
  win.setBackgroundColor(theme.background);
  if (typeof win.setTitleBarOverlay === "function") {
    try {
      win.setTitleBarOverlay({
        color: theme.background,
        symbolColor: theme.symbol,
        height: 36
      });
    } catch {
      // Native title bars cannot always be recolored on every Windows setting.
    }
  }
}

function applyWindowThemeToAll(themeName = currentWindowTheme) {
  currentWindowTheme = themeName;
  applyWindowTheme(mainWindow, themeName);
  for (const win of boardWindows.values()) applyWindowTheme(win, themeName);
}

function isBoardWindowOverMainTabs(win) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || !mainWindow.isVisible()) return false;
  if (!win || win.isDestroyed()) return false;

  const mainBounds = mainWindow.getContentBounds();
  const boardBounds = win.getBounds();
  const centerX = boardBounds.x + boardBounds.width / 2;
  const centerY = boardBounds.y + 18;
  const tabZone = {
    left: mainBounds.x + 260,
    right: mainBounds.x + mainBounds.width - 300,
    top: mainBounds.y,
    bottom: mainBounds.y + 64
  };

  return centerX >= tabZone.left
    && centerX <= tabZone.right
    && centerY >= tabZone.top
    && centerY <= tabZone.bottom;
}

function returnBoardToMain(boardId, win) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("board:return-to-main", boardId);
  if (win && !win.isDestroyed()) win.close();
}

function getDefaultLibraryPath() {
  return path.join(__dirname, "..", "library");
}

function createWindow() {
  const rendererEntry = path.join(__dirname, "renderer", "index.html");
  const rendererUrl = pathToFileURL(rendererEntry).toString();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "Design Asset Board",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    backgroundColor: getWindowTheme().background,
    titleBarOverlay: {
      color: getWindowTheme().background,
      symbolColor: getWindowTheme().symbol,
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  applyWindowTheme(mainWindow);

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(rendererEntry);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== rendererUrl) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function broadcastState() {
  const snapshot = cloneState();
  mainWindow?.webContents.send("library-updated", snapshot);
  for (const win of boardWindows.values()) {
    if (!win.isDestroyed()) win.webContents.send("library-updated", snapshot);
  }
}

function createBoardWindow(boardId) {
  if (boardWindows.has(boardId) && !boardWindows.get(boardId).isDestroyed()) {
    const existing = boardWindows.get(boardId);
    existing.show();
    existing.focus();
    return;
  }

  const board = state.boards.find((item) => item.id === boardId);
  if (!board) return;

  const win = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 280,
    minHeight: 320,
    title: board.name,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    backgroundColor: getWindowTheme().background,
    titleBarOverlay: {
      color: getWindowTheme().background,
      symbolColor: getWindowTheme().symbol,
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  boardWindows.set(boardId, win);
  applyWindowTheme(win);
  let canReturnToMain = false;
  setTimeout(() => {
    canReturnToMain = true;
  }, 500);

  win.loadFile(path.join(__dirname, "renderer", "board.html"), { query: { boardId } });
  win.on("move", () => {
    if (canReturnToMain && isBoardWindowOverMainTabs(win)) returnBoardToMain(boardId, win);
  });
  win.on("closed", () => boardWindows.delete(boardId));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (importWatcher) importWatcher.close();
});

function cloneState() {
  return JSON.parse(JSON.stringify(state));
}

function normalizeAssetFolders(asset) {
  if (Array.isArray(asset.folderIds)) return asset.folderIds;
  return asset.folderId ? [asset.folderId] : [];
}

function recycleRetentionMs() {
  const days = Number(state.settings?.recycleRetentionDays || 7);
  return Math.max(1, days) * 24 * 60 * 60 * 1000;
}

function activeAssetIds() {
  return new Set([
    ...state.assets.map((asset) => asset.id),
    ...state.boardAssets.map((asset) => asset.id)
  ]);
}

function ensureLibraryShape(basePath) {
  return Promise.all([
    fsp.mkdir(path.join(basePath, "assets"), { recursive: true }),
    fsp.mkdir(path.join(basePath, "imports"), { recursive: true }),
    fsp.mkdir(path.join(basePath, "meta"), { recursive: true })
  ]);
}

async function loadState(basePath) {
  libraryPath = basePath;
  await ensureLibraryShape(basePath);
  statePath = path.join(basePath, "meta", "state.json");

  try {
    const raw = await fsp.readFile(statePath, "utf8");
    state = { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
    state.settings = { ...DEFAULT_STATE.settings, ...state.settings };
  } catch {
    state = structuredClone(DEFAULT_STATE);
  }

  state.boardAssets = state.boardAssets || [];
  state.recycleBin = state.recycleBin || [];
  state.notes = state.notes || [];
  state.mindMaps = state.mindMaps || [];
  state.settings.recycleRetentionDays = Number(state.settings.recycleRetentionDays || 7);
  const migratedBoardAssets = [];
  state.assets = state.assets.filter((asset) => {
    if (asset.hiddenFromLibrary) {
      const { hiddenFromLibrary, ...boardAsset } = asset;
      migratedBoardAssets.push(boardAsset);
      return false;
    }
    return true;
  });
  state.boardAssets = [...migratedBoardAssets, ...state.boardAssets];

  state.settings.libraryPath = basePath;
  state.settings.importPath = path.join(basePath, "imports");
  await cleanupRecycleBin();
  await saveState();
  startImportWatcher();
  return cloneState();
}

async function saveState() {
  if (!statePath) return;
  await fsp.mkdir(path.dirname(statePath), { recursive: true });
  await fsp.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function cleanupRecycleBin() {
  const now = Date.now();
  const retention = recycleRetentionMs();
  const keep = [];
  const activeIds = activeAssetIds();
  for (const item of state.recycleBin || []) {
    const deletedAt = new Date(item.deletedAt || 0).getTime();
    if (!deletedAt || now - deletedAt < retention) {
      keep.push(item);
      continue;
    }
    const asset = item.asset;
    if (asset?.filePath && !activeIds.has(asset.id)) {
      const assetsDir = path.resolve(libraryPath || getDefaultLibraryPath(), "assets");
      const assetPath = path.resolve(asset.filePath);
      if (assetPath.startsWith(assetsDir + path.sep)) {
        await fsp.rm(assetPath, { force: true }).catch(() => {});
      }
    }
    if (asset?.id) delete state.annotations[asset.id];
  }
  state.recycleBin = keep;
}

async function copyAssetFilesToLibrary(nextBasePath) {
  await ensureLibraryShape(nextBasePath);
  const nextAssetsDir = path.join(nextBasePath, "assets");
  const allAssets = [
    ...state.assets,
    ...state.boardAssets,
    ...(state.recycleBin || []).map((item) => item.asset).filter(Boolean)
  ];
  for (const asset of allAssets) {
    if (!asset?.filePath || !asset?.fileName) continue;
    const nextPath = path.join(nextAssetsDir, asset.fileName);
    if (path.resolve(asset.filePath) !== path.resolve(nextPath)) {
      await fsp.copyFile(asset.filePath, nextPath).catch(() => {});
    }
    asset.filePath = nextPath;
    asset.url = toFileUrl(nextPath);
  }
}

function isImage(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function toFileUrl(filePath) {
  return `file://${filePath.replace(/\\/g, "/")}`;
}

function getAnyAsset(assetId) {
  return state.assets.find((asset) => asset.id === assetId)
    || state.boardAssets.find((asset) => asset.id === assetId)
    || state.recycleBin.find((item) => item.asset?.id === assetId)?.asset;
}

function clipboardImagePayload(image, name = "clipboard.png") {
  if (!image || image.isEmpty()) return null;
  const png = image.toPNG();
  return {
    name,
    type: "image/png",
    hash: hashBuffer(png),
    bytes: png
  };
}

function extensionFromMime(mimeType, fallbackName = "") {
  const extFromName = path.extname(fallbackName).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extFromName)) return extFromName;
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/svg+xml") return ".svg";
  return ".png";
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha1");
  const stream = fs.createReadStream(filePath);
  await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

function hashBuffer(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

async function readImageSize(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = await fsp.readFile(filePath);

  if ((ext === ".png" || buffer.subarray(1, 4).toString() === "PNG") && buffer.length > 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (ext === ".gif" && buffer.length > 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + size;
    }
  }

  if (ext === ".svg") {
    const text = buffer.toString("utf8", 0, Math.min(buffer.length, 4096));
    const width = text.match(/\bwidth=["']?([\d.]+)/i);
    const height = text.match(/\bheight=["']?([\d.]+)/i);
    return {
      width: width ? Math.round(Number(width[1])) : 0,
      height: height ? Math.round(Number(height[1])) : 0
    };
  }

  return { width: 0, height: 0 };
}

async function importFiles(filePaths) {
  if (!libraryPath) throw new Error("请先创建或打开素材库。");
  const added = [];

  for (const sourcePath of filePaths) {
    if (!isImage(sourcePath)) continue;
    const stat = await fsp.stat(sourcePath).catch(() => null);
    if (!stat?.isFile()) continue;

    const hash = await hashFile(sourcePath);
    const existing = state.assets.find((asset) => asset.hash === hash);
    if (existing) continue;

    const ext = path.extname(sourcePath).toLowerCase();
    const id = crypto.randomUUID();
    const fileName = `${id}${ext}`;
    const destPath = path.join(libraryPath, "assets", fileName);
    await fsp.copyFile(sourcePath, destPath);
    const size = await readImageSize(destPath).catch(() => ({ width: 0, height: 0 }));

    const asset = {
      id,
      name: path.basename(sourcePath),
      folderIds: [],
      fileName,
      filePath: destPath,
      url: toFileUrl(destPath),
      ext: ext.replace(".", "").toUpperCase(),
      bytes: stat.size,
      width: size.width,
      height: size.height,
      hash,
      favorite: false,
      importedAt: new Date().toISOString(),
      sourceFolder: path.dirname(sourcePath)
    };

    state.assets.unshift(asset);
    added.push(asset);
  }

  if (added.length) {
    await saveState();
    broadcastState();
  }
  return added;
}

async function importImagePayloads(payloads) {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const added = [];

  for (const payload of payloads) {
    if (!payload?.bytes) continue;
    const buffer = Buffer.from(payload.bytes);
    const hash = hashBuffer(buffer);
    const collection = payload.boardOnly ? state.boardAssets : state.assets;
    const existing = collection.find((asset) => asset.hash === hash);
    if (existing) continue;

    const ext = extensionFromMime(payload.type, payload.name);
    const id = crypto.randomUUID();
    const fileName = `${id}${ext}`;
    const destPath = path.join(libraryPath, "assets", fileName);
    await fsp.writeFile(destPath, buffer);
    const size = await readImageSize(destPath).catch(() => ({ width: 0, height: 0 }));
    const stat = await fsp.stat(destPath);

    const targetFolderExists = payload.folderId && state.folders.some((folder) => folder.id === payload.folderId);
    const asset = {
      id,
      name: payload.name || `粘贴图片-${new Date().toISOString().replace(/[:.]/g, "-")}${ext}`,
      folderIds: targetFolderExists ? [payload.folderId] : [],
      fileName,
      filePath: destPath,
      url: toFileUrl(destPath),
      ext: ext.replace(".", "").toUpperCase(),
      bytes: stat.size,
      width: size.width,
      height: size.height,
      hash,
      favorite: false,
      importedAt: new Date().toISOString(),
      sourceFolder: "software-paste-or-drop"
    };

    collection.unshift(asset);
    added.push(asset);
  }

  if (added.length) {
    await saveState();
    broadcastState();
  }
  return added;
}

async function scanImportFolder() {
  if (importing || !state.settings.importPath) return;
  importing = true;
  try {
    const entries = await fsp.readdir(state.settings.importPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(state.settings.importPath, entry.name))
      .filter(isImage);
    await importFiles(files);
  } finally {
    importing = false;
  }
}

function startImportWatcher() {
  if (importWatcher) importWatcher.close();
  if (!state.settings.importPath) return;

  importWatcher = fs.watch(state.settings.importPath, { persistent: true }, () => {
    setTimeout(scanImportFolder, 350);
  });
  scanImportFolder();
}

ipcMain.handle("library:create-or-open", async () => loadState(getDefaultLibraryPath()));

ipcMain.handle("library:get", async () => {
  if (!libraryPath) return loadState(getDefaultLibraryPath());
  return cloneState();
});

ipcMain.handle("library:open-import-folder", async () => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  await shell.openPath(libraryPath);
  return true;
});

ipcMain.handle("library:set-recycle-retention", async (_event, days) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  state.settings.recycleRetentionDays = Math.max(1, Math.min(365, Number(days) || 7));
  await cleanupRecycleBin();
  await saveState();
  broadcastState();
  return cloneState();
});

ipcMain.handle("library:choose-path", async () => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择素材统一保存位置",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return cloneState();
  const nextBasePath = result.filePaths[0];
  await copyAssetFilesToLibrary(nextBasePath);
  libraryPath = nextBasePath;
  statePath = path.join(nextBasePath, "meta", "state.json");
  state.settings.libraryPath = nextBasePath;
  state.settings.importPath = path.join(nextBasePath, "imports");
  await saveState();
  if (importWatcher) importWatcher.close();
  startImportWatcher();
  broadcastState();
  return cloneState();
});

ipcMain.handle("library:reveal-file", async (_event, assetId) => {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return false;
  shell.showItemInFolder(asset.filePath);
  return true;
});

ipcMain.handle("assets:import-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "导入图片素材",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif", "svg"] }]
  });
  if (result.canceled) return [];
  return importFiles(result.filePaths);
});

ipcMain.handle("assets:import-image-data", async (_event, payloads) => importImagePayloads(payloads));

ipcMain.handle("clipboard:write-asset-image", async (_event, assetId) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const asset = getAnyAsset(assetId);
  if (!asset?.filePath) return { ok: false, hash: "" };
  let image = nativeImage.createFromPath(asset.filePath);
  if (image.isEmpty()) {
    const buffer = await fsp.readFile(asset.filePath).catch(() => null);
    if (buffer) image = nativeImage.createFromBuffer(buffer);
  }
  if (image.isEmpty()) return { ok: false, hash: "" };
  clipboard.writeImage(image);
  const payload = clipboardImagePayload(image, asset.name || "clipboard.png");
  return { ok: true, hash: payload?.hash || "" };
});

ipcMain.handle("clipboard:read-image", async () => {
  const image = clipboard.readImage();
  return clipboardImagePayload(image, `clipboard-${Date.now()}.png`);
});

ipcMain.handle("board-clipboard:write", async (_event, payload) => {
  boardClipboard = payload ? JSON.parse(JSON.stringify(payload)) : null;
  return Boolean(boardClipboard);
});

ipcMain.handle("board-clipboard:read", async () => {
  return boardClipboard ? JSON.parse(JSON.stringify(boardClipboard)) : null;
});

ipcMain.handle("assets:toggle-favorite", async (_event, assetId) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return null;
  asset.favorite = !asset.favorite;
  await saveState();
  return cloneState();
});

ipcMain.handle("assets:set-note", async (_event, assetId, note) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const target = state.assets.find((item) => item.id === assetId)
    || state.recycleBin.find((item) => item.asset?.id === assetId)?.asset;
  if (!target) return cloneState();
  const text = String(note || "");
  state.notes = (state.notes || []).filter((item) => item.assetId !== assetId);
  if (text.trim()) {
    state.notes.unshift({
      assetId,
      text,
      updatedAt: new Date().toISOString()
    });
  }
  await saveState();
  broadcastState();
  return cloneState();
});

ipcMain.handle("assets:delete", async (_event, assetId) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return cloneState();

  state.assets = state.assets.filter((item) => item.id !== assetId);
  state.recycleBin = [
    { asset, deletedAt: new Date().toISOString() },
    ...(state.recycleBin || []).filter((item) => item.asset?.id !== assetId)
  ];
  state.boards = state.boards.map((board) => ({
    ...board,
    items: board.items.filter((item) => item.assetId !== assetId)
  }));

  await saveState();
  broadcastState();
  return cloneState();
});

ipcMain.handle("assets:restore", async (_event, assetId) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const item = (state.recycleBin || []).find((entry) => entry.asset?.id === assetId);
  if (!item?.asset) return cloneState();
  if (!state.assets.some((asset) => asset.id === assetId)) state.assets.unshift(item.asset);
  state.recycleBin = state.recycleBin.filter((entry) => entry.asset?.id !== assetId);
  await saveState();
  broadcastState();
  return cloneState();
});

ipcMain.handle("assets:purge-recycled", async (_event, assetId = "") => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const activeIds = activeAssetIds();
  const targets = assetId
    ? (state.recycleBin || []).filter((entry) => entry.asset?.id === assetId)
    : (state.recycleBin || []);
  const assetsDir = path.resolve(libraryPath || getDefaultLibraryPath(), "assets");
  for (const item of targets) {
    const asset = item.asset;
    if (asset?.filePath && !activeIds.has(asset.id)) {
      const assetPath = path.resolve(asset.filePath);
      if (assetPath.startsWith(assetsDir + path.sep)) await fsp.rm(assetPath, { force: true }).catch(() => {});
    }
    if (asset?.id) delete state.annotations[asset.id];
  }
  const targetIds = new Set(targets.map((item) => item.asset?.id).filter(Boolean));
  state.notes = (state.notes || []).filter((note) => !targetIds.has(note.assetId));
  state.recycleBin = (state.recycleBin || []).filter((item) => !targetIds.has(item.asset?.id));
  await saveState();
  broadcastState();
  return cloneState();
});

ipcMain.handle("assets:set-folder-membership", async (_event, assetId, folderId, inFolder) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return cloneState();
  const targetFolderExists = state.folders.some((folder) => folder.id === folderId);
  if (!targetFolderExists) return cloneState();
  const folderIds = new Set(normalizeAssetFolders(asset));
  if (inFolder) folderIds.add(folderId);
  else folderIds.delete(folderId);
  asset.folderIds = [...folderIds];
  delete asset.folderId;
  await saveState();
  return cloneState();
});

ipcMain.handle("folders:create", async (_event, name, parentId = "") => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const targetParent = parentId && state.folders.some((folder) => folder.id === parentId) ? parentId : "";
  const folder = {
    id: crypto.randomUUID(),
    name: name || `文件夹 ${state.folders.length + 1}`,
    parentId: targetParent,
    createdAt: new Date().toISOString()
  };
  state.folders.unshift(folder);
  await saveState();
  return cloneState();
});

ipcMain.handle("folders:rename", async (_event, folderId, name) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) return cloneState();
  const nextName = String(name || "").trim();
  if (!nextName) return cloneState();
  folder.name = nextName;
  await saveState();
  return cloneState();
});

ipcMain.handle("folders:delete", async (_event, folderId) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) return cloneState();
  const idsToDelete = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of state.folders) {
      if (item.parentId && idsToDelete.has(item.parentId) && !idsToDelete.has(item.id)) {
        idsToDelete.add(item.id);
        changed = true;
      }
    }
  }
  state.folders = state.folders.filter((item) => !idsToDelete.has(item.id));
  state.assets = state.assets.map((asset) => ({
    ...asset,
    folderIds: normalizeAssetFolders(asset).filter((id) => !idsToDelete.has(id))
  }));
  await saveState();
  broadcastState();
  return cloneState();
});

ipcMain.handle("boards:create", async (_event, name) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const board = {
    id: crypto.randomUUID(),
    name: name || `画板 ${state.boards.length + 1}`,
    createdAt: new Date().toISOString(),
    items: [],
    viewport: { x: 0, y: 0, scale: 1 }
  };
  state.boards.unshift(board);
  await saveState();
  return cloneState();
});

ipcMain.handle("boards:rename", async (_event, boardId, name) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const board = state.boards.find((item) => item.id === boardId);
  if (!board) return cloneState();
  const nextName = String(name || "").trim();
  if (!nextName) return cloneState();
  board.name = nextName;
  const boardWindow = boardWindows.get(boardId);
  if (boardWindow && !boardWindow.isDestroyed()) boardWindow.setTitle(nextName);
  await saveState();
  broadcastState();
  return cloneState();
});

ipcMain.handle("boards:delete", async (_event, boardId) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const board = state.boards.find((item) => item.id === boardId);
  if (!board) return cloneState();
  const boardWindow = boardWindows.get(boardId);
  if (boardWindow && !boardWindow.isDestroyed()) boardWindow.close();
  state.boards = state.boards.filter((item) => item.id !== boardId);
  const referencedBoardAssetIds = new Set(
    state.boards.flatMap((item) => item.items.map((boardItem) => boardItem.assetId))
  );
  const orphanedBoardAssets = state.boardAssets.filter((asset) => !referencedBoardAssetIds.has(asset.id));
  for (const asset of orphanedBoardAssets) {
    const assetsDir = path.resolve(libraryPath || getDefaultLibraryPath(), "assets");
    const assetPath = path.resolve(asset.filePath);
    if (assetPath.startsWith(assetsDir + path.sep)) {
      await fsp.rm(assetPath, { force: true }).catch(() => {});
    }
  }
  state.boardAssets = state.boardAssets.filter((asset) => referencedBoardAssetIds.has(asset.id));
  await saveState();
  broadcastState();
  return cloneState();
});

ipcMain.handle("boards:open-floating", async (_event, boardId) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  createBoardWindow(boardId);
  return true;
});

ipcMain.handle("window:set-always-on-top", async (event, enabled) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  win.setAlwaysOnTop(Boolean(enabled), Boolean(enabled) ? "screen-saver" : "normal");
  if (enabled) win.moveTop();
  return win.isAlwaysOnTop();
});

ipcMain.handle("window:set-theme", async (_event, themeName) => {
  applyWindowThemeToAll(String(themeName || "palette-b"));
  return true;
});

ipcMain.handle("boards:save", async (_event, board) => {
  if (!libraryPath) await loadState(getDefaultLibraryPath());
  const index = state.boards.findIndex((item) => item.id === board.id);
  if (index === -1) return cloneState();
  state.boards[index] = board;
  const referencedBoardAssetIds = new Set(
    state.boards.flatMap((item) => item.items.map((boardItem) => boardItem.assetId))
  );
  const orphanedBoardAssets = state.boardAssets.filter((asset) => !referencedBoardAssetIds.has(asset.id));
  for (const asset of orphanedBoardAssets) {
    const assetsDir = path.resolve(libraryPath || getDefaultLibraryPath(), "assets");
    const assetPath = path.resolve(asset.filePath);
    if (assetPath.startsWith(assetsDir + path.sep)) {
      await fsp.rm(assetPath, { force: true }).catch(() => {});
    }
  }
  state.boardAssets = state.boardAssets.filter((asset) => referencedBoardAssetIds.has(asset.id));
  await saveState();
  broadcastState();
  return cloneState();
});

ipcMain.handle("annotations:save", async (_event, assetId, annotations) => {
  state.annotations[assetId] = annotations;
  await saveState();
  return cloneState();
});

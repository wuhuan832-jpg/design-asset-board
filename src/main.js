const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);
const DEFAULT_STATE = {
  assets: [],
  boards: [],
  annotations: {},
  settings: {
    libraryPath: "",
    importPath: ""
  }
};

let mainWindow;
let state = structuredClone(DEFAULT_STATE);
let statePath = "";
let libraryPath = "";
let importWatcher;
let importing = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "Design Asset Board",
    backgroundColor: "#f4f2ed",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
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

  state.settings.libraryPath = basePath;
  state.settings.importPath = path.join(basePath, "imports");
  await saveState();
  startImportWatcher();
  return cloneState();
}

async function saveState() {
  if (!statePath) return;
  await fsp.mkdir(path.dirname(statePath), { recursive: true });
  await fsp.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

function isImage(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function toFileUrl(filePath) {
  return `file://${filePath.replace(/\\/g, "/")}`;
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
    mainWindow?.webContents.send("library-updated", cloneState());
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

ipcMain.handle("library:create-or-open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择或创建素材库文件夹",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return loadState(result.filePaths[0]);
});

ipcMain.handle("library:get", async () => cloneState());

ipcMain.handle("library:open-import-folder", async () => {
  if (!state.settings.importPath) return false;
  await shell.openPath(state.settings.importPath);
  return true;
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

ipcMain.handle("assets:toggle-favorite", async (_event, assetId) => {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return null;
  asset.favorite = !asset.favorite;
  await saveState();
  return cloneState();
});

ipcMain.handle("boards:create", async (_event, name) => {
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

ipcMain.handle("boards:save", async (_event, board) => {
  const index = state.boards.findIndex((item) => item.id === board.id);
  if (index === -1) return cloneState();
  state.boards[index] = board;
  await saveState();
  return cloneState();
});

ipcMain.handle("annotations:save", async (_event, assetId, annotations) => {
  state.annotations[assetId] = annotations;
  await saveState();
  return cloneState();
});

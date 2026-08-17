const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("assetBoard", {
  createOrOpenLibrary: () => ipcRenderer.invoke("library:create-or-open"),
  getLibrary: () => ipcRenderer.invoke("library:get"),
  openImportFolder: () => ipcRenderer.invoke("library:open-import-folder"),
  chooseLibraryPath: () => ipcRenderer.invoke("library:choose-path"),
  setRecycleRetention: (days) => ipcRenderer.invoke("library:set-recycle-retention", days),
  revealFile: (assetId) => ipcRenderer.invoke("library:reveal-file", assetId),
  importImages: () => ipcRenderer.invoke("assets:import-dialog"),
  importImageData: (payloads) => ipcRenderer.invoke("assets:import-image-data", payloads),
  writeAssetToClipboard: (assetId) => ipcRenderer.invoke("clipboard:write-asset-image", assetId),
  readClipboardImage: () => ipcRenderer.invoke("clipboard:read-image"),
  writeBoardClipboard: (payload) => ipcRenderer.invoke("board-clipboard:write", payload),
  readBoardClipboard: () => ipcRenderer.invoke("board-clipboard:read"),
  toggleFavorite: (assetId) => ipcRenderer.invoke("assets:toggle-favorite", assetId),
  setAssetNote: (assetId, note) => ipcRenderer.invoke("assets:set-note", assetId, note),
  deleteAsset: (assetId) => ipcRenderer.invoke("assets:delete", assetId),
  restoreAsset: (assetId) => ipcRenderer.invoke("assets:restore", assetId),
  purgeRecycledAsset: (assetId = "") => ipcRenderer.invoke("assets:purge-recycled", assetId),
  setFolderMembership: (assetId, folderId, inFolder) => ipcRenderer.invoke("assets:set-folder-membership", assetId, folderId, inFolder),
  createFolder: (name, parentId = "") => ipcRenderer.invoke("folders:create", name, parentId),
  renameFolder: (folderId, name) => ipcRenderer.invoke("folders:rename", folderId, name),
  deleteFolder: (folderId) => ipcRenderer.invoke("folders:delete", folderId),
  createGroup: (folderId, name = "") => ipcRenderer.invoke("groups:create", folderId, name),
  createGroupFromAssets: (folderId, assetIds, name = "") => ipcRenderer.invoke("groups:create-from-assets", folderId, assetIds, name),
  updateGroup: (groupId, patch) => ipcRenderer.invoke("groups:update", groupId, patch),
  deleteGroup: (groupId) => ipcRenderer.invoke("groups:delete", groupId),
  setAssetGroup: (folderId, assetId, groupId = "") => ipcRenderer.invoke("groups:set-asset", folderId, assetId, groupId),
  createNotePage: () => ipcRenderer.invoke("note-pages:create"),
  importNoteImages: (noteId, payloads) => ipcRenderer.invoke("note-pages:import-images", noteId, payloads),
  updateNotePage: (noteId, patch) => ipcRenderer.invoke("note-pages:update", noteId, patch),
  deleteNotePage: (noteId) => ipcRenderer.invoke("note-pages:delete", noteId),
  createBoard: (name) => ipcRenderer.invoke("boards:create", name),
  renameBoard: (boardId, name) => ipcRenderer.invoke("boards:rename", boardId, name),
  deleteBoard: (boardId) => ipcRenderer.invoke("boards:delete", boardId),
  openFloatingBoard: (boardId) => ipcRenderer.invoke("boards:open-floating", boardId),
  saveBoard: (board) => ipcRenderer.invoke("boards:save", board),
  saveBoards: (boards) => ipcRenderer.invoke("boards:save-many", boards),
  flushBoardsSync: (boards) => ipcRenderer.sendSync("boards:flush-sync", boards),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("window:set-always-on-top", enabled),
  setWindowTheme: (theme) => ipcRenderer.invoke("window:set-theme", theme),
  saveAnnotations: (assetId, annotations) => ipcRenderer.invoke("annotations:save", assetId, annotations),
  onLibraryUpdated: (callback) => {
    ipcRenderer.on("library-updated", (_event, state) => callback(state));
  },
  onBoardReturned: (callback) => {
    ipcRenderer.on("board:return-to-main", (_event, boardId) => callback(boardId));
  },
  onPrepareToClose: (callback) => {
    ipcRenderer.on("app:prepare-to-close", async (_event, token) => {
      try {
        await callback();
      } finally {
        ipcRenderer.send("app:close-ready", token);
      }
    });
  }
});

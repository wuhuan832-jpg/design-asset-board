const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("assetBoard", {
  createOrOpenLibrary: () => ipcRenderer.invoke("library:create-or-open"),
  getLibrary: () => ipcRenderer.invoke("library:get"),
  openImportFolder: () => ipcRenderer.invoke("library:open-import-folder"),
  revealFile: (assetId) => ipcRenderer.invoke("library:reveal-file", assetId),
  importImages: () => ipcRenderer.invoke("assets:import-dialog"),
  toggleFavorite: (assetId) => ipcRenderer.invoke("assets:toggle-favorite", assetId),
  createBoard: (name) => ipcRenderer.invoke("boards:create", name),
  saveBoard: (board) => ipcRenderer.invoke("boards:save", board),
  saveAnnotations: (assetId, annotations) => ipcRenderer.invoke("annotations:save", assetId, annotations),
  onLibraryUpdated: (callback) => {
    ipcRenderer.on("library-updated", (_event, state) => callback(state));
  }
});

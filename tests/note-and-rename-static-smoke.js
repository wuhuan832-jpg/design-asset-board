const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const renderer = fs.readFileSync(path.join(root, "src", "renderer", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "renderer", "styles.css"), "utf8");
const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");

const checks = {
  viewerHandTool: renderer.includes('state.tool === "hand" && event.button === 0')
    && renderer.includes('els.imagePlane.setPointerCapture?.(event.pointerId)')
    && renderer.includes('setTool("hand");')
    && renderer.includes('tool: "hand"')
    && styles.includes('.viewer.hand-tool #annotationCanvas'),
  viewerBlankClickCloses: renderer.includes('if (event.target === els.viewerBody) closeViewer();'),
  blankClickRenameCommit: renderer.includes('document.addEventListener("pointerdown", commitInlineRenameBeforePointerAction, true)'),
  fixedDocumentMarkup: renderer.includes('contenteditable="true"') && !renderer.includes('data-note-resize="${escapeHtml(note.id)}"'),
  fixedDocumentSize: /\.note-page\s*\{[\s\S]*?width:\s*720px;[\s\S]*?height:\s*900px;/.test(styles),
  imagePasteAtCaret: renderer.includes("pasteImagesIntoNote(noteEditor, files)") && renderer.includes("insertNodeAtRange(range, image)"),
  nativeClipboardFallback: renderer.includes("await readClipboardImageFiles()"),
  noteImageIpc: preload.includes("note-pages:import-images") && main.includes('ipcMain.handle("note-pages:import-images"'),
  richContentPersistence: main.includes('"content"') && renderer.includes("sanitizeNoteContent(editor)"),
  removedMoveResizePersistence: !main.includes('"content", "paper", "fontFamily", "fontSize", "color", "x"')
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  throw new Error(`Failed checks: ${failed.join(", ")} ${JSON.stringify(checks)}`);
}

console.log(`PASS: ${JSON.stringify(checks)}`);

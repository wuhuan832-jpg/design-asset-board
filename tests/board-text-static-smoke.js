const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const mainRenderer = fs.readFileSync(path.join(root, "src", "renderer", "app.js"), "utf8");
const floatingRenderer = fs.readFileSync(path.join(root, "src", "renderer", "board-window.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "renderer", "styles.css"), "utf8");
const mainProcess = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");

const checks = {
  mainBoardCreatesText: mainRenderer.includes('type: "text"') && mainRenderer.includes("openInternalBoardTextInput"),
  floatingBoardCreatesText: floatingRenderer.includes('type: "text"') && floatingRenderer.includes("openBoardTextInput"),
  mainBoardHasTShortcut: mainRenderer.includes('event.key.toLowerCase() === "t"'),
  floatingBoardHasTShortcut: floatingRenderer.includes('event.key.toLowerCase() === "t"'),
  textIsRenderedOnBothBoards: [mainRenderer, floatingRenderer].every((source) => source.includes("board-text-content")),
  inputIsTemporary: [mainRenderer, floatingRenderer].every((source) => source.includes("board-text-entry") && source.includes('event.key === "Escape"')),
  textStylesExist: styles.includes(".board-text-content") && styles.includes(".board-text-entry"),
  boardViewportCulling: [mainRenderer, floatingRenderer].every((source) => source.includes("getVisibleBoardItems"))
    && [mainRenderer, floatingRenderer].every((source) => source.includes('decoding="async"')),
  boardPersistenceKeepsFullItem: mainProcess.includes("state.boards[index] = board")
};

const failed = Object.entries(checks).filter(([, passed]) => !passed);
if (failed.length) {
  console.error("Board text smoke test failed:", failed.map(([name]) => name).join(", "));
  process.exit(1);
}

console.log(`Board text smoke test passed (${Object.keys(checks).length} checks).`);

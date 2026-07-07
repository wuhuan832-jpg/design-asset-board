const api = window.assetBoard;

const els = {
  openLibraryBtn: document.querySelector("#openLibraryBtn"),
  openImportBtn: document.querySelector("#openImportBtn"),
  importBtn: document.querySelector("#importBtn"),
  newBoardBtn: document.querySelector("#newBoardBtn"),
  assetGrid: document.querySelector("#assetGrid"),
  quickAssetList: document.querySelector("#quickAssetList"),
  boardList: document.querySelector("#boardList"),
  boardStage: document.querySelector("#boardStage"),
  boardCanvas: document.querySelector("#boardCanvas"),
  infiniteBoard: document.querySelector("#infiniteBoard"),
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  allCount: document.querySelector("#allCount"),
  libraryPath: document.querySelector("#libraryPath"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  assetInfo: document.querySelector("#assetInfo"),
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
  library: { assets: [], boards: [], annotations: {}, settings: {} },
  view: "all",
  currentBoardId: "",
  selectedAssetId: "",
  viewerAssetId: "",
  viewerZoom: 1,
  viewerPan: { x: 0, y: 0 },
  viewerDragging: false,
  viewerDragStart: { x: 0, y: 0 },
  boardDragging: null,
  boardPanning: false,
  boardPanStart: { x: 0, y: 0 },
  tool: "pen",
  annotationsVisible: true,
  drawing: false,
  draftShape: null
};

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

function getAssetsForView() {
  let assets = [...state.library.assets];
  if (state.view === "recent") assets = assets.slice(0, 60);
  if (state.view === "favorite") assets = assets.filter((asset) => asset.favorite);

  const keyword = els.searchInput.value.trim().toLowerCase();
  if (keyword) assets = assets.filter((asset) => asset.name.toLowerCase().includes(keyword));

  const sort = els.sortSelect.value;
  if (sort === "largest") {
    assets.sort((a, b) => b.width * b.height - a.width * a.height);
  } else if (sort === "name") {
    assets.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  } else {
    assets.sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
  }
  return assets;
}

function getAsset(assetId) {
  return state.library.assets.find((asset) => asset.id === assetId);
}

function getBoard() {
  return state.library.boards.find((board) => board.id === state.currentBoardId);
}

function setLibrary(nextState) {
  if (!nextState) return;
  state.library = nextState;
  if (!state.currentBoardId && nextState.boards[0]) state.currentBoardId = nextState.boards[0].id;
  render();
}

function render() {
  els.allCount.textContent = state.library.assets.length;
  els.libraryPath.textContent = state.library.settings?.libraryPath || "未选择";
  renderNavigation();
  renderMain();
  renderInspector();
}

function renderNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view && !state.currentBoardId);
  });

  els.boardList.innerHTML = state.library.boards
    .map((board) => `
      <button class="board-link ${board.id === state.currentBoardId ? "active" : ""}" data-board="${board.id}">
        <span>${board.name}</span>
        <small>${board.items.length} 张</small>
      </button>
    `)
    .join("");
}

function renderMain() {
  const board = getBoard();
  if (board) {
    els.assetGrid.classList.add("hidden");
    els.boardStage.classList.remove("hidden");
    els.viewTitle.textContent = board.name;
    els.viewSubtitle.textContent = "无限画板：拖拽图片整理参考，滚轮缩放画布。";
    renderBoard(board);
    return;
  }

  els.assetGrid.classList.remove("hidden");
  els.boardStage.classList.add("hidden");
  const title = { all: "全部素材", recent: "最近导入", favorite: "收藏" }[state.view];
  els.viewTitle.textContent = title;
  els.viewSubtitle.textContent = "把图片复制到导入文件夹，或手动导入图片。";
  renderAssetGrid();
}

function renderAssetGrid() {
  const assets = getAssetsForView();
  if (!assets.length) {
    els.assetGrid.innerHTML = `
      <div class="empty-state">
        <h3>还没有可浏览的图片</h3>
        <p>先创建素材库，再把 JPG、PNG、WebP、GIF 或 SVG 放进导入文件夹。</p>
      </div>
    `;
    return;
  }

  els.assetGrid.innerHTML = assets
    .map((asset) => `
      <article class="asset-card ${asset.id === state.selectedAssetId ? "selected" : ""}" data-asset="${asset.id}">
        <button class="favorite ${asset.favorite ? "on" : ""}" data-favorite="${asset.id}" title="收藏">★</button>
        <div class="thumb"><img src="${asset.url}" alt="${asset.name}" loading="lazy" /></div>
        <div class="asset-caption">
          <strong>${asset.name}</strong>
          <span>${asset.width || "-"} × ${asset.height || "-"} · ${asset.ext}</span>
        </div>
      </article>
    `)
    .join("");
}

function renderInspector() {
  const selected = getAsset(state.selectedAssetId);
  if (!selected) {
    els.assetInfo.innerHTML = `<div class="empty-info">选择一张图片查看信息</div>`;
  } else {
    els.assetInfo.innerHTML = `
      <div class="preview"><img src="${selected.url}" alt="${selected.name}" /></div>
      <dl>
        <dt>文件名</dt><dd>${selected.name}</dd>
        <dt>尺寸</dt><dd>${selected.width || "-"} × ${selected.height || "-"}</dd>
        <dt>格式</dt><dd>${selected.ext}</dd>
        <dt>大小</dt><dd>${formatBytes(selected.bytes)}</dd>
        <dt>导入</dt><dd>${formatDate(selected.importedAt)}</dd>
      </dl>
      <div class="inspector-actions">
        <button data-open-viewer="${selected.id}">高清查看</button>
        <button data-reveal="${selected.id}">定位文件</button>
      </div>
    `;
  }

  const board = getBoard();
  const recentAssets = state.library.assets.slice(0, 24);
  els.quickAssetList.innerHTML = recentAssets.length
    ? recentAssets
        .map((asset) => `
          <button class="quick-asset" data-add-to-board="${asset.id}" ${board ? "" : "disabled"}>
            <img src="${asset.url}" alt="${asset.name}" />
            <span>${asset.name}</span>
          </button>
        `)
        .join("")
    : `<p class="muted">导入图片后可快速加入当前画板。</p>`;
}

function renderBoard(board) {
  const { x, y, scale } = board.viewport;
  els.boardCanvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  els.boardCanvas.innerHTML = board.items
    .map((item) => {
      const asset = getAsset(item.assetId);
      if (!asset) return "";
      return `
        <div class="board-item" data-board-item="${item.id}" style="left:${item.x}px; top:${item.y}px; width:${item.width}px;">
          <img src="${asset.url}" alt="${asset.name}" draggable="false" />
          <span>${asset.name}</span>
        </div>
      `;
    })
    .join("");
}

async function createBoard() {
  const name = prompt("画板名称", `参考画板 ${state.library.boards.length + 1}`);
  const next = await api.createBoard(name || "");
  setLibrary(next);
  state.currentBoardId = next.boards[0]?.id || "";
  render();
}

async function addAssetToBoard(assetId) {
  const board = getBoard();
  const asset = getAsset(assetId);
  if (!board || !asset) return;

  const aspect = asset.width && asset.height ? asset.height / asset.width : 0.72;
  board.items.push({
    id: window.crypto.randomUUID(),
    assetId,
    x: Math.round((-board.viewport.x + 160) / board.viewport.scale),
    y: Math.round((-board.viewport.y + 120) / board.viewport.scale),
    width: 260,
    height: Math.round(260 * aspect)
  });
  setLibrary(await api.saveBoard(board));
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
  els.viewerMeta.innerHTML = `
    <strong>${asset.name}</strong>
    <span>${asset.width || "-"} × ${asset.height || "-"} · ${formatBytes(asset.bytes)}</span>
  `;
  els.toggleAnnotationsBtn.textContent = state.annotationsVisible ? "隐藏批注" : "显示批注";
  els.filmstrip.innerHTML = getAssetsForView()
    .map((item) => `
      <button class="${item.id === asset.id ? "active" : ""}" data-film="${item.id}">
        <img src="${item.url}" alt="${item.name}" />
      </button>
    `)
    .join("");
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
  const availableWidth = body.clientWidth - 340;
  const availableHeight = body.clientHeight - 80;
  const naturalWidth = asset.width || els.viewerImage.naturalWidth || 1;
  const naturalHeight = asset.height || els.viewerImage.naturalHeight || 1;
  state.viewerZoom = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1);
  state.viewerPan = { x: 40, y: 40 };
  els.imagePlane.style.width = `${naturalWidth}px`;
  els.imagePlane.style.height = `${naturalHeight}px`;
  applyViewerTransform();
}

function actualViewer() {
  state.viewerZoom = 1;
  state.viewerPan = { x: 40, y: 40 };
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
    shape.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  }

  if (shape.type === "rect") {
    ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
  }

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
  const annotations = getAnnotations();
  await persistAnnotations([...annotations, state.draftShape]);
  state.draftShape = null;
}

function goViewer(direction) {
  const assets = getAssetsForView();
  const index = assets.findIndex((asset) => asset.id === state.viewerAssetId);
  const next = assets[index + direction];
  if (next) openViewer(next.id);
}

els.openLibraryBtn.addEventListener("click", async () => setLibrary(await api.createOrOpenLibrary()));
els.openImportBtn.addEventListener("click", () => api.openImportFolder());
els.importBtn.addEventListener("click", async () => {
  await api.importImages();
  setLibrary(await api.getLibrary());
});
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
els.undoBtn.addEventListener("click", async () => {
  const annotations = getAnnotations().slice(0, -1);
  await persistAnnotations(annotations);
});
els.clearBtn.addEventListener("click", async () => {
  if (confirm("清除当前图片的全部批注？")) await persistAnnotations([]);
});

document.addEventListener("click", async (event) => {
  const nav = event.target.closest(".nav-item");
  if (nav) {
    state.view = nav.dataset.view;
    state.currentBoardId = "";
    render();
  }

  const boardLink = event.target.closest("[data-board]");
  if (boardLink) {
    state.currentBoardId = boardLink.dataset.board;
    render();
  }

  const card = event.target.closest("[data-asset]");
  if (card && !event.target.closest("[data-favorite]")) {
    state.selectedAssetId = card.dataset.asset;
    if (event.detail === 2) openViewer(card.dataset.asset);
    render();
  }

  const favorite = event.target.closest("[data-favorite]");
  if (favorite) setLibrary(await api.toggleFavorite(favorite.dataset.favorite));

  const open = event.target.closest("[data-open-viewer]");
  if (open) openViewer(open.dataset.openViewer);

  const reveal = event.target.closest("[data-reveal]");
  if (reveal) api.revealFile(reveal.dataset.reveal);

  const add = event.target.closest("[data-add-to-board]");
  if (add && !add.disabled) addAssetToBoard(add.dataset.addToBoard);

  const film = event.target.closest("[data-film]");
  if (film) openViewer(film.dataset.film);

  const tool = event.target.closest("[data-tool]");
  if (tool) setTool(tool.dataset.tool);
});

els.infiniteBoard.addEventListener("wheel", async (event) => {
  const board = getBoard();
  if (!board) return;
  event.preventDefault();
  const delta = event.deltaY > 0 ? 0.92 : 1.08;
  board.viewport.scale = Math.min(2.5, Math.max(0.2, board.viewport.scale * delta));
  renderBoard(board);
  await api.saveBoard(board);
});

els.infiniteBoard.addEventListener("pointerdown", (event) => {
  const board = getBoard();
  if (!board) return;
  const itemEl = event.target.closest("[data-board-item]");
  if (itemEl) {
    const item = board.items.find((entry) => entry.id === itemEl.dataset.boardItem);
    state.boardDragging = {
      item,
      startX: event.clientX,
      startY: event.clientY,
      originX: item.x,
      originY: item.y
    };
  } else {
    state.boardPanning = true;
    state.boardPanStart = { x: event.clientX - board.viewport.x, y: event.clientY - board.viewport.y };
  }
});

window.addEventListener("pointermove", (event) => {
  const board = getBoard();
  if (state.boardDragging && board) {
    const { item, startX, startY, originX, originY } = state.boardDragging;
    item.x = Math.round(originX + (event.clientX - startX) / board.viewport.scale);
    item.y = Math.round(originY + (event.clientY - startY) / board.viewport.scale);
    renderBoard(board);
  }
  if (state.boardPanning && board) {
    board.viewport.x = event.clientX - state.boardPanStart.x;
    board.viewport.y = event.clientY - state.boardPanStart.y;
    renderBoard(board);
  }
});

window.addEventListener("pointerup", async () => {
  const board = getBoard();
  if ((state.boardDragging || state.boardPanning) && board) await api.saveBoard(board);
  state.boardDragging = null;
  state.boardPanning = false;
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

  const point = viewerPoint(event);
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
    const text = prompt("批注文字");
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

window.addEventListener("keydown", (event) => {
  if (!state.viewerAssetId) return;
  if (event.key === "Escape") closeViewer();
  if (event.key === "ArrowLeft") goViewer(-1);
  if (event.key === "ArrowRight") goViewer(1);
});

api.onLibraryUpdated(setLibrary);
api.getLibrary().then(setLibrary);

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const state = {
  templates: [],
  selectedTemplate: null,
  templateImage: null,
  cropBox: null,
  layers: [],
  layerBoxes: new Map(),
};

const templateGrid = document.getElementById("templates");
const fontSelect = document.getElementById("fontSelect");
const colorInput = document.getElementById("textColor");
const outlineInput = document.getElementById("outlineColor");
const uppercaseInput = document.getElementById("uppercase");
const sizeInput = document.getElementById("sizePct");
const cropSelect = document.getElementById("cropMode");
const captionInput = document.getElementById("caption");
const downloadBtn = document.getElementById("downloadBtn");
const shareTipsBtn = document.getElementById("shareTipsBtn");
const layersContainer = document.getElementById("layersContainer");
const addLayerBtn = document.getElementById("addLayerBtn");
const canvas = document.getElementById("previewCanvas");
const ctx = canvas.getContext("2d");

const FONT_MAP = {
  impact: '"Impact", "Anton", sans-serif',
  anton: '"Anton", sans-serif',
  bebas: '"Bebas Neue", sans-serif',
  poppins: '"Poppins", sans-serif',
};

let draggingLayerId = null;
let dragPointerId = null;

init();

function init() {
  state.layers = [createLayer(0.08), createLayer(0.78)];
  renderLayerControls();
  attachListeners();
  fetchTemplates();
  renderPlaceholder();
}

function attachListeners() {
  layersContainer.addEventListener("input", handleLayerInput);
  layersContainer.addEventListener("click", handleLayerClick);
  addLayerBtn.addEventListener("click", addLayer);

  [uppercaseInput, captionInput].forEach((el) => el.addEventListener("input", renderPreview));
  [fontSelect, colorInput, outlineInput].forEach((el) => el.addEventListener("change", renderPreview));
  sizeInput.addEventListener("input", renderPreview);
  cropSelect.addEventListener("change", () => {
    state.cropBox = computeCrop();
    renderPreview();
  });
  downloadBtn.addEventListener("click", downloadMeme);
  shareTipsBtn.addEventListener("click", () => {
    tg.showAlert("Download the meme, close the Studio, then attach the saved image in Telegram like any other photo.");
  });

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerUp);
}

function createLayer(defaultYNorm = 0.5) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `layer-${Date.now()}-${Math.random()}`,
    text: "",
    yNorm: defaultYNorm,
  };
}

function renderLayerControls() {
  layersContainer.innerHTML = "";
  state.layers.forEach((layer, index) => {
    const card = document.createElement("div");
    card.className = "layer-card";
    card.dataset.layerId = layer.id;
    card.innerHTML = `
      <div class="layer-header">
        <span>Text ${index + 1}</span>
        ${
          state.layers.length > 1
            ? `<button class="layer-remove" data-action="remove" data-layer-id="${layer.id}">Remove</button>`
            : ""
        }
      </div>
      <label>
        Content
        <textarea rows="2" data-layer-id="${layer.id}" data-field="text" placeholder="Type your text">${layer.text}</textarea>
      </label>
      <label>
        Vertical position (${Math.round(layer.yNorm * 100)}%)
        <input type="range" min="0" max="100" value="${Math.round(layer.yNorm * 100)}" data-layer-id="${layer.id}" data-field="yNorm" />
      </label>
    `;
    layersContainer.appendChild(card);
  });
}

function handleLayerInput(event) {
  const target = event.target;
  const layerId = target.dataset.layerId;
  if (!layerId) return;
  const layer = state.layers.find((entry) => entry.id === layerId);
  if (!layer) return;
  if (target.dataset.field === "text") {
    layer.text = target.value;
  } else if (target.dataset.field === "yNorm") {
    layer.yNorm = Math.min(1, Math.max(0, Number(target.value) / 100));
  }
  renderLayerControls();
  renderPreview();
}

function handleLayerClick(event) {
  if (event.target.dataset.action === "remove") {
    const layerId = event.target.dataset.layerId;
    state.layers = state.layers.filter((layer) => layer.id !== layerId);
    if (!state.layers.length) {
      state.layers.push(createLayer(0.5));
    }
    renderLayerControls();
    renderPreview();
  }
}

function addLayer() {
  if (state.layers.length >= 3) {
    tg.showAlert("Maximum of three text boxes for now.");
    return;
  }
  const defaultY = state.layers.length === 0 ? 0.1 : 0.5;
  state.layers.push(createLayer(defaultY));
  renderLayerControls();
  renderPreview();
}

function fetchTemplates() {
  fetch("templates.json")
    .then((res) => res.json())
    .then((templates) => {
      state.templates = templates;
      renderTemplateCards();
    })
    .catch(() => {
      templateGrid.innerHTML = `<p class="hint">Failed to load templates. Try again later.</p>`;
    });
}

function renderTemplateCards() {
  templateGrid.innerHTML = "";
  if (!state.templates.length) {
    templateGrid.innerHTML = `<p class="hint">No templates yet.</p>`;
    return;
  }
  state.templates.forEach((tpl, index) => {
    const card = document.createElement("div");
    card.className = "template-card";
    card.innerHTML = `
      <img src="${tpl.thumb}" alt="${tpl.name}" loading="lazy" />
      <div class="title">${tpl.name}</div>
    `;
    card.addEventListener("click", () => selectTemplate(tpl, card));
    templateGrid.appendChild(card);
    if (index === 0) {
      selectTemplate(tpl, card);
    }
  });
}

function selectTemplate(template, cardElement) {
  document.querySelectorAll(".template-card").forEach((el) => el.classList.remove("selected"));
  if (cardElement) {
    cardElement.classList.add("selected");
  }
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    state.selectedTemplate = template;
    state.templateImage = image;
    state.cropBox = computeCrop();
    renderPreview();
  };
  image.onerror = () => tg.showAlert("Failed to load template image. Try again or pick another template.");
  image.src = template.thumb;
}

function renderPlaceholder() {
  ctx.fillStyle = "#0b0f1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4fd1c5";
  ctx.font = "bold 20px 'Poppins', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Pick a template to start", canvas.width / 2, canvas.height / 2);
}

function renderPreview() {
  if (!state.templateImage || !state.selectedTemplate) {
    renderPlaceholder();
    return;
  }

  const crop = state.cropBox;
  const baseWidth = state.selectedTemplate.width;
  const baseHeight = state.selectedTemplate.height;
  const sx = crop ? crop.x * baseWidth : 0;
  const sy = crop ? crop.y * baseHeight : 0;
  const sw = crop ? crop.width * baseWidth : baseWidth;
  const sh = crop ? crop.height * baseHeight : baseHeight;

  canvas.width = sw;
  canvas.height = sh;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(state.templateImage, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  state.layerBoxes.clear();
  state.layers.forEach((layer) => {
    if (layer.text.trim()) {
      drawTextLayer(layer);
    }
  });
}

function drawTextLayer(layer) {
  const text = uppercaseInput.checked ? layer.text.toUpperCase() : layer.text;
  const fontFamily = FONT_MAP[fontSelect.value] || FONT_MAP.impact;
  const baseSize = Number(sizeInput.value);
  const fontSize = Math.max(18, Math.round((canvas.width + canvas.height) * (baseSize / 200)));
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = colorInput.value;
  ctx.strokeStyle = outlineInput.value;
  ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.12));
  ctx.textAlign = "center";

  const maxWidth = canvas.width * 0.9;
  const lines = wrapText(text, maxWidth);
  const lineHeight = fontSize * 1.1;
  const totalHeight = lines.length * lineHeight;
  const availableHeight = Math.max(1, canvas.height - totalHeight);
  const yStart = Math.min(1, Math.max(0, layer.yNorm)) * availableHeight + fontSize;
  let y = yStart;
  let maxLineWidth = 0;
  lines.forEach((line) => {
    maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
  });

  lines.forEach((line) => {
    const x = canvas.width / 2;
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    y += lineHeight;
  });

  state.layerBoxes.set(layer.id, {
    id: layer.id,
    x: canvas.width / 2 - maxLineWidth / 2,
    y: yStart - fontSize,
    width: maxLineWidth,
    height: totalHeight,
  });
}

function wrapText(text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = words.shift() || "";
  words.forEach((word) => {
    const testLine = `${current} ${word}`.trim();
    if (ctx.measureText(testLine).width <= maxWidth) {
      current = testLine;
    } else {
      lines.push(current);
      current = word;
    }
  });
  lines.push(current);
  return lines;
}

function computeCrop() {
  if (!state.selectedTemplate) return null;
  const tpl = state.selectedTemplate;
  const mode = cropSelect.value;
  if (mode === "original") return null;

  const targetRatio =
    mode === "square" ? 1 : mode === "fourFive" ? 4 / 5 : mode === "sixteenNine" ? 16 / 9 : null;
  if (!targetRatio) return null;

  const currentRatio = tpl.width / tpl.height;
  let cropWidth = tpl.width;
  let cropHeight = tpl.height;
  let offsetX = 0;
  let offsetY = 0;

  if (currentRatio > targetRatio) {
    cropWidth = tpl.height * targetRatio;
    offsetX = (tpl.width - cropWidth) / 2;
  } else {
    cropHeight = tpl.width / targetRatio;
    offsetY = (tpl.height - cropHeight) / 2;
  }

  return {
    x: offsetX / tpl.width,
    y: offsetY / tpl.height,
    width: cropWidth / tpl.width,
    height: cropHeight / tpl.height,
  };
}

function downloadMeme() {
  if (!state.templateImage) {
    tg.showAlert("Pick a template first.");
    return;
  }
  canvas.toBlob((blob) => {
    if (!blob) {
      tg.showAlert("Unable to prepare image. Try again.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mememe-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    tg.HapticFeedback?.notificationOccurred("success");
  });
}

function handlePointerDown(event) {
  const { x, y } = getCanvasCoords(event);
  const hit = hitTestLayer(x, y);
  if (hit) {
    draggingLayerId = hit.id;
    dragPointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
  }
}

function handlePointerMove(event) {
  if (!draggingLayerId || dragPointerId !== event.pointerId) return;
  const { y } = getCanvasCoords(event);
  const layer = state.layers.find((entry) => entry.id === draggingLayerId);
  if (!layer) return;
  const bbox = state.layerBoxes.get(layer.id);
  const blockHeight = bbox?.height || 0;
  const availableHeight = Math.max(1, canvas.height - blockHeight);
  layer.yNorm = Math.min(1, Math.max(0, (y - blockHeight / 2) / availableHeight));
  renderLayerControls();
  renderPreview();
}

function handlePointerUp(event) {
  if (dragPointerId === event.pointerId) {
    draggingLayerId = null;
    dragPointerId = null;
    canvas.releasePointerCapture(event.pointerId);
  }
}

function getCanvasCoords(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function hitTestLayer(x, y) {
  for (const box of state.layerBoxes.values()) {
    if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
      return box;
    }
  }
  return null;
}

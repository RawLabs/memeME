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
const sendBotBtn = document.getElementById("sendBotBtn");
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
const FONT_FILE_MAP = {
  impact: "Impact.ttf",
  anton: "Anton-Regular.ttf",
  bebas: "BebasNeue-Regular.ttf",
  poppins: "Poppins-SemiBold.ttf",
};

let draggingLayerId = null;
let dragPointerId = null;

init();

function init() {
  state.layers = [createLayer(0.12, 0.5), createLayer(0.85, 0.5)];
  renderLayerControls();
  attachGlobalListeners();
  fetchTemplates();
  renderPlaceholder();
}

function createLayer(yNorm = 0.5, xNorm = 0.5) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `layer-${Date.now()}-${Math.random()}`,
    text: "",
    yNorm,
    xNorm,
  };
}

function renderLayerControls() {
  layersContainer.innerHTML = state.layers
    .map(
      (layer, index) => `
        <div class="layer-card" data-layer-id="${layer.id}">
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
            <div class="slider-header">
              <span>Vertical position</span>
              <span class="slider-value" data-display="yNorm" data-layer-id="${layer.id}">${percent(layer.yNorm)}</span>
            </div>
            <input type="range" min="0" max="100" value="${Math.round(layer.yNorm * 100)}" data-layer-id="${layer.id}" data-field="yNorm" />
          </label>
          <label>
            <div class="slider-header">
              <span>Horizontal position</span>
              <span class="slider-value" data-display="xNorm" data-layer-id="${layer.id}">${percent(layer.xNorm)}</span>
            </div>
            <input type="range" min="0" max="100" value="${Math.round(layer.xNorm * 100)}" data-layer-id="${layer.id}" data-field="xNorm" />
          </label>
        </div>
      `
    )
    .join("");
}

function attachGlobalListeners() {
  layersContainer.addEventListener("input", onLayerInput);
  layersContainer.addEventListener("click", onLayerClick);
  addLayerBtn.addEventListener("click", addLayer);

  [uppercaseInput, captionInput].forEach((el) => el.addEventListener("input", renderPreview));
  [fontSelect, colorInput, outlineInput].forEach((el) => el.addEventListener("change", renderPreview));
  sizeInput.addEventListener("input", renderPreview);
  cropSelect.addEventListener("change", () => {
    state.cropBox = computeCrop();
    renderPreview();
  });
  downloadBtn.addEventListener("click", downloadMeme);
  sendBotBtn.addEventListener("click", handleSendToBot);

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerUp);
}

function onLayerInput(event) {
  const layerId = event.target.dataset.layerId;
  if (!layerId) return;
  const layer = state.layers.find((entry) => entry.id === layerId);
  if (!layer) return;
  const field = event.target.dataset.field;
  if (field === "text") {
    layer.text = event.target.value;
  } else if (field === "yNorm" || field === "xNorm") {
    layer[field] = clamp(Number(event.target.value) / 100, 0, 1);
    updateSliderDisplay(layer, field);
  }
  renderPreview();
}

function onLayerClick(event) {
  if (event.target.dataset.action === "remove") {
    const layerId = event.target.dataset.layerId;
    state.layers = state.layers.filter((layer) => layer.id !== layerId);
    if (!state.layers.length) {
      state.layers.push(createLayer(0.5, 0.5));
    }
    renderLayerControls();
    renderPreview();
  }
}

function addLayer() {
  if (state.layers.length >= 3) {
    tg.showAlert("Maximum of three layers for now.");
    return;
  }
  const fallback = state.layers.length === 0 ? 0.15 : 0.5;
  state.layers.push(createLayer(fallback, 0.5));
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
  const yStart = clamp(layer.yNorm, 0, 1) * availableHeight + fontSize;
  const availableWidth = Math.max(1, canvas.width - maxLineWidth);
  const centerX = clamp(layer.xNorm, 0, 1) * availableWidth + maxLineWidth / 2;
  let y = yStart;
  let maxLineWidth = 0;
  lines.forEach((line) => {
    maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
  });

  lines.forEach((line) => {
    ctx.strokeText(line, centerX, y);
    ctx.fillText(line, centerX, y);
    y += lineHeight;
  });

  state.layerBoxes.set(layer.id, {
    id: layer.id,
    x: centerX - maxLineWidth / 2,
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

function handleSendToBot() {
  try {
    const payload = buildPayload();
    tg.HapticFeedback?.impactOccurred("medium");
    tg.sendData(JSON.stringify(payload));
    setTimeout(() => tg.close(), 150);
  } catch (error) {
    tg.showAlert(error.message || "Unable to send data. Try again.");
  }
}

function buildPayload() {
  if (!state.selectedTemplate) {
    throw new Error("Pick a template first.");
  }
  const layers = state.layers
    .filter((layer) => layer.text.trim())
    .map((layer) => ({
      text: layer.text.trim(),
      position: "custom",
      alignment: "center",
      uppercase: uppercaseInput.checked,
      font: FONT_FILE_MAP[fontSelect.value] || "Impact.ttf",
      color: colorInput.value,
      outline: outlineInput.value,
      sizePct: Number(sizeInput.value),
      maxWidthPct: 0.95,
      anchor: {
        x: clamp(layer.xNorm, 0, 1),
        y: clamp(layer.yNorm, 0, 1),
      },
    }));
  if (!layers.length) {
    throw new Error("Add some text first.");
  }

  return {
    source: "template",
    templateId: state.selectedTemplate.id,
    layers,
    crop: state.cropBox
      ? {
          x: state.cropBox.x,
          y: state.cropBox.y,
          width: state.cropBox.width,
          height: state.cropBox.height,
        }
      : null,
    caption: captionInput.value,
    format: "JPEG",
  };
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
  const { x, y } = getCanvasCoords(event);
  const layer = state.layers.find((entry) => entry.id === draggingLayerId);
  if (!layer) return;
  const bbox = state.layerBoxes.get(layer.id);
  const blockHeight = bbox?.height || 0;
  const blockWidth = bbox?.width || 0;
  const availableHeight = Math.max(1, canvas.height - blockHeight);
  const availableWidth = Math.max(1, canvas.width - blockWidth);
  layer.yNorm = clamp((y - blockHeight / 2) / availableHeight, 0, 1);
  layer.xNorm = clamp((x - blockWidth / 2) / availableWidth, 0, 1);
  syncLayerControls(layer);
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

function updateSliderDisplay(layer, field) {
  const display = layersContainer.querySelector(`.slider-value[data-display="${field}"][data-layer-id="${layer.id}"]`);
  if (display) {
    display.textContent = percent(layer[field]);
  }
}

function syncLayerControls(layer) {
  ["xNorm", "yNorm"].forEach((field) => {
    const slider = layersContainer.querySelector(`input[data-field="${field}"][data-layer-id="${layer.id}"]`);
    if (slider) {
      slider.value = Math.round(layer[field] * 100);
    }
    updateSliderDisplay(layer, field);
  });
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const state = {
  templates: [],
  selectedTemplate: null,
  templateImage: null,
  cropBox: null,
};

const templateGrid = document.getElementById("templates");
const topInput = document.getElementById("topText");
const bottomInput = document.getElementById("bottomText");
const topPlacement = document.getElementById("topPlacement");
const bottomPlacement = document.getElementById("bottomPlacement");
const topCustomY = document.getElementById("topCustomY");
const bottomCustomY = document.getElementById("bottomCustomY");
const fontSelect = document.getElementById("fontSelect");
const colorInput = document.getElementById("textColor");
const outlineInput = document.getElementById("outlineColor");
const uppercaseInput = document.getElementById("uppercase");
const sizeInput = document.getElementById("sizePct");
const cropSelect = document.getElementById("cropMode");
const captionInput = document.getElementById("caption");
const downloadBtn = document.getElementById("downloadBtn");
const shareTipsBtn = document.getElementById("shareTipsBtn");
const canvas = document.getElementById("previewCanvas");
const ctx = canvas.getContext("2d");

const FONT_MAP = {
  impact: '"Impact", "Anton", sans-serif',
  anton: '"Anton", sans-serif',
  bebas: '"Bebas Neue", sans-serif',
  poppins: '"Poppins", sans-serif',
};

init();

function init() {
  attachListeners();
  fetchTemplates();
  renderPlaceholder();
}

function attachListeners() {
  [topInput, bottomInput, uppercaseInput, captionInput].forEach((el) =>
    el.addEventListener("input", renderPreview)
  );
  [fontSelect, colorInput, outlineInput, topPlacement, bottomPlacement].forEach((el) =>
    el.addEventListener("change", renderPreview)
  );
  [topCustomY, bottomCustomY].forEach((el) => el.addEventListener("input", () => {
    const { target } = document.activeElement;
    if (target === topCustomY) {
      topPlacement.value = "custom";
    } else if (target === bottomCustomY) {
      bottomPlacement.value = "custom";
    }
    renderPreview();
  }));
  sizeInput.addEventListener("input", renderPreview);
  cropSelect.addEventListener("change", () => {
    state.cropBox = computeCrop();
    renderPreview();
  });
  downloadBtn.addEventListener("click", downloadMeme);
  shareTipsBtn.addEventListener("click", () => {
    tg.showAlert("Download the meme, close the Studio, then attach the saved image in Telegram like any other photo.");
  });
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
  image.onerror = () => {
    tg.showAlert("Failed to load template image. Try again or pick another template.");
  };
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

  getLayers().forEach((layer) => drawTextLayer(layer));
}

function getLayers() {
  const layers = [];
  if (topInput.value.trim()) {
    layers.push({
      text: topInput.value.trim(),
      position: topPlacement.value,
      customY: Number(topCustomY.value) / 100,
    });
  }
  if (bottomInput.value.trim()) {
    layers.push({
      text: bottomInput.value.trim(),
      position: bottomPlacement.value,
      customY: Number(bottomCustomY.value) / 100,
    });
  }
  return layers;
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
  let y;
  const margin = canvas.height * 0.08;
  if (layer.position === "top") {
    y = margin + fontSize;
  } else if (layer.position === "bottom") {
    y = canvas.height - totalHeight + fontSize * 0.2;
  } else if (layer.position === "custom") {
    y = layer.customY ? layer.customY * canvas.height : canvas.height / 2;
  } else {
    y = canvas.height / 2 - totalHeight / 2 + fontSize;
  }
  lines.forEach((line) => {
    const x = canvas.width / 2;
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    y += lineHeight;
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
  if (!state.selectedTemplate) {
    return null;
  }
  const tpl = state.selectedTemplate;
  const mode = cropSelect.value;
  if (mode === "original") {
    return null;
  }
  const targetRatio =
    mode === "square" ? 1 : mode === "fourFive" ? 4 / 5 : mode === "sixteenNine" ? 16 / 9 : null;
  if (!targetRatio) {
    return null;
  }
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

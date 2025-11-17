const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const state = {
  templates: [],
  selectedTemplate: null,
};

const templateGrid = document.getElementById("templates");
const topInput = document.getElementById("topText");
const bottomInput = document.getElementById("bottomText");
const fontSelect = document.getElementById("fontSelect");
const colorInput = document.getElementById("textColor");
const outlineInput = document.getElementById("outlineColor");
const uppercaseInput = document.getElementById("uppercase");
const sizeInput = document.getElementById("sizePct");
const cropSelect = document.getElementById("cropMode");
const captionInput = document.getElementById("caption");
const formatSelect = document.getElementById("format");
const generateBtn = document.getElementById("generateBtn");

fetch("templates.json")
  .then((res) => res.json())
  .then((templates) => {
    state.templates = templates;
    renderTemplates();
  })
  .catch(() => {
    templateGrid.innerHTML = `<p class="hint">Failed to load templates. Try again later.</p>`;
  });

function renderTemplates() {
  if (!state.templates.length) {
    templateGrid.innerHTML = `<p class="hint">No templates yet.</p>`;
    return;
  }
  templateGrid.innerHTML = "";
  state.templates.forEach((tpl) => {
    const card = document.createElement("div");
    card.className = "template-card";
    card.innerHTML = `
      <img src="${tpl.thumb}" alt="${tpl.name}" loading="lazy" />
      <div class="title">${tpl.name}</div>
    `;
    card.addEventListener("click", () => selectTemplate(tpl, card));
    templateGrid.appendChild(card);
    if (!state.selectedTemplate) {
      selectTemplate(tpl, card);
    }
  });
}

function selectTemplate(template, card) {
  state.selectedTemplate = template;
  document.querySelectorAll(".template-card").forEach((el) => el.classList.remove("selected"));
  if (card) {
    card.classList.add("selected");
  }
}

generateBtn.addEventListener("click", () => {
  if (!state.selectedTemplate) {
    tg.showAlert("Pick a template first.");
    return;
  }
  const payload = buildPayload();
  tg.HapticFeedback?.impactOccurred("medium");
  tg.sendData(JSON.stringify(payload));
  tg.close();
});

function buildPayload() {
  const layers = [];
  if (topInput.value.trim()) {
    layers.push(buildLayer(topInput.value, "top"));
  }
  if (bottomInput.value.trim()) {
    layers.push(buildLayer(bottomInput.value, "bottom"));
  }
  if (!layers.length) {
    tg.showAlert("Add at least one line of text.");
    throw new Error("No text");
  }

  return {
    version: 1,
    source: "template",
    templateId: state.selectedTemplate.id,
    layers,
    crop: computeCrop(),
    caption: captionInput.value,
    format: formatSelect.value,
  };
}

function buildLayer(text, position) {
  return {
    text,
    position,
    font: fontSelect.value,
    color: colorInput.value,
    outline: outlineInput.value,
    sizePct: Number(sizeInput.value),
    uppercase: uppercaseInput.checked,
    alignment: "center",
    maxWidthPct: 0.95,
    anchor: { x: 0.5, y: 0.5 },
  };
}

function computeCrop() {
  const mode = cropSelect.value;
  if (mode === "original" || !state.selectedTemplate) {
    return null;
  }
  const targetRatio =
    mode === "square" ? 1 : mode === "fourFive" ? 0.8 : mode === "sixteenNine" ? 16 / 9 : null;
  if (!targetRatio) {
    return null;
  }
  const tpl = state.selectedTemplate;
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
    x: +(offsetX / tpl.width).toFixed(4),
    y: +(offsetY / tpl.height).toFixed(4),
    width: +(cropWidth / tpl.width).toFixed(4),
    height: +(cropHeight / tpl.height).toFixed(4),
  };
}

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from .models import CropBox, ImageSource, MemeRequest, TextLayer


def parse_webapp_payload(raw: str) -> MemeRequest:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid web_app_data JSON") from exc

    source_kind = data.get("source", "template")
    template_id = _clean_string(data.get("templateId"))
    telegram_file_id = _clean_string(data.get("telegramFileId"))
    image_url = _clean_string(data.get("imageUrl"))

    if source_kind == "telegram" and telegram_file_id:
        source = ImageSource.TELEGRAM_FILE
    elif source_kind == "url" and image_url:
        source = ImageSource.REMOTE_URL
    else:
        source = ImageSource.TEMPLATE

    layers = [_parse_layer(layer) for layer in data.get("layers", [])]
    layers = [layer for layer in layers if layer is not None]
    if not layers:
        raise ValueError("No text layers supplied.")

    crop_box = _parse_crop_box(data.get("crop"))

    request = MemeRequest(
        source=source,
        template_id=template_id if source == ImageSource.TEMPLATE else None,
        telegram_file_id=telegram_file_id if source == ImageSource.TELEGRAM_FILE else None,
        image_url=image_url if source == ImageSource.REMOTE_URL else None,
        crop_box=crop_box,
        text_layers=layers,
        output_format=data.get("format", "JPEG").upper(),
        caption=_clean_string(data.get("caption")),
    )
    request.validate()
    return request


def _parse_layer(data: Dict[str, Any]) -> Optional[TextLayer]:
    text = _clean_string(data.get("text"))
    if not text:
        return None
    color = _parse_color(data.get("color", "#ffffff"))
    outline = _parse_color(data.get("outline", "#000000"))
    size_pct = float(data.get("sizePct", 8.0))
    position = data.get("position", "top")
    alignment = data.get("alignment", "center")
    uppercase = bool(data.get("uppercase", True))
    anchor = data.get("anchor") or {}
    anchor_x = float(anchor.get("x", 0.5))
    anchor_y = float(anchor.get("y", 0.5))
    max_width_pct = float(data.get("maxWidthPct", 0.9))
    font = _clean_string(data.get("font") or "Impact.ttf")

    return TextLayer(
        text=text,
        font=font,
        color=color,
        outline_color=outline,
        size_pct=size_pct,
        uppercase=uppercase,
        position=position,
        alignment=alignment,
        anchor_x=max(0.0, min(anchor_x, 1.0)),
        anchor_y=max(0.0, min(anchor_y, 1.0)),
        max_width_pct=max(0.2, min(max_width_pct, 1.0)),
    )


def _parse_crop_box(data: Optional[Dict[str, Any]]) -> Optional[CropBox]:
    if not data:
        return None
    if {"x", "y", "width", "height"} - data.keys():
        return None
    box = CropBox(
        x=float(data["x"]),
        y=float(data["y"]),
        width=float(data["width"]),
        height=float(data["height"]),
    ).clamp()
    if box.width <= 0 or box.height <= 0:
        return None
    return box


def _clean_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    stripped = value.strip()
    return stripped or None


def _parse_color(value: str) -> Tuple[int, int, int]:
    value = (value or "#ffffff").strip().lower()
    if value.startswith("#"):
        value = value[1:]
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        value = "ffffff"
    r = int(value[0:2], 16)
    g = int(value[2:4], 16)
    b = int(value[4:6], 16)
    return r, g, b

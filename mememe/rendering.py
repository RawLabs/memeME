from __future__ import annotations

import math
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Iterable, Tuple

from PIL import Image, ImageDraw, ImageFont

from .models import CropBox, MemeRequest, TextLayer


@dataclass(slots=True)
class FontResolver:
    search_paths: Iterable[Path]
    default_font: str

    def resolve(self, font_name: str, size: int) -> ImageFont.FreeTypeFont:
        candidates = [font_name, self.default_font]
        for candidate in candidates:
            path = Path(candidate)
            if path.exists():
                return ImageFont.truetype(str(path), size=size)
            for base in self.search_paths:
                candidate_path = base / candidate
                if candidate_path.exists():
                    return ImageFont.truetype(str(candidate_path), size=size)
        return ImageFont.load_default()


class MemeRenderer:
    def __init__(self, font_resolver: FontResolver) -> None:
        self.font_resolver = font_resolver

    def render(self, base_bytes: bytes, request: MemeRequest) -> BytesIO:
        request.validate()
        with Image.open(BytesIO(base_bytes)) as img:
            img = img.convert("RGB")
            if request.crop_box:
                img = self._apply_crop(img, request.crop_box)
            self._draw_layers(img, request.text_layers)
            output = BytesIO()
            img.save(output, format=request.output_format)
            output.seek(0)
            return output

    def _apply_crop(self, img: Image.Image, crop: CropBox) -> Image.Image:
        width, height = img.size
        x0 = int(crop.x * width)
        y0 = int(crop.y * height)
        x1 = int((crop.x + crop.width) * width)
        y1 = int((crop.y + crop.height) * height)
        x1 = max(x0 + 1, min(x1, width))
        y1 = max(y0 + 1, min(y1, height))
        return img.crop((x0, y0, x1, y1))

    def _draw_layers(self, img: Image.Image, layers: Iterable[TextLayer]) -> None:
        draw = ImageDraw.Draw(img)
        width, height = img.size
        for layer in layers:
            text = layer.normalized_text()
            if not text:
                continue
            font_size = max(16, int(min(width, height) * (layer.size_pct / 100.0)))
            font = self.font_resolver.resolve(layer.font, font_size)
            max_width = width * max(layer.max_width_pct, 0.2)
            lines = self._wrap_text(draw, text, font, max_width)
            if not lines:
                continue
            self._draw_text_lines(draw, lines, font, width, height, layer)

    def _draw_text_lines(
        self,
        draw: ImageDraw.ImageDraw,
        lines: Iterable[str],
        font: ImageFont.FreeTypeFont,
        width: int,
        height: int,
        layer: TextLayer,
    ) -> None:
        line_height = font.size + int(font.size * 0.2)
        line_count = len(lines)
        total_height = line_height * line_count
        anchor_x = layer.anchor_x * width
        anchor_y = layer.anchor_y * height

        if layer.position == "top":
            y = int(height * 0.05)
        elif layer.position == "bottom":
            y = height - total_height - int(height * 0.05)
        elif layer.position == "center":
            y = (height // 2) - (total_height // 2)
        else:
            y = int(anchor_y - total_height / 2)

        for line in lines:
            text_width = draw.textlength(line, font=font)
            if layer.alignment == "left":
                x = int(width * 0.05)
            elif layer.alignment == "right":
                x = int(width - text_width - width * 0.05)
            elif layer.position == "custom":
                x = int(anchor_x - text_width / 2)
            else:
                x = (width - text_width) // 2
            stroke_width = max(1, int(font.size * 0.08))
            draw.text(
                (x, y),
                line,
                fill=layer.color,
                font=font,
                stroke_width=stroke_width,
                stroke_fill=layer.outline_color,
            )
            y += line_height

    def _wrap_text(
        self,
        draw: ImageDraw.ImageDraw,
        text: str,
        font: ImageFont.FreeTypeFont,
        max_width: float,
    ) -> Tuple[str, ...]:
        words = text.split()
        if not words:
            return tuple()
        lines = []
        current = words[0]
        for word in words[1:]:
            test = f"{current} {word}"
            if draw.textlength(test, font=font) <= max_width:
                current = test
            else:
                lines.append(current)
                current = word
        lines.append(current)
        return tuple(lines)

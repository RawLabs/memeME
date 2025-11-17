from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable, List, Optional, Tuple


class ImageSource(Enum):
    TEMPLATE = "template"
    TELEGRAM_FILE = "telegram_file"
    REMOTE_URL = "remote_url"


@dataclass(slots=True)
class MemeTemplate:
    template_id: str
    name: str
    source_url: str
    width: int
    height: int

    @property
    def ratio(self) -> float:
        if self.height == 0:
            return 1.0
        return self.width / self.height


@dataclass(slots=True)
class CropBox:
    """Normalized crop rectangle with values in the 0-1 range."""

    x: float
    y: float
    width: float
    height: float

    def clamp(self) -> "CropBox":
        x = min(max(self.x, 0.0), 1.0)
        y = min(max(self.y, 0.0), 1.0)
        width = min(max(self.width, 0.0), 1.0)
        height = min(max(self.height, 0.0), 1.0)
        if x + width > 1.0:
            width = 1.0 - x
        if y + height > 1.0:
            height = 1.0 - y
        return CropBox(x=x, y=y, width=width, height=height)


@dataclass(slots=True)
class TextLayer:
    text: str
    font: str
    color: Tuple[int, int, int]
    outline_color: Tuple[int, int, int]
    size_pct: float
    uppercase: bool
    position: str
    alignment: str
    anchor_x: float
    anchor_y: float
    max_width_pct: float

    def normalized_text(self) -> str:
        value = self.text.strip()
        return value.upper() if self.uppercase else value


@dataclass(slots=True)
class MemeRequest:
    source: ImageSource
    template_id: Optional[str] = None
    telegram_file_id: Optional[str] = None
    image_url: Optional[str] = None
    crop_box: Optional[CropBox] = None
    text_layers: List[TextLayer] = field(default_factory=list)
    output_format: str = "JPEG"
    caption: Optional[str] = None

    def validate(self) -> None:
        if not self.text_layers:
            raise ValueError("At least one text layer is required.")
        if self.source == ImageSource.TEMPLATE and not self.template_id:
            raise ValueError("Template source selected without template_id.")
        if self.source == ImageSource.TELEGRAM_FILE and not self.telegram_file_id:
            raise ValueError("Telegram source selected without file id.")
        if self.source == ImageSource.REMOTE_URL and not self.image_url:
            raise ValueError("Remote URL source selected without image_url.")

    def iter_layers(self) -> Iterable[TextLayer]:
        return list(self.text_layers)

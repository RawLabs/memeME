from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import List


DEFAULT_TEMPLATE_ENDPOINT = "https://api.imgflip.com/get_memes"


@dataclass(slots=True)
class MememeBotConfig:
    token: str
    webapp_url: str
    templates_endpoint: str = DEFAULT_TEMPLATE_ENDPOINT
    max_templates: int = 70
    font_search_paths: List[Path] = None
    default_font: str = "Impact.ttf"

    @classmethod
    def from_env(cls) -> "MememeBotConfig":
        token = os.getenv("MEMEME_BOT_TOKEN")
        if not token:
            raise RuntimeError("Please export MEMEME_BOT_TOKEN before running memeME.")
        webapp_url = os.getenv("MEMEME_WEBAPP_URL", "").strip()
        endpoint = os.getenv("MEMEME_TEMPLATE_ENDPOINT", DEFAULT_TEMPLATE_ENDPOINT).strip()
        max_templates = int(os.getenv("MEMEME_TEMPLATE_LIMIT", "70"))
        default_font = os.getenv("MEMEME_DEFAULT_FONT", "Impact.ttf").strip()

        font_paths: List[Path]
        raw_paths = os.getenv("MEMEME_FONT_PATHS")
        if raw_paths:
            font_paths = [Path(part.strip()) for part in raw_paths.split(",") if part.strip()]
        else:
            font_paths = [
                Path("fonts"),
                Path("/usr/share/fonts"),
                Path("/usr/local/share/fonts"),
            ]

        return cls(
            token=token,
            webapp_url=webapp_url,
            templates_endpoint=endpoint or DEFAULT_TEMPLATE_ENDPOINT,
            max_templates=max_templates,
            font_search_paths=font_paths,
            default_font=default_font,
        )

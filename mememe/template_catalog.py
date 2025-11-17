from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional

import httpx

from .models import MemeTemplate

logger = logging.getLogger(__name__)


_SEED_TEMPLATES: List[MemeTemplate] = [
    MemeTemplate(
        template_id="181913649",
        name="Drake Hotline Bling",
        source_url="https://i.imgflip.com/30b1gx.jpg",
        width=1200,
        height=1200,
    ),
    MemeTemplate(
        template_id="112126428",
        name="Distracted Boyfriend",
        source_url="https://i.imgflip.com/1ur9b0.jpg",
        width=1200,
        height=800,
    ),
    MemeTemplate(
        template_id="87743020",
        name="Two Buttons",
        source_url="https://i.imgflip.com/1g8my4.jpg",
        width=600,
        height=908,
    ),
]


@dataclass(slots=True)
class TemplateCatalog:
    endpoint: str
    max_templates: int = 70
    _templates: Dict[str, MemeTemplate] = field(init=False, default_factory=dict)
    _lock: asyncio.Lock = field(init=False)

    def __post_init__(self) -> None:
        self._templates = {t.template_id: t for t in _SEED_TEMPLATES}
        self._lock = asyncio.Lock()

    def list_templates(self) -> Iterable[MemeTemplate]:
        return list(self._templates.values())

    def get(self, template_id: str) -> Optional[MemeTemplate]:
        return self._templates.get(template_id)

    async def ensure_template(self, template_id: str) -> MemeTemplate:
        existing = self.get(template_id)
        if existing:
            return existing
        await self.refresh()
        refreshed = self.get(template_id)
        if not refreshed:
            raise KeyError(f"Template {template_id} not found after refresh.")
        return refreshed

    async def refresh(self) -> None:
        async with self._lock:
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
                    response = await client.get(self.endpoint)
                    response.raise_for_status()
            except Exception as exc:  # pragma: no cover - network failure
                logger.warning("Failed to refresh templates: %s", exc)
                return
            data = response.json()
            memes = data.get("data", {}).get("memes", []) if isinstance(data, dict) else []
            updated: Dict[str, MemeTemplate] = {}
            for meme in memes[: self.max_templates]:
                try:
                    template_id = str(meme["id"])
                    updated[template_id] = MemeTemplate(
                        template_id=template_id,
                        name=str(meme.get("name", f"Template {template_id}")),
                        source_url=str(meme["url"]),
                        width=int(meme.get("width") or 512),
                        height=int(meme.get("height") or 512),
                    )
                except Exception:
                    continue
            if updated:
                self._templates = updated
                logger.info("Template catalog refreshed with %d entries.", len(updated))
            else:
                logger.warning("Template refresh returned no entries; keeping existing cache.")

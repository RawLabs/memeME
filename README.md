# memeME

A Telegram meme studio that lives entirely inside Telegram. `/mememe` opens a BotFather-style WebApp so users can pick classic templates, tweak fonts/colors, choose crops, and download the finished meme directly to their device without leaving Telegram. There is also a chat-only `/caption` fallback for quick edits on any uploaded photo.

## Highlights
- **Inline Meme Studio** – `/mememe` replies with a WebApp button (`🎨 Open Meme Studio`) that launches the mini-app directly inside Telegram (DMs or groups with privacy mode on).
- **Instant uploads** – tap “Send to Bot” in the WebApp and the backend renders/sends the meme right back into the chat. Prefer manual sharing? The Download button is still there.
- **Drag-and-drop placement** – add up to three text boxes, drag them on the preview, or fine-tune their vertical position with sliders.
- **Fresh templates** – templates are fetched from Imgflip (or any API you configure) every few hours; nothing is persisted locally beyond a JSON cache in memory.
- **Chat fallback** – anyone can reply to a photo/document with `/caption top text || bottom text` to run the Python renderer if they prefer the classic chat flow.
- **Lightweight hosting** – the WebApp is a static bundle (`webapp/`) that can be dropped into any HTTPS host (GitHub Pages, Netlify, etc.).

## Requirements
- Python 3.11+
- `python-telegram-bot>=20`, `httpx`, `Pillow` (see `requirements.txt`)
- Telegram bot token via [BotFather](https://t.me/BotFather)
- HTTPS hosting for the WebApp bundle (or tunnel one locally with your preferred tool)

## Configuration
Environment variables (add them to `.env` for `scripts/start_all.py`):

| Variable | Description |
| --- | --- |
| `MEMEME_BOT_TOKEN` | Telegram bot token. |
| `MEMEME_WEBAPP_URL` | HTTPS URL to the deployed `webapp/` (leave blank to disable the button until you host it). |
| `MEMEME_TEMPLATE_ENDPOINT` | (Optional) API endpoint that returns template metadata (defaults to Imgflip). |
| `MEMEME_TEMPLATE_LIMIT` | (Optional) maximum templates to keep in the cache (default 70). |
| `MEMEME_DEFAULT_FONT` | Filename of the preferred font (e.g., `Impact.ttf`). |
| `MEMEME_FONT_PATHS` | Comma-separated list of directories where fonts are stored (defaults to `fonts,/usr/share/fonts,/usr/local/share/fonts`). |

## Running locally
```bash
source ../../bots-env/bin/activate
pip install -r requirements.txt
export MEMEME_BOT_TOKEN=123:ABC
python bot.py
```

Commands:
- `/start` – feature summary.
- `/mememe` – sends the inline keyboard button that opens the WebApp.
- `/caption top text || bottom text` – reply to a photo/document to caption it via the chat-only flow.

When you add memeME to the shared launcher (`python scripts/start_all.py`), the bot token will be picked up via `MEMEME_BOT_TOKEN`.

## WebApp bundle
`webapp/` contains a minimal HTML/JS/CSS mini-app:
- Lists templates from `webapp/templates.json` (replace with your own fetcher or point it at a CDN).
- Live canvas preview with Impact-style text rendering, color/size sliders, uppercase toggle, and preset crops (square, 4:5, 16:9).
- Drag text directly on the preview or nudge it via sliders, then hit “Send to Bot” to ship the configuration back to memeME (or “Download” for manual sharing).

Host this folder on any HTTPS-capable service and point `MEMEME_WEBAPP_URL` to it. Telegram automatically handles authentication and theme colors when the page loads `telegram-web-app.js`.

## Template catalog
`TemplateCatalog` keeps a small in-memory cache:
- Seeds with three classics (Drake, Distracted Boyfriend, Two Buttons).
- Refreshes every 6 hours via Imgflip (configurable) so you always have trending templates without storing the images locally.
- When the renderer needs a template that isn't cached, the catalog forces a refresh and fails fast if it still can't be found.

If you want full control, host your own `templates.json` and set `MEMEME_TEMPLATE_ENDPOINT` to that URL.

## Renderer capabilities
- Cropping: accepts normalized `x/y/width/height` rectangles; WebApp presets mirror the backend behaviour for square/4:5/16:9 crops.
- Text layers: multiple layers supported, each with font, color, outline, uppercase toggle, size %, alignment, and optional custom anchors.
- Outline: both the backend and the WebApp canvas use stroke rendering so text stays readable on any background.
- Output formats: WebApp downloads as PNG; backend still uses Pillow/JPEG for `/caption`.

To use additional fonts drop them into `fonts/` (or any folder listed in `MEMEME_FONT_PATHS`). The backend renderer falls back to PIL's default if it can't find the requested font, while the WebApp uses Google Fonts (Impact lookalikes) for predictable rendering.

## Chat-only fallback
Some users won't bother with the WebApp. They can:
1. Send a photo/document.
2. Reply to that message with `/caption top text || bottom text`.
3. The bot downloads the original file (Telegram handles format conversions) and returns the captioned meme.

This satisfies the “always allow uploads” requirement even before the WebApp’s custom uploader ships.

## Next steps
- Wire a lightweight backend (FastAPI or Flask) if you want the WebApp to upload original files directly (instead of relying on replied photos).
- Add live previews to the WebApp via `<canvas>` so crops/placement are visual.
- Persist favorite memes per user by storing final URLs in a small database (Supabase/SQLite/etc.).
- Enrich template metadata (tags, aspect ratios, popularity) to filter/sort inside the WebApp.

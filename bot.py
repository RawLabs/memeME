from __future__ import annotations

import asyncio
import logging
from io import BytesIO
from typing import List, Optional

import httpx
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    Update,
    WebAppInfo,
)
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from mememe.config import MememeBotConfig
from mememe.models import CropBox, ImageSource, MemeRequest, TextLayer
from mememe.rendering import FontResolver, MemeRenderer
from mememe.template_catalog import TemplateCatalog
from mememe.webapp_payload import parse_webapp_payload

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_STATUS_TEXT = "Generating your meme…"


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = (
        "Welcome to memeME 🎨\n\n"
        "• Use /mememe to open the inline Meme Studio (BotFather-style). Hit “Send to Bot” inside the studio and I'll deliver the final meme back here.\n"
        "• I always respond only when called, so feel free to invite me into groups."
    )
    await update.effective_message.reply_text(message)


async def invite_memestudio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    config: MememeBotConfig = context.application.bot_data["config"]
    if not config.webapp_url:
        await update.effective_message.reply_text(
            "WebApp URL is not configured yet. Set MEMEME_WEBAPP_URL to enable the inline editor."
        )
        return
    chat = update.effective_chat
    group_warning = ""
    if chat and chat.type in ("group", "supergroup"):
        group_warning = (
            "\n\nHeads-up: Telegram only delivers WebApp data in groups if the bot's privacy mode is disabled. "
            "Use /setprivacy in BotFather to disable it or run /mememe in a private chat."
        )
    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    text="🎨 Open Meme Studio",
                    web_app=WebAppInfo(url=config.webapp_url),
                )
            ]
        ]
    )
    await update.effective_message.reply_text(
        f"Tap below to open memeME Studio inside Telegram.{group_warning}",
        reply_markup=keyboard,
    )


async def handle_webapp_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if not message or not message.web_app_data:
        return
    logger.info("Received web_app_data from %s", message.from_user.id if message.from_user else "unknown")
    logger.debug("Raw web_app_data: %s", message.web_app_data.data)
    try:
        request = parse_webapp_payload(message.web_app_data.data)
    except ValueError as exc:
        await message.reply_text(f"Invalid builder payload: {exc}")
        return
    await _process_request(update, context, request)


async def log_update_debug(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    has_web_app = bool(message and message.web_app_data)
    logger.info(
        "DEBUG update_id=%s has_web_app_data=%s type=%s",
        update.update_id,
        has_web_app,
        message.chat.type if message and message.chat else "n/a",
    )
    if has_web_app:
        await handle_webapp_data(update, context)

async def prompt_photo_reply(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if not message:
        return
    if message.chat and message.chat.type != "private":
        return
    await message.reply_text(
        "Nice image! Reply to this photo with `/caption top text || bottom text` and "
        "I'll turn it into a meme.",
        quote=True,
    )


async def caption_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if not message or not message.reply_to_message:
        await message.reply_text("Reply to an image with `/caption top text || bottom text`.")
        return
    file_id = _extract_file_id(message.reply_to_message)
    if not file_id:
        await message.reply_text("Please reply to a photo/document that contains an image.")
        return
    try:
        layers = build_layers_from_args(context.application.bot_data["config"], context.args)
    except ValueError as exc:
        await message.reply_text(str(exc))
        return
    request = MemeRequest(
        source=ImageSource.TELEGRAM_FILE,
        telegram_file_id=file_id,
        text_layers=layers,
        crop_box=None,
        output_format="JPEG",
    )
    await _process_request(update, context, request)


async def _process_request(update: Update, context: ContextTypes.DEFAULT_TYPE, request: MemeRequest) -> None:
    message = update.effective_message
    if message is None:
        return
    status = await message.reply_text(DEFAULT_STATUS_TEXT)
    try:
        base_bytes = await _download_source(context, request)
        renderer: MemeRenderer = context.application.bot_data["renderer"]
        loop = asyncio.get_running_loop()
        output: BytesIO = await loop.run_in_executor(None, lambda: renderer.render(base_bytes, request))
    except Exception as exc:
        logger.exception("Failed to build meme")
        await status.edit_text(f"Failed to generate meme: {exc}")
        return

    caption = request.caption or "memeME"
    await status.edit_text("Uploading meme…")
    await message.reply_photo(photo=output, caption=caption[:1024])
    await status.edit_text("Done ✅")


async def _download_source(context: ContextTypes.DEFAULT_TYPE, request: MemeRequest) -> bytes:
    if request.source == ImageSource.TEMPLATE and request.template_id:
        catalog: TemplateCatalog = context.application.bot_data["catalog"]
        template = await catalog.ensure_template(request.template_id)
        return await _fetch_url(template.source_url)
    if request.source == ImageSource.REMOTE_URL and request.image_url:
        return await _fetch_url(request.image_url)
    if request.source == ImageSource.TELEGRAM_FILE and request.telegram_file_id:
        file = await context.bot.get_file(request.telegram_file_id)
        buffer = BytesIO()
        await file.download_to_memory(out=buffer)
        return buffer.getvalue()
    raise RuntimeError("Invalid meme request; missing source image.")


async def _fetch_url(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


def _extract_file_id(message: Message) -> Optional[str]:
    if message.photo:
        return message.photo[-1].file_id
    if message.document and message.document.mime_type in ("image/jpeg", "image/png", "image/webp"):
        return message.document.file_id
    return None


def build_layers_from_args(config: MememeBotConfig, args: List[str]) -> List[TextLayer]:
    if not args:
        raise ValueError("Usage: reply with `/caption top text || bottom text`.")
    joined = " ".join(args).strip()
    parts = [part.strip() for part in joined.split("||")]
    layers: List[TextLayer] = []
    if parts and parts[0]:
        layers.append(_default_layer(parts[0], "top", config.default_font))
    if len(parts) > 1 and parts[1]:
        layers.append(_default_layer(parts[1], "bottom", config.default_font))
    if not layers:
        raise ValueError("Please provide at least one line of text.")
    return layers


def _default_layer(text: str, position: str, font_name: str) -> TextLayer:
    return TextLayer(
        text=text,
        font=font_name,
        color=(255, 255, 255),
        outline_color=(0, 0, 0),
        size_pct=9.0,
        uppercase=True,
        position=position,
        alignment="center",
        anchor_x=0.5,
        anchor_y=0.5,
        max_width_pct=0.95,
    )


def build_application() -> Application:
    config = MememeBotConfig.from_env()
    catalog = TemplateCatalog(endpoint=config.templates_endpoint, max_templates=config.max_templates)
    font_resolver = FontResolver(config.font_search_paths, config.default_font)
    renderer = MemeRenderer(font_resolver)

    application = ApplicationBuilder().token(config.token).build()
    application.bot_data["config"] = config
    application.bot_data["catalog"] = catalog
    application.bot_data["renderer"] = renderer

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("mememe", invite_memestudio))
    application.add_handler(CommandHandler("caption", caption_command))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_webapp_data))
    application.add_handler(MessageHandler(filters.ALL, log_update_debug))
    application.add_handler(MessageHandler(filters.PHOTO | filters.Document.IMAGE, prompt_photo_reply))

    # Periodically refresh templates to keep list fresh.
    async def refresh_catalog(_: ContextTypes.DEFAULT_TYPE) -> None:
        await catalog.refresh()

    application.job_queue.run_repeating(refresh_catalog, interval=60 * 60 * 6, first=10)
    return application


def main() -> None:
    application = build_application()
    logger.info("memeME bot starting…")
    application.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()

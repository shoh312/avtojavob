"""Tashqi xizmatlar: email (SMTP), AI javoblar (Claude), Telegram xabarnomalar, webhook."""

import ipaddress
import json
import logging
import smtplib
import socket
import ssl
from email.message import EmailMessage
from urllib.parse import urlparse

import anthropic
import httpx
from sqlalchemy.orm import Session

from .plans import get_setting, set_setting
from .security import decrypt, encrypt

log = logging.getLogger("services")
_http = httpx.Client(timeout=10)


# ---------------------------------------------------------------- maxfiy sozlamalar (shifrlangan)

SECRET_KEYS = ("smtp_password", "google_client_secret", "anthropic_api_key")


def get_secret(db: Session, key: str) -> str:
    raw = get_setting(db, key)
    if not raw:
        return ""
    try:
        return decrypt(raw)
    except ValueError:
        return ""


def set_secret(db: Session, key: str, value: str) -> None:
    set_setting(db, key, encrypt(value) if value else "")


# ---------------------------------------------------------------- email

def smtp_config(db: Session) -> dict | None:
    host = get_setting(db, "smtp_host")
    sender = get_setting(db, "smtp_from")
    if not host or not sender:
        return None
    return {"host": host, "port": int(get_setting(db, "smtp_port") or 587), "user": get_setting(db, "smtp_user"),
            "password": get_secret(db, "smtp_password"), "from": sender}


def send_email(cfg: dict, to: str, subject: str, text: str, html: str | None = None) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg["from"]
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    ctx = ssl.create_default_context()
    if cfg["port"] == 465:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=ctx, timeout=20) as s:
            if cfg["user"]:
                s.login(cfg["user"], cfg["password"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=20) as s:
            s.starttls(context=ctx)
            if cfg["user"]:
                s.login(cfg["user"], cfg["password"])
            s.send_message(msg)


def email_html(title: str, body: str, button: str, url: str) -> str:
    return f"""<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111114">
  <div style="font-size:22px;font-weight:800;font-style:italic">Chat<span style="color:#e5161f">Flow</span></div>
  <h1 style="font-size:20px;margin:28px 0 8px">{title}</h1>
  <p style="font-size:15px;line-height:1.6;color:#3a3a42">{body}</p>
  <a href="{url}" style="display:inline-block;margin-top:16px;background:#e5161f;color:#fff;text-decoration:none;
     font-weight:600;padding:12px 22px;border-radius:12px">{button}</a>
  <p style="font-size:12px;color:#a1a1ab;margin-top:28px;word-break:break-all">{url}</p>
</div>"""


# ---------------------------------------------------------------- AI javoblar (Claude)

AI_MODEL = "claude-opus-5-5"
AI_RULES = """You are the Instagram Direct assistant of a business. You reply to customers on the business's behalf.

Rules:
- Reply in the same language the customer writes in (Tajik, Russian, Uzbek, English, ...).
- Use ONLY facts from the business information below. If the answer isn't there, say politely that a manager will reply soon — never invent prices, addresses, stock or promises.
- Keep it short and friendly: plain text, no markdown, at most 3-4 sentences (Instagram shows plain text only).
- Never ask for card numbers, passwords or codes.

Business information (written by the owner):
"""


def ai_available(db: Session) -> bool:
    return bool(get_secret(db, "anthropic_api_key"))


def ai_reply(db: Session, business_prompt: str, history: list[dict]) -> str | None:
    """history: [{"role": "user"|"assistant", "content": str}, ...] — oxirgisi mijoz xabari.

    Javob matnini qaytaradi; rad etilsa yoki xato bo'lsa — None.
    """
    key = get_secret(db, "anthropic_api_key")
    if not key or not history:
        return None
    # API birinchi xabar 'user' bo'lishini talab qiladi; ketma-ket bir xil rollar birlashtiriladi
    while history and history[0]["role"] != "user":
        history = history[1:]
    if not history:
        return None
    client = anthropic.Anthropic(api_key=key, timeout=60, max_retries=2)
    try:
        response = client.beta.messages.create(
            model=AI_MODEL,
            max_tokens=2000,
            system=AI_RULES + (business_prompt.strip() or "(no information provided)"),
            messages=history,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.RateLimitError as e:
        log.warning("AI rate limit: %s", e)
        return None
    except anthropic.APIStatusError as e:
        log.warning("AI API xatosi %s: %s", e.status_code, e.message)
        return None
    except anthropic.APIConnectionError as e:
        log.warning("AI ulanish xatosi: %s", e)
        return None
    if response.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    return text[:950] or None


# ---------------------------------------------------------------- Telegram

class TelegramError(Exception):
    pass


def _tg(token: str, method: str, **params) -> dict:
    try:
        r = _http.post(f"https://api.telegram.org/bot{token}/{method}", json=params)
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise TelegramError(str(e)) from e
    if not data.get("ok"):
        raise TelegramError(data.get("description") or "telegram error")
    return data["result"]


def telegram_connect(token: str) -> tuple[str, str]:
    """Botni tekshiradi va unga oxirgi yozgan chatni topadi -> (chat_id, title)."""
    _tg(token, "getMe")
    updates = _tg(token, "getUpdates", limit=50)
    for upd in reversed(updates):
        msg = upd.get("message") or upd.get("channel_post") or upd.get("my_chat_member") or {}
        chat = msg.get("chat")
        if chat:
            title = chat.get("title") or " ".join(x for x in (chat.get("first_name"), chat.get("last_name")) if x) \
                or chat.get("username") or str(chat["id"])
            return str(chat["id"]), title
    raise TelegramError("no_chat")


def telegram_send(token_enc: str, chat_id: str, text: str) -> None:
    if not token_enc or not chat_id:
        return
    try:
        _tg(decrypt(token_enc), "sendMessage", chat_id=chat_id, text=text[:4000], disable_web_page_preview=True)
    except (TelegramError, ValueError) as e:
        log.warning("telegram: %s", e)


# ---------------------------------------------------------------- webhook

def safe_url(url: str) -> bool:
    """Ichki tarmoq manzillariga (SSRF) so'rov yuborilmasin."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        for info in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except (ValueError, socket.gaierror, UnicodeError):
        return False


def post_webhook(url: str, payload: dict) -> str | None:
    """Xato bo'lsa matnini qaytaradi."""
    if not safe_url(url):
        return "blocked_url"
    try:
        r = _http.post(url, content=json.dumps(payload, ensure_ascii=False).encode(),
                       headers={"Content-Type": "application/json", "User-Agent": "ChatFlow-Webhook/1.0"},
                       follow_redirects=False)
        if r.status_code >= 400:
            return f"HTTP {r.status_code}"
    except httpx.HTTPError as e:
        return str(e)[:200]
    return None

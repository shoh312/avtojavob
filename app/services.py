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

SECRET_KEYS = ("smtp_password", "google_client_secret", "anthropic_api_key", "gemini_api_key")


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


# ---------------------------------------------------------------- AI javoblar (Gemini yoki Claude)

AI_MODEL = "claude-opus-5-5"
GEMINI_DEFAULT_MODEL = "gemini-flash-lite-latest"
AI_PROVIDERS = ("gemini", "claude")
AI_RULES = """You are the Instagram Direct assistant of a business. You reply to customers on the business's behalf.

Rules:
- Reply in the same language the customer writes in (Tajik, Russian, Uzbek, English, ...).
- Use ONLY facts from the business information below — never invent prices, addresses, stock or promises.
- Always answer the customer's actual question first, with concrete facts from the business information (if a price, \
product or condition is there — say it). Never hold back information that is in the business information.
- Greet only in your first message of the conversation; later messages go straight to the point.
- Keep it short and friendly: plain text, no markdown, at most 3-4 sentences (Instagram shows plain text only).
- Never ask for card numbers, passwords or codes.
"""
AI_NO_LEADS = """- If the answer isn't in the business information, say politely that a manager will reply soon.
"""
AI_LEADS = """- You also collect leads: get the customer's phone number so a manager can call them back.
- When the customer asks about prices, products, availability, delivery or how to order: FIRST answer with the facts \
from the business information, THEN add one short sentence asking for their phone number (for example: "Leave your \
phone number and our manager will contact you").
- If the answer isn't in the business information, ask for their phone number so the manager can contact them.
- Ask for the phone number only ONCE in the conversation. If one of your earlier messages already asked for it, \
don't ask again — just answer the question (unless the customer says they want to order now).
- Once the customer has given a phone number, or refused, never ask for it again.
"""
AI_LEADS_DONE = """- The customer has already given their phone number — don't ask for it again. If the answer isn't in the business \
information, say a manager will contact them soon.
"""
AI_BUSINESS = """
Business information (written by the owner):
"""


def ai_provider(db: Session) -> str:
    p = get_setting(db, "ai_provider")
    return p if p in AI_PROVIDERS else "gemini"


def ai_available(db: Session) -> bool:
    key = "gemini_api_key" if ai_provider(db) == "gemini" else "anthropic_api_key"
    return bool(get_secret(db, key))


def _clean_history(history: list[dict]) -> list[dict]:
    """Birinchi xabar mijozniki bo'lsin, ketma-ket bir xil rollar birlashtirilsin."""
    out: list[dict] = []
    for m in history:
        if not out and m["role"] != "user":
            continue
        if out and out[-1]["role"] == m["role"]:
            out[-1] = {"role": m["role"], "content": out[-1]["content"] + "\n" + m["content"]}
        else:
            out.append(dict(m))
    return out


def _gemini(db: Session, system: str, history: list[dict], json_mode: bool = False,
            max_tokens: int = 2048) -> tuple[str | None, str | None]:
    key = get_secret(db, "gemini_api_key")
    model = (get_setting(db, "gemini_model") or GEMINI_DEFAULT_MODEL).strip()
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                     for m in history],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.4,
                             **({"responseMimeType": "application/json"} if json_mode else {})},
    }
    try:
        r = _http.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                       headers={"x-goog-api-key": key}, json=body, timeout=60)
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        return None, f"connection: {e}"[:300]
    if r.status_code >= 400:
        err = (data.get("error") or {}) if isinstance(data, dict) else {}
        return None, f"HTTP {r.status_code}: {err.get('message') or r.text[:200]}"[:300]
    if (data.get("promptFeedback") or {}).get("blockReason"):
        return None, f"blocked: {data['promptFeedback']['blockReason']}"
    cand = (data.get("candidates") or [{}])[0]
    if cand.get("finishReason") in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"):
        return None, f"blocked: {cand['finishReason']}"
    text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []) if not p.get("thought"))
    return text.strip() or None, None if text.strip() else "empty answer"


def _claude(db: Session, system: str, history: list[dict], json_mode: bool = False,
            max_tokens: int = 2000) -> tuple[str | None, str | None]:
    client = anthropic.Anthropic(api_key=get_secret(db, "anthropic_api_key"), timeout=60, max_retries=2)
    try:
        response = client.beta.messages.create(
            model=AI_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=history,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.RateLimitError as e:
        return None, f"rate limit: {e}"[:300]
    except anthropic.APIStatusError as e:
        return None, f"HTTP {e.status_code}: {e.message}"[:300]
    except anthropic.APIConnectionError as e:
        return None, f"connection: {e}"[:300]
    if response.stop_reason == "refusal":
        return None, "refusal"
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    return text or None, None if text else "empty answer"


AI_CATALOG = """- The business has a product catalog (below). When the customer asks about price or products without saying \
which one, and there are several, briefly list the product names and ask which one they mean.
- When you talk about specific products, put their tags at the very end of your reply, e.g. [[product:12]] \
(at most 3). The customer will automatically get a card with the photo, price and an "Order" button — don't paste \
links or repeat all details yourself.
"""


def build_system(business_prompt: str, leads: str = "off", catalog: str = "") -> str:
    """leads: off | ask (telefon so'rash) | done (telefon allaqachon olingan)."""
    rules = {"ask": AI_LEADS, "done": AI_LEADS_DONE}.get(leads, AI_NO_LEADS)
    out = AI_RULES + rules + (AI_CATALOG if catalog else "") + AI_BUSINESS + (business_prompt.strip() or "(no information provided)")
    if catalog:
        out += "\n\nProduct catalog:\n" + catalog
    return out


def ai_generate(db: Session, business_prompt: str, history: list[dict], leads: str = "off",
                catalog: str = "") -> tuple[str | None, str | None]:
    """(javob, xato). history: [{"role": "user"|"assistant", "content": str}, ...] — oxirgisi mijozniki."""
    if not ai_available(db):
        return None, "not configured"
    history = _clean_history(history)
    if not history:
        return None, "empty history"
    system = build_system(business_prompt, leads, catalog)
    text, error = (_gemini if ai_provider(db) == "gemini" else _claude)(db, system, history)
    if error:
        log.warning("AI (%s): %s", ai_provider(db), error)
    return (text[:950] if text else None), error


def ai_complete(db: Session, system: str, user_text: str, json_mode: bool = False,
                max_tokens: int = 8000) -> tuple[str | None, str | None]:
    """Bir martalik so'rov (masalan, ssenariy yaratish)."""
    if not ai_available(db):
        return None, "not configured"
    fn = _gemini if ai_provider(db) == "gemini" else _claude
    return fn(db, system, [{"role": "user", "content": user_text}], json_mode=json_mode, max_tokens=max_tokens)


def ai_reply(db: Session, business_prompt: str, history: list[dict], leads: str = "off", catalog: str = "") -> str | None:
    return ai_generate(db, business_prompt, history, leads, catalog)[0]


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


def telegram_connect(token: str, webhook: str | None = None, secret: str | None = None) -> tuple[str, str]:
    """Botni tekshiradi, unga oxirgi yozgan chatni topadi va webhook o'rnatadi -> (chat_id, title)."""
    me = _tg(token, "getMe")
    try:
        _tg(token, "deleteWebhook")  # getUpdates webhook bilan birga ishlamaydi
    except TelegramError:
        pass
    updates = _tg(token, "getUpdates", limit=50)
    chat = _last_chat(updates)
    if webhook and webhook.startswith("https://"):
        _tg(token, "setWebhook", url=webhook, secret_token=secret, allowed_updates=["message", "callback_query"])
    global LAST_BOT_USERNAME
    LAST_BOT_USERNAME = (me or {}).get("username") or ""
    return chat


LAST_BOT_USERNAME = ""


def _last_chat(updates: list) -> tuple[str, str]:
    for upd in reversed(updates):
        msg = upd.get("message") or upd.get("channel_post") or upd.get("my_chat_member") or {}
        chat = msg.get("chat")
        if chat:
            title = chat.get("title") or " ".join(x for x in (chat.get("first_name"), chat.get("last_name")) if x) \
                or chat.get("username") or str(chat["id"])
            return str(chat["id"]), title
    raise TelegramError("no_chat")


def telegram_send(token_enc: str, chat_id: str, text: str, reply_markup: dict | None = None, **extra) -> int | None:
    """Xabar yuboradi; Telegram'dagi message_id ni qaytaradi (xato bo'lsa — None)."""
    if not token_enc or not chat_id:
        return None
    params = {"chat_id": chat_id, "text": text[:4000], "disable_web_page_preview": True, **extra}
    if reply_markup:
        params["reply_markup"] = reply_markup
    try:
        result = _tg(decrypt(token_enc), "sendMessage", **params)
        return result.get("message_id") if isinstance(result, dict) else None
    except (TelegramError, ValueError) as e:
        log.warning("telegram: %s", e)
        return None


def telegram_call(token_enc: str, method: str, **params):
    return _tg(decrypt(token_enc), method, **params)


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

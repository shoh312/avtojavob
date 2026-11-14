"""Instagram API with Instagram Login — kerakli chaqiruvlar."""

import threading
from collections import deque
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

from .config import settings

AUTH_URL = "https://www.instagram.com/oauth/authorize"
TOKEN_URL = "https://api.instagram.com/oauth/access_token"
SCOPES = ",".join([
    "instagram_business_basic",
    "instagram_business_manage_messages",
    "instagram_business_manage_comments",
])

_client = httpx.Client(timeout=20)

# ChatFlow o'zi yuborgan xabarlar ID'lari: webhook "echo" kelganda ularni
# Instagram ilovasidan qo'lda yozilgan xabarlardan ajratish uchun.
_sent: deque[str] = deque(maxlen=5000)
_sent_lock = threading.Lock()


def _remember(resp: dict) -> dict:
    mid = (resp or {}).get("message_id")
    if mid:
        with _sent_lock:
            _sent.append(str(mid))
    return resp


def sent_by_us(mid: str) -> bool:
    with _sent_lock:
        return mid in _sent


class IGError(Exception):
    pass


def _graph(path: str) -> str:
    return f"https://graph.instagram.com/{settings.GRAPH_VERSION}/{path.lstrip('/')}"


def _json(resp: httpx.Response) -> dict:
    try:
        data = resp.json()
    except ValueError:
        data = {}
    if resp.status_code >= 400 or (isinstance(data, dict) and "error" in data):
        err = data.get("error") if isinstance(data, dict) else None
        if isinstance(err, dict):
            msg = err.get("message") or str(err)
        else:
            msg = data.get("error_message") or resp.text[:300]
        raise IGError(msg)
    return data


# ---------- OAuth ----------

def authorize_url(state: str) -> str:
    params = {
        "client_id": settings.IG_APP_ID,
        "redirect_uri": settings.redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    code = code.split("#")[0]
    resp = _client.post(TOKEN_URL, data={
        "client_id": settings.IG_APP_ID,
        "client_secret": settings.IG_APP_SECRET,
        "grant_type": "authorization_code",
        "redirect_uri": settings.redirect_uri,
        "code": code,
    })
    data = _json(resp)
    # Ba'zan javob {"data": [ {...} ]} ko'rinishida keladi
    if "data" in data and isinstance(data["data"], list) and data["data"]:
        data = data["data"][0]
    return data


def get_long_lived_token(short_token: str) -> tuple[str, int]:
    data = _json(_client.get("https://graph.instagram.com/access_token", params={
        "grant_type": "ig_exchange_token",
        "client_secret": settings.IG_APP_SECRET,
        "access_token": short_token,
    }))
    return data["access_token"], int(data.get("expires_in", 0))


def refresh_token(token: str) -> tuple[str, int]:
    data = _json(_client.get("https://graph.instagram.com/refresh_access_token", params={
        "grant_type": "ig_refresh_token",
        "access_token": token,
    }))
    return data["access_token"], int(data.get("expires_in", 0))


# ---------- Akkaunt ----------

def get_me(token: str) -> dict:
    return _json(_client.get(_graph("me"), params={
        "fields": "id,user_id,username,name,profile_picture_url,followers_count",
        "access_token": token,
    }))


def subscribe_webhooks(token: str) -> None:
    _json(_client.post(_graph("me/subscribed_apps"), params={
        "subscribed_fields": "comments,messages,messaging_postbacks",
        "access_token": token,
    }))


def list_media(token: str, limit: int = 30) -> list[dict]:
    data = _json(_client.get(_graph("me/media"), params={
        "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
        "limit": limit,
        "access_token": token,
    }))
    return data.get("data", [])


# ---------- Javoblar ----------

def reply_to_comment(token: str, comment_id: str, text: str) -> dict:
    return _json(_client.post(_graph(f"{comment_id}/replies"), params={
        "message": text,
        "access_token": token,
    }))


def url_button(title: str, url: str) -> dict:
    return {"type": "web_url", "title": title[:20], "url": url}


def postback_button(title: str, payload: str) -> dict:
    return {"type": "postback", "title": title[:20], "payload": payload}


def build_message(text: str, buttons: list[dict] | None = None) -> dict:
    """Matn + (ixtiyoriy) 3 tagacha tugma — Instagram 'button template'."""
    if not buttons:
        return {"text": text}
    return {"attachment": {"type": "template", "payload": {
        "template_type": "button",
        "text": text[:640],
        "buttons": buttons[:3],
    }}}


def private_reply(token: str, comment_id: str, message: dict) -> dict:
    """Izoh yozgan odamga Direct'ga xabar (har bir izohga 1 marta, 7 kun ichida)."""
    return _remember(_json(_client.post(_graph("me/messages"), params={"access_token": token}, json={
        "recipient": {"comment_id": comment_id},
        "message": message,
    })))


def send_dm(token: str, recipient_id: str, message: dict) -> dict:
    return _remember(_json(_client.post(_graph("me/messages"), params={"access_token": token}, json={
        "recipient": {"id": recipient_id},
        "message": message,
    })))


def _parse_time(v: str) -> datetime | None:
    try:
        return datetime.strptime(v, "%Y-%m-%dT%H:%M:%S%z").astimezone(timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def conversation_history(token: str, igsid: str, limit: int = 40) -> list[dict]:
    """Mijoz bilan suhbatning oxirgi xabarlari (eskidan yangiga):
    [{"id", "from_id", "text", "created_at"}]. Instagram faqat oxirgi ~20 ta xabar tafsilotini beradi."""
    conv = _json(_client.get(_graph("me/conversations"), params={
        "platform": "instagram", "user_id": igsid, "access_token": token,
        "fields": f"messages.limit({limit}){{id,created_time,from,message}}",
    })).get("data") or []
    if not conv:
        return []
    raw = ((conv[0].get("messages") or {}).get("data")) or []
    if raw and "created_time" not in raw[0]:  # ichki maydonlar qaytmadi — har birini alohida so'raymiz
        detailed = []
        for m in raw[:20]:
            try:
                detailed.append(_json(_client.get(_graph(m["id"]), params={
                    "fields": "id,created_time,from,message", "access_token": token})))
            except IGError:
                continue
        raw = detailed
    out = []
    for m in raw:
        at = _parse_time(m.get("created_time") or "")
        if not at:
            continue
        out.append({"id": str(m.get("id") or ""), "from_id": str((m.get("from") or {}).get("id") or ""),
                    "text": m.get("message") or "", "created_at": at})
    return sorted(out, key=lambda x: x["created_at"])


IMAGE_HOSTS = ("fbcdn.net", "cdninstagram.com", "fbsbx.com")


def fetch_image(url: str, limit: int = 2 * 1024 * 1024) -> bytes | None:
    """Instagram CDN'dagi rasmni yuklab olish (faqat rasmiy hostlar, 2 MB gacha)."""
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or "").lower()
    if not url.startswith("https://") or not any(host == h or host.endswith("." + h) for h in IMAGE_HOSTS):
        return None
    try:
        r = _client.get(url, follow_redirects=True)
    except httpx.HTTPError:
        return None
    data = r.content
    if r.status_code != 200 or len(data) > limit:
        return None
    if not (data.startswith(b"\xff\xd8") or data.startswith(b"\x89PNG") or data[8:12] == b"WEBP"):
        return None
    return data


def get_user_profile(token: str, igsid: str) -> dict:
    """Xabar yozgan foydalanuvchi haqida: username va bizga obuna bo'lganmi."""
    return _json(_client.get(_graph(igsid), params={
        "fields": "name,username,profile_pic,is_user_follow_business",
        "access_token": token,
    }))

"""Instagram API with Instagram Login — kerakli chaqiruvlar."""

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
        "fields": "id,user_id,username,name,profile_picture_url",
        "access_token": token,
    }))


def subscribe_webhooks(token: str) -> None:
    _json(_client.post(_graph("me/subscribed_apps"), params={
        "subscribed_fields": "comments,messages",
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


def private_reply(token: str, comment_id: str, text: str) -> dict:
    """Izoh yozgan odamga Direct'ga xabar (har bir izohga 1 marta, 7 kun ichida)."""
    return _json(_client.post(_graph("me/messages"), params={"access_token": token}, json={
        "recipient": {"comment_id": comment_id},
        "message": {"text": text},
    }))


def send_dm(token: str, recipient_id: str, text: str) -> dict:
    return _json(_client.post(_graph("me/messages"), params={"access_token": token}, json={
        "recipient": {"id": recipient_id},
        "message": {"text": text},
    }))

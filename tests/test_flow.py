"""Meta'ga ulanmasdan to'liq oqimni tekshirish (Instagram chaqiruvlari soxtalashtirilgan)."""

import hashlib
import hmac
import json
import os
import sqlite3
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "test.db")
# TEST_DATABASE_URL=postgresql+psycopg://... bilan PostgreSQL'da ham ishga tushirish mumkin
_TEST_DB = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_db}"
os.environ.update({
    "DATABASE_URL": _TEST_DB,
    "IG_APP_ID": "123",
    "IG_APP_SECRET": "test-secret",
    "WEBHOOK_VERIFY_TOKEN": "verify-me",
    "SECRET_KEY": "test",
})

# Eski (v1) sxemadagi jadval — yangi ustunlar avtomatik qo'shilishini tekshirish uchun
if _TEST_DB.startswith("sqlite"):
    _con = sqlite3.connect(_db)
    _con.execute("""CREATE TABLE rules (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL, name VARCHAR(120) NOT NULL,
    trigger VARCHAR(16) NOT NULL, keywords TEXT NOT NULL, match_mode VARCHAR(16) NOT NULL, media_id VARCHAR(64),
    media_caption VARCHAR(255) NOT NULL, comment_replies TEXT NOT NULL, dm_text TEXT NOT NULL, active BOOLEAN NOT NULL,
    hits INTEGER NOT NULL, created_at DATETIME NOT NULL)""")
    _con.commit()
    _con.close()

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import instagram as ig  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import EventLog, IGAccount, Rule  # noqa: E402
from app.security import encrypt  # noqa: E402

IG_ID = "17841400000000001"
# Haqiqiy Instagram mid'lari ~200 belgi bo'ladi
LONG_MID = ("aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDAwMDAwMDAwMDE6MzQwMjgyMzY2ODQxNzEwMzAwOTQ5MTI4"
            "MTk2MzA0NDQxMjQ4NDU0OjMxOTkwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw")
calls: list[tuple] = []
ACC: dict = {}
profile = {"follows": False}


@pytest.fixture(scope="module")
def client():
    ig_fakes = {
        "reply_to_comment": lambda t, cid, text: calls.append(("comment", cid, text)) or {"id": "r1"},
        "private_reply": lambda t, cid, msg: calls.append(("private", cid, msg)) or {"message_id": "m1"},
        "send_dm": lambda t, rid, msg: calls.append(("dm", rid, msg)) or {"message_id": "m2"},
        "list_media": lambda t, limit=30: [{"id": "M1", "caption": "Yangi kolleksiya", "timestamp": "2026-11-01T10:00:00"}],
        "get_user_profile": lambda t, igsid: {"username": "mijoz", "is_user_follow_business": profile["follows"]},
        "subscribe_webhooks": lambda t: None,
    }
    originals = {k: getattr(ig, k) for k in ig_fakes}
    for k, v in ig_fakes.items():
        setattr(ig, k, v)
    with TestClient(app) as c:
        yield c
    for k, v in originals.items():
        setattr(ig, k, v)


def post_webhook(client, payload):
    body = json.dumps(payload).encode()
    sig = "sha256=" + hmac.new(b"test-secret", body, hashlib.sha256).hexdigest()
    return client.post("/webhook", content=body, headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"})


def comment_payload(comment_id, text, from_id="999", media_id="M1"):
    return {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "changes": [{
        "field": "comments",
        "value": {"id": comment_id, "text": text, "from": {"id": from_id, "username": "mijoz"},
                  "media": {"id": media_id, "media_product_type": "FEED"}},
    }]}]}


def postback_payload(mid, payload, title="Havolani olish", sender="555"):
    return {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [
        {"sender": {"id": sender}, "recipient": {"id": IG_ID}, "timestamp": 1,
         "postback": {"mid": mid, "title": title, "payload": payload}},
    ]}]}


def buttons_of(msg):
    return msg["attachment"]["payload"]["buttons"]


def test_pages_and_auth(client):
    assert client.get("/").status_code == 200
    assert client.get("/privacy").status_code == 200
    assert client.get("/dashboard", follow_redirects=False).headers["location"] == "/login"
    r = client.post("/register", data={"name": "Ali", "email": "a@b.uz", "password": "12345678"})
    assert r.status_code == 200 and "Salom, Ali" in r.text


def test_webhook_verify(client):
    ok = client.get("/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42"})
    assert ok.text == "42"
    bad = client.get("/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "42"})
    assert bad.status_code == 403


def test_rule_and_comment_flow(client):
    with SessionLocal() as db:
        acc = IGAccount(user_id=1, ig_user_id=IG_ID, username="dokon", access_token_enc=encrypt("tok"))
        db.add(acc)
        db.commit()
        ACC["id"] = acc.id
    aid = ACC["id"]

    page = client.get(f"/accounts/{aid}/rules/new")
    assert page.status_code == 200 and "Yangi kolleksiya" in page.text and "Obuna tekshiruvi" in page.text

    r = client.post(f"/accounts/{ACC['id']}/rules/new", data={
        "name": "Narx", "trigger": "comment", "keywords": "narx, price", "match_mode": "contains",
        "media": "", "comment_replies": "Direct'ga yozdik {username}", "dm_text": "Narxi 100 000 so'm",
    })
    assert "Narx" in r.text
    client.post(f"/accounts/{ACC['id']}/rules/new", data={
        "name": "Salom", "trigger": "dm", "keywords": "salom", "match_mode": "contains", "dm_text": "Va alaykum assalom!",
    })

    assert client.post("/webhook", json=comment_payload("c0", "narx")).status_code == 403

    calls.clear()
    assert post_webhook(client, comment_payload("c1", "NARXI qancha?")).text == "EVENT_RECEIVED"
    assert ("comment", "c1", "Direct'ga yozdik @mijoz") in calls
    assert ("private", "c1", {"text": "Narxi 100 000 so'm"}) in calls

    calls.clear()
    post_webhook(client, comment_payload("c1", "NARXI qancha?"))
    post_webhook(client, comment_payload("c2", "zo'r post"))
    post_webhook(client, comment_payload("c3", "narx", from_id=IG_ID))
    assert calls == []

    post_webhook(client, {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [
        {"sender": {"id": "555"}, "recipient": {"id": IG_ID}, "timestamp": 1, "message": {"mid": LONG_MID + "m", "text": "Salom!"}},
        {"sender": {"id": IG_ID}, "recipient": {"id": "555"}, "timestamp": 1, "message": {"mid": "mid2", "text": "salom", "is_echo": True}},
    ]}]})
    assert calls == [("dm", "555", {"text": "Va alaykum assalom!"})]

    with SessionLocal() as db:
        assert db.query(Rule).filter_by(name="Narx").one().hits == 1
        assert db.query(EventLog).count() == 3


def test_link_buttons(client):
    r = client.post(f"/accounts/{ACC['id']}/rules/new", data={
        "name": "Katalog", "trigger": "comment", "keywords": "katalog", "match_mode": "contains",
        "dm_text": "Mana katalog 👇",
        "btn_title": ["Katalog", "Telegram", ""], "btn_url": ["https://shop.uz", "https://t.me/shop", ""],
    })
    assert "🔗 2 ta tugma" in r.text

    calls.clear()
    post_webhook(client, comment_payload("c10", "katalog bormi"))
    (_, cid, msg), = calls
    assert cid == "c10"
    assert msg["attachment"]["payload"]["text"] == "Mana katalog 👇"
    assert buttons_of(msg) == [
        {"type": "web_url", "title": "Katalog", "url": "https://shop.uz"},
        {"type": "web_url", "title": "Telegram", "url": "https://t.me/shop"},
    ]

    bad = client.post(f"/accounts/{ACC['id']}/rules/new", data={
        "name": "X", "trigger": "comment", "keywords": "x", "match_mode": "contains", "dm_text": "x",
        "btn_title": ["Nomi bor"], "btn_url": ["shop.uz"],
    })
    assert "https://" in bad.text


def test_follow_gate(client):
    r = client.post(f"/accounts/{ACC['id']}/rules/new", data={
        "name": "Sovg'a", "trigger": "comment", "keywords": "sovg'a", "match_mode": "contains",
        "dm_text": "Salom {username}! Sovg'ani olish uchun bosing", "follow_gate": "1",
        "gate_button": "Sovg'ani olish", "reward_text": "Rahmat! Mana sovg'a 🎁",
        "btn_title": ["Yuklab olish"], "btn_url": ["https://shop.uz/gift.pdf"],
    })
    assert "🔒 obuna tekshiruvi" in r.text
    with SessionLocal() as db:
        rule_id = db.query(Rule).filter_by(name="Sovg'a").one().id

    # 1) izoh -> postback tugmali birinchi xabar
    calls.clear()
    post_webhook(client, comment_payload("c20", "SOVG’A kerak"))  # boshqa apostrof ham ishlaydi
    (_, _, msg), = calls
    assert msg["attachment"]["payload"]["text"] == "Salom @mijoz! Sovg'ani olish uchun bosing"
    assert buttons_of(msg) == [{"type": "postback", "title": "Sovg'ani olish", "payload": f"G:{rule_id}"}]

    # 2) obuna emas -> "obuna bo'ling" + profil + "obuna bo'ldim"
    calls.clear()
    profile["follows"] = False
    post_webhook(client, postback_payload(LONG_MID + "1", f"G:{rule_id}"))
    (kind, rid, msg), = calls
    assert (kind, rid) == ("dm", "555")
    btns = buttons_of(msg)
    assert btns[0] == {"type": "web_url", "title": "Profilga o'tish", "url": "https://www.instagram.com/dokon/"}
    assert btns[1]["type"] == "postback" and btns[1]["payload"] == f"G:{rule_id}"

    # 3) obuna bo'ldi -> mukofot + havola
    calls.clear()
    profile["follows"] = True
    post_webhook(client, postback_payload(LONG_MID + "2", f"G:{rule_id}", title="Obuna bo'ldim ✅"))
    (_, _, msg), = calls
    assert msg["attachment"]["payload"]["text"] == "Rahmat! Mana sovg'a 🎁"
    assert buttons_of(msg) == [{"type": "web_url", "title": "Yuklab olish", "url": "https://shop.uz/gift.pdf"}]

    # takroriy postback va begona payload e'tiborsiz
    calls.clear()
    post_webhook(client, postback_payload(LONG_MID + "2", f"G:{rule_id}"))
    post_webhook(client, postback_payload("pb3", "G:99999"))
    post_webhook(client, postback_payload("pb4", "boshqa"))
    assert calls == []

    logs = client.get("/logs").text
    assert "Obuna ✅ havola berildi" in logs and "so‘raldi" in logs

    edit = client.get(f"/rules/{rule_id}/edit").text
    assert "https://shop.uz/gift.pdf" in edit and "Rahmat! Mana sovg" in edit
    assert client.get("/dashboard").status_code == 200

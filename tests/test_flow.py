"""Meta'ga ulanmasdan to'liq oqimni tekshirish (Instagram chaqiruvlari soxtalashtirilgan)."""

import hashlib
import hmac
import json
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ.update({
    "DATABASE_URL": f"sqlite:///{_db}",
    "IG_APP_ID": "123",
    "IG_APP_SECRET": "test-secret",
    "WEBHOOK_VERIFY_TOKEN": "verify-me",
    "SECRET_KEY": "test",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import instagram as ig  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import EventLog, IGAccount, Rule  # noqa: E402
from app.security import encrypt  # noqa: E402

IG_ID = "17841400000000001"
calls: list[tuple] = []


@pytest.fixture(scope="module")
def client():
    ig_fakes = {
        "reply_to_comment": lambda t, cid, text: calls.append(("comment", cid, text)) or {"id": "r1"},
        "private_reply": lambda t, cid, text: calls.append(("private", cid, text)) or {"message_id": "m1"},
        "send_dm": lambda t, rid, text: calls.append(("dm", rid, text)) or {"message_id": "m2"},
        "list_media": lambda t, limit=30: [{"id": "M1", "caption": "Yangi kolleksiya", "timestamp": "2026-11-01T10:00:00"}],
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
    # Akkauntni OAuth'siz to'g'ridan-to'g'ri bazaga qo'shamiz
    with SessionLocal() as db:
        acc = IGAccount(user_id=1, ig_user_id=IG_ID, username="dokon", access_token_enc=encrypt("tok"))
        db.add(acc)
        db.commit()
        acc_id = acc.id

    page = client.get(f"/accounts/{acc_id}/rules/new")
    assert page.status_code == 200 and "Yangi kolleksiya" in page.text

    r = client.post(f"/accounts/{acc_id}/rules/new", data={
        "name": "Narx", "trigger": "comment", "keywords": "narx, price", "match_mode": "contains",
        "media": "", "comment_replies": "Direct'ga yozdik {username}", "dm_text": "Narxi 100 000 so'm",
    })
    assert "Narx" in r.text
    client.post(f"/accounts/{acc_id}/rules/new", data={
        "name": "Salom", "trigger": "dm", "keywords": "salom", "match_mode": "contains", "dm_text": "Va alaykum assalom!",
    })

    # Imzosiz so'rov rad etiladi
    assert client.post("/webhook", json=comment_payload("c0", "narx")).status_code == 403

    calls.clear()
    assert post_webhook(client, comment_payload("c1", "NARXI qancha?")).text == "EVENT_RECEIVED"
    assert ("comment", "c1", "Direct'ga yozdik @mijoz") in calls
    assert ("private", "c1", "Narxi 100 000 so'm") in calls

    # Takroriy webhook — qayta javob yo'q
    calls.clear()
    post_webhook(client, comment_payload("c1", "NARXI qancha?"))
    assert calls == []

    # Mos kelmaydigan izoh va o'zimizning izoh
    post_webhook(client, comment_payload("c2", "zo'r post"))
    post_webhook(client, comment_payload("c3", "narx", from_id=IG_ID))
    assert calls == []

    # Direct xabar
    post_webhook(client, {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [
        {"sender": {"id": "555"}, "recipient": {"id": IG_ID}, "timestamp": 1, "message": {"mid": "mid1", "text": "Salom!"}},
        {"sender": {"id": IG_ID}, "recipient": {"id": "555"}, "timestamp": 1, "message": {"mid": "mid2", "text": "salom", "is_echo": True}},
    ]}]})
    assert calls == [("dm", "555", "Va alaykum assalom!")]

    with SessionLocal() as db:
        assert db.query(Rule).filter_by(name="Narx").one().hits == 1
        assert db.query(EventLog).count() == 3

    logs = client.get("/logs")
    assert "Izohga javob" in logs.text and "@mijoz" in logs.text
    assert client.get("/dashboard").status_code == 200

"""ChatFlow: API va ssenariy dvigatelini Meta'ga ulanmasdan tekshirish (Instagram chaqiruvlari soxta).

PostgreSQL'da ishga tushirish:  TEST_DATABASE_URL=postgresql+psycopg://... pytest
"""

import hashlib
import hmac
import json
import os
import tempfile
from datetime import timedelta

_db = os.path.join(tempfile.mkdtemp(), "test.db")
_TEST_DB = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_db}"
os.environ.update({"DATABASE_URL": _TEST_DB, "IG_APP_ID": "123", "IG_APP_SECRET": "test-secret",
                   "WEBHOOK_VERIFY_TOKEN": "verify-me", "SECRET_KEY": "test"})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import instagram as ig  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.engine import run_due_jobs  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Contact, IGAccount, ScheduledJob, utcnow  # noqa: E402
from app.security import encrypt  # noqa: E402

IG_ID = "17841400000000001"
LONG_MID = ("aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDAwMDAwMDAwMDE6MzQwMjgyMzY2ODQxNzEwMzAwOTQ5MTI4"
            "MTk2MzA0NDQxMjQ4NDU0OjMxOTkwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw")
H = {"X-ChatFlow": "1"}
calls: list[tuple] = []
profile = {"follows": False}
S: dict = {}


@pytest.fixture(scope="module")
def client():
    fakes = {
        "reply_to_comment": lambda t, cid, text: calls.append(("comment", cid, text)) or {"id": "r1"},
        "private_reply": lambda t, cid, msg: calls.append(("private", cid, msg)) or {"message_id": "m1"},
        "send_dm": lambda t, rid, msg: calls.append(("dm", rid, msg)) or {"message_id": "m2"},
        "list_media": lambda t, limit=30: [{"id": "M1", "caption": "Yangi kolleksiya"}],
        "get_user_profile": lambda t, igsid: {"username": "mijoz", "is_user_follow_business": profile["follows"]},
        "subscribe_webhooks": lambda t: None,
    }
    originals = {k: getattr(ig, k) for k in fakes}
    for k, v in fakes.items():
        setattr(ig, k, v)
    with TestClient(app) as c:
        yield c
    for k, v in originals.items():
        setattr(ig, k, v)


def hook(client, payload):
    body = json.dumps(payload).encode()
    sig = "sha256=" + hmac.new(b"test-secret", body, hashlib.sha256).hexdigest()
    r = client.post("/webhook", content=body, headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"})
    assert r.text == "EVENT_RECEIVED"


def comment(cid, text, from_id="999", media_id="M1"):
    return {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "changes": [{"field": "comments", "value": {
        "id": cid, "text": text, "from": {"id": from_id, "username": "mijoz"}, "media": {"id": media_id}}}]}]}


def messaging(event, sender="999"):
    return {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [
        {"sender": {"id": sender}, "recipient": {"id": IG_ID}, "timestamp": 1, **event}]}]}


def text_msg(mid, text, **extra):
    return messaging({"message": {"mid": mid, "text": text, **extra}})


def postback(mid, payload):
    return messaging({"postback": {"mid": mid, "title": "btn", "payload": payload}})


def buttons(msg):
    return msg["attachment"]["payload"]["buttons"]


def text_of(msg):
    return msg.get("text") or msg["attachment"]["payload"]["text"]


def node(graph, ntype, nth=0):
    return [n for n in graph["nodes"] if n["type"] == ntype][nth]


# ------------------------------------------------------------------ auth va sahifalar

def test_auth_and_pages(client):
    assert client.get("/privacy?lang=tj").status_code == 200
    assert "Политика" in client.get("/privacy?lang=ru").text
    assert client.get("/api/me").status_code == 401
    # CSRF: maxsus sarlavhasiz o'zgartiruvchi so'rov rad etiladi
    assert client.post("/api/auth/register", json={"email": "a@b.tj", "password": "12345678"}).status_code == 403
    r = client.post("/api/auth/register", json={"email": "a@b.tj", "password": "12345678", "name": "Ali",
                                                 "lang": "uz"}, headers=H)
    assert r.status_code == 200 and r.json()["user"]["lang"] == "uz"
    assert client.post("/api/auth/register", json={"email": "a@b.tj", "password": "12345678"},
                       headers=H).json()["error"] == "email_taken"
    assert client.get("/api/me").json()["user"]["name"] == "Ali"

    with SessionLocal() as db:
        acc = IGAccount(user_id=r.json()["user"]["id"], ig_user_id=IG_ID, username="dokon",
                        access_token_enc=encrypt("tok"))
        db.add(acc)
        db.commit()
        S["acc"] = acc.id
    assert client.get("/api/me").json()["accounts"][0]["username"] == "dokon"
    assert client.get(f"/api/accounts/{S['acc']}/media").json()["items"][0]["id"] == "M1"


def test_templates_list(client):
    items = client.get("/api/templates").json()["items"]
    assert [t["key"] for t in items] == ["price", "gift", "lead", "story"]
    assert items[0]["name"] == "Narx so'raganlar"  # foydalanuvchi tili: uz


# ------------------------------------------------------------------ ssenariylar

def create(client, template=None, name=None):
    r = client.post("/api/flows", json={"account_id": S["acc"], "template": template, "name": name}, headers=H)
    assert r.status_code == 200, r.text
    return client.get(f"/api/flows/{r.json()['id']}").json()


def activate(client, flow, graph=None):
    r = client.put(f"/api/flows/{flow['id']}", json={"graph": graph or flow["graph"], "active": True}, headers=H)
    assert r.json()["active"] is True, r.json()["errors"]


def test_validation_blocks_activation(client):
    flow = create(client)  # bo'sh: faqat trigger, kalit so'zsiz
    r = client.put(f"/api/flows/{flow['id']}", json={"graph": flow["graph"], "active": True}, headers=H).json()
    assert r["active"] is False and r["errors"][0]["code"] == "trigger_keywords"
    client.delete(f"/api/flows/{flow['id']}", headers=H)


def test_price_template(client):
    flow = create(client, "price")
    activate(client, flow)
    calls.clear()
    hook(client, comment("c1", "NARXI qancha?"))
    assert calls[0][0] == "comment" and calls[0][2] in ("Direct'ga yozdik 📩", "Ma'lumot Direct'da ✅")
    kind, cid, msg = calls[1]
    assert (kind, cid) == ("private", "c1")
    assert text_of(msg) == "Salom, @mijoz! 👋 Narxlar va katalog quyida:"
    assert [b["type"] for b in buttons(msg)] == ["web_url", "web_url"]

    calls.clear()
    hook(client, comment("c1", "narx"))          # takroriy
    hook(client, comment("c2", "zo'r"))          # mos emas
    hook(client, comment("c3", "narx", IG_ID))   # o'zimiz
    assert calls == []
    stats = client.get(f"/api/flows/{flow['id']}/stats").json()
    assert stats["runs"] == 1 and stats["nodes"][node(flow["graph"], "message")["id"]]["sent"] == 1
    client.put(f"/api/flows/{flow['id']}", json={"active": False}, headers=H)


def test_gift_follow_gate(client):
    flow = create(client, "gift")
    activate(client, flow)
    g = flow["graph"]
    first = node(g, "message", 0)
    get_btn = first["data"]["buttons"][0]["id"]

    calls.clear()
    hook(client, comment("c10", "SOVG’A kerak"))
    _, _, msg = calls[-1]
    payload = buttons(msg)[0]["payload"]
    assert payload == f"F:{flow['id']}:{first['id']}:{get_btn}"

    # obuna emas -> "obuna bo'ling" + "Obuna bo'ldim" tugmasi
    calls.clear()
    profile["follows"] = False
    hook(client, postback(LONG_MID + "1", payload))
    (kind, rid, msg), = calls
    assert (kind, rid) == ("dm", "999") and "obuna" in text_of(msg).lower()
    again = buttons(msg)[0]["payload"]

    # obuna bo'ldi -> sovg'a havolasi
    calls.clear()
    profile["follows"] = True
    hook(client, postback(LONG_MID + "2", again))
    (_, _, msg), = calls
    assert buttons(msg)[0]["url"] == "https://example.com/gift.pdf"

    calls.clear()
    hook(client, postback(LONG_MID + "2", again))     # takroriy
    hook(client, postback(LONG_MID + "3", "F:99999:x:y"))  # begona
    assert calls == []
    cond = node(g, "condition")["id"]
    st = client.get(f"/api/flows/{flow['id']}/stats").json()["nodes"]
    assert st[cond] == {"no": 1, "yes": 1} and st[first["id"]][f"clicked:{get_btn}"] == 1
    client.put(f"/api/flows/{flow['id']}", json={"active": False}, headers=H)


def test_lead_question_flow(client):
    flow = create(client, "lead")
    activate(client, flow)
    calls.clear()
    hook(client, text_msg(LONG_MID + "a", "Buyurtma bermoqchiman", ))
    assert "telefon" in text_of(calls[-1][2]).lower()

    calls.clear()
    hook(client, text_msg(LONG_MID + "b", "bilmadim"))          # noto'g'ri -> xato matni
    assert "to'g'ri raqam" in text_of(calls[-1][2])
    calls.clear()
    hook(client, text_msg(LONG_MID + "c", "+992 90 123 45 67"))  # to'g'ri -> teg + rahmat
    assert "Rahmat" in text_of(calls[-1][2])

    contacts = client.get(f"/api/contacts?account_id={S['acc']}").json()
    c = contacts["items"][0]
    assert c["fields"]["phone"] == "+992 90 123 45 67" and "lead" in c["tags"] and contacts["tags"] == ["lead"]
    assert client.get(f"/api/contacts?account_id={S['acc']}&tag=lead").json()["total"] == 1
    csv_text = client.get(f"/api/contacts/export.csv?account_id={S['acc']}").text
    assert "phone" in csv_text and "+992 90 123 45 67" in csv_text
    client.put(f"/api/flows/{flow['id']}", json={"active": False}, headers=H)


def test_story_reply_and_delay(client):
    flow = create(client, "story")
    g = flow["graph"]
    trig, msg = node(g, "trigger"), node(g, "message")
    # trigger -> kutish(5 daqiqa) -> xabar
    delay = {"id": "d1", "type": "delay", "position": {"x": 200, "y": 0}, "data": {"amount": 5, "unit": "minutes"}}
    g["nodes"].append(delay)
    g["edges"] = [{"id": "e1", "source": trig["id"], "sourceHandle": "out", "target": "d1"},
                  {"id": "e2", "source": "d1", "sourceHandle": "out", "target": msg["id"]}]
    activate(client, flow, g)

    calls.clear()
    hook(client, text_msg(LONG_MID + "s", "🔥", reply_to={"story": {"id": "st1", "url": "https://x"}}))
    assert calls == []  # hali kutilmoqda
    with SessionLocal() as db:
        job = db.query(ScheduledJob).one()
        job.run_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert run_due_jobs() == 1
    assert "Javobingiz uchun rahmat" in text_of(calls[-1][2])


def test_24h_window(client):
    with SessionLocal() as db:
        c = db.query(Contact).filter_by(igsid="999").one()
        c.last_inbound_at = utcnow() - timedelta(hours=25)
        db.commit()
        assert not c.can_message()


def test_activity_and_misc(client):
    items = client.get(f"/api/activity?account_id={S['acc']}").json()["items"]
    kinds = {i["kind"] for i in items}
    assert {"private_reply", "dm_reply", "comment_reply", "click", "answer"} <= kinds
    st = client.get(f"/api/stats?account_id={S['acc']}").json()
    assert st["contacts"] == 1 and st["flows_total"] == 4
    flows = client.get(f"/api/flows?account_id={S['acc']}").json()["items"]
    dup = client.post(f"/api/flows/{flows[0]['id']}/duplicate", headers=H).json()
    assert dup["active"] is False and dup["name"].endswith("(2)")
    assert client.get("/api/flows/999999").status_code == 404
    # SPA: noma'lum yo'l index.html ga (build bo'lmasa 503)
    assert client.get("/app/flows").status_code in (200, 503)

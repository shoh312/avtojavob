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


def test_button_must_be_connected(client):
    """Foydalanuvchi holati: tugma ulanmagan, 'Далее' esa shartga ulangan."""
    flow = create(client, "gift")
    g = flow["graph"]
    first = node(g, "message", 0)
    cond = node(g, "condition")
    btn = f"btn:{first['data']['buttons'][0]['id']}"
    g["edges"] = [e for e in g["edges"] if e["sourceHandle"] != btn]
    g["edges"].append({"id": "x1", "source": first["id"], "sourceHandle": "out", "target": cond["id"]})
    r = client.put(f"/api/flows/{flow['id']}", json={"graph": g, "active": True}, headers=H).json()
    assert r["active"] is False
    assert {"node": first["id"], "code": "button_unconnected"} in r["errors"]
    client.delete(f"/api/flows/{flow['id']}", headers=H)


# ------------------------------------------------------------------ tariflar va admin

def test_trial_and_plan_expiry(client):
    me = client.get("/api/me").json()["user"]
    assert me["plan"]["plan"] == "trial" and me["plan"]["active"] and me["plan"]["days_left"] == 7
    plans = client.get("/api/plans").json()
    assert [p["price"] for p in plans["plans"]] == [0, 199, 499] and plans["currency"] == "TJS"

    # muddat tugasa — webhook e'tiborsiz qoldiriladi
    flow = create(client, "price")
    activate(client, flow)
    from app.models import User
    with SessionLocal() as db:
        u = db.get(User, me["id"])
        u.plan_expires_at = utcnow() - timedelta(minutes=1)
        db.commit()
    calls.clear()
    hook(client, comment("c900", "narx"))
    assert calls == []
    assert client.get("/api/me").json()["user"]["plan"]["active"] is False
    S["flow_price"] = flow["id"]


def test_admin_panel(client):
    from app.models import User
    assert client.get("/api/admin/overview").status_code == 403  # oddiy foydalanuvchi
    me = client.get("/api/me").json()["user"]
    # ikkinchi foydalanuvchi (mijoz) va admin
    client.post("/api/auth/logout", headers=H)
    client.post("/api/auth/register", json={"email": "boss@chatflow.tj", "password": "12345678"}, headers=H)
    with SessionLocal() as db:
        db.query(User).filter_by(email="boss@chatflow.tj").one().is_admin = True
        db.commit()

    ov = client.get("/api/admin/overview").json()
    assert ov["users_total"] == 2 and ov["status"]["expired"] == 1 and len(ov["series"]["signups"]) == 30

    users = client.get("/api/admin/users?status=expired").json()["items"]
    assert [u["email"] for u in users] == ["a@b.tj"] and users[0]["accounts"] == ["dokon"]

    d = client.post(f"/api/admin/users/{me['id']}/grant", json={"plan": "pro", "days": 30, "amount": 199,
                                                                   "note": "chek #1"}, headers=H).json()
    assert d["status"] == "pro" and d["plan"]["days_left"] == 30 and d["grants"][0]["amount"] == 199
    d = client.post(f"/api/admin/users/{me['id']}/grant", json={"plan": "pro", "days": 30, "amount": 199},
                    headers=H).json()
    assert d["plan"]["days_left"] == 60  # uzaytirildi
    ov = client.get("/api/admin/overview").json()
    assert ov["mrr"] == 199 and ov["revenue_month"] == 398 and ov["series"]["revenue"][-1]["value"] == 398

    # Pro bilan avtomatika yana ishlaydi
    calls.clear()
    hook(client, comment("c901", "narx"))
    assert any(c[0] == "private" for c in calls)

    # Telegram sozlamasi
    r = client.put("/api/admin/settings", json={"telegram_username": "https://t.me/chatflow_admin"}, headers=H)
    assert r.json()["telegram_username"] == "chatflow_admin"
    assert client.put("/api/admin/settings", json={"telegram_username": "bad name!"}, headers=H).status_code == 400

    # bloklash
    client.post(f"/api/admin/users/{me['id']}/block", json={"blocked": True}, headers=H)
    client.post("/api/auth/logout", headers=H)
    assert client.post("/api/auth/login", json={"email": "a@b.tj", "password": "12345678"},
                       headers=H).json()["error"] == "blocked"
    client.post("/api/auth/login", json={"email": "boss@chatflow.tj", "password": "12345678"}, headers=H)
    client.post(f"/api/admin/users/{me['id']}/block", json={"blocked": False}, headers=H)
    r = client.post("/api/auth/login", json={"email": "a@b.tj", "password": "12345678"}, headers=H).json()
    assert r["user"]["plan"]["plan"] == "pro" and client.get("/api/plans").json()["telegram"] == "chatflow_admin"


def test_series_and_account_limit(client):
    s = client.get(f"/api/stats/series?account_id={S['acc']}&days=30").json()
    assert len(s["sent"]) == 30 and s["sent"][-1]["value"] > 0 and s["top_flows"]
    from app.main import accounts_limit
    from app.models import User
    with SessionLocal() as db:
        assert accounts_limit(db.query(User).filter_by(email="a@b.tj").one()) == 1

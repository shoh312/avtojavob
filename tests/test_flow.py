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


# ------------------------------------------------------------------ jonli chat, AI, Telegram, rassilka, email

def _login(client, email, pw="12345678"):
    client.post("/api/auth/logout", headers=H)
    r = client.post("/api/auth/login", json={"email": email, "password": pw}, headers=H)
    assert r.status_code == 200, r.text


def test_inbox_and_agent_reply(client):
    _login(client, "a@b.tj")
    calls.clear()
    hook(client, text_msg(LONG_MID + "inbox1", "Salom, savolim bor"))
    hook(client, text_msg(LONG_MID + "inbox1", "Salom, savolim bor"))  # takroriy — bir marta yoziladi
    inbox = client.get(f"/api/inbox?account_id={S['acc']}").json()
    conv = inbox["items"][0]
    assert conv["preview"] == "Salom, savolim bor" and conv["unread"] >= 1 and conv["can_message"]
    thread = client.get(f"/api/inbox/{conv['id']}").json()
    texts = [m["text"] for m in thread["messages"]]
    assert texts.count("Salom, savolim bor") == 1
    assert any(m["source"] == "flow" and m["direction"] == "out" for m in thread["messages"])
    assert client.get(f"/api/inbox?account_id={S['acc']}").json()["items"][0]["unread"] == 0

    calls.clear()
    r = client.post(f"/api/inbox/{conv['id']}/send", json={"text": "Operator javobi"}, headers=H).json()
    assert calls == [("dm", "999", {"text": "Operator javobi"})]
    assert r["contact"]["bot_paused"] and r["messages"][-1]["source"] == "agent"

    # bot pauzada — ssenariy ishlamaydi, lekin xabar tarixga yoziladi
    calls.clear()
    hook(client, text_msg(LONG_MID + "inbox2", "buyurtma"))
    assert calls == []
    assert client.get(f"/api/inbox/{conv['id']}").json()["messages"][-1]["text"] == "buyurtma"
    client.post(f"/api/inbox/{conv['id']}/pause", json={"minutes": 0}, headers=H)
    S["contact"] = conv["id"]


def test_ai_assistant(client, monkeypatch):
    from app import services
    acc = S["acc"]
    r = client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": True, "ai_prompt": "Dokon: kiyimlar"},
                   headers=H).json()
    assert r["ai_enabled"] and r["ai_available"] is False
    assert client.post(f"/api/accounts/{acc}/ai/test", json={"message": "hi"}, headers=H).json()["error"] == "ai_unavailable"

    seen = {}
    monkeypatch.setattr(services, "ai_available", lambda db: True)

    def fake_reply(db, prompt, history):
        seen["prompt"], seen["history"] = prompt, history
        return "Ish vaqti 9:00–18:00"
    monkeypatch.setattr(services, "ai_reply", fake_reply)
    calls.clear()
    hook(client, text_msg(LONG_MID + "ai1", "Soat nechagacha ishlaysiz?"))  # hech bir ssenariy mos emas
    assert calls == [("dm", "999", {"text": "Ish vaqti 9:00–18:00"})]
    assert seen["prompt"] == "Dokon: kiyimlar"
    assert seen["history"][-1] == {"role": "user", "content": "Soat nechagacha ishlaysiz?"}

    monkeypatch.setattr(services, "ai_reply", lambda db, p, h: None)  # rad etildi / xato
    calls.clear()
    hook(client, text_msg(LONG_MID + "ai2", "???"))
    assert calls == []
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": False}, headers=H)


def test_telegram_notify_and_webhook(client, monkeypatch):
    from app import services
    sent = []
    monkeypatch.setattr(services, "telegram_connect", lambda token, *a: ("777", "Mening chatim"))
    monkeypatch.setattr(services, "_tg", lambda token, method, **p: sent.append((method, p)) or {})
    assert client.post(f"/api/accounts/{S['acc']}/telegram", json={"bot_token": "bad"}, headers=H).json()["error"] == "tg_invalid"
    r = client.post(f"/api/accounts/{S['acc']}/telegram", json={"bot_token": "123:ABC"}, headers=H).json()
    assert r["telegram"]["connected"] and r["telegram"]["chat"] == "Mening chatim" and sent[-1][0] == "sendMessage"

    # lid saqlanganda Telegram'ga kartochka
    flow = create(client, "lead")
    activate(client, flow)
    sent.clear()
    hook(client, text_msg(LONG_MID + "tg1", "buyurtma"))
    hook(client, text_msg(LONG_MID + "tg2", "+992 90 000 00 00"))
    assert sent and "+992 90 000 00 00" in sent[-1][1]["text"] and sent[-1][1]["chat_id"] == "777"
    client.put(f"/api/flows/{flow['id']}", json={"active": False}, headers=H)

    # webhook: ichki tarmoq bloklanadi
    assert services.safe_url("http://127.0.0.1:8000/x") is False
    assert services.safe_url("http://169.254.169.254/latest") is False
    assert services.safe_url("ftp://example.com") is False
    assert services.post_webhook("http://localhost/x", {}) == "blocked_url"


def test_broadcast(client):
    from app.engine import run_broadcast
    import app.main as main_mod
    started = []

    class FakeThread:
        def __init__(self, target, args, daemon):
            self.args = args

        def start(self):
            started.append(self.args)
    orig = main_mod.threading.Thread
    main_mod.threading.Thread = FakeThread
    try:
        aud = client.get(f"/api/broadcasts/audience?account_id={S['acc']}").json()
        assert aud["eligible"] >= 1
        r = client.post("/api/broadcasts", json={"account_id": S["acc"], "text": "Aksiya!", "tag": "no-such-tag"}, headers=H)
        assert r.json()["error"] == "no_audience"
        b = client.post("/api/broadcasts", json={"account_id": S["acc"], "text": "Aksiya {username}!",
                                                 "buttons": [{"title": "Shop", "url": "https://shop.tj"}]}, headers=H).json()
        assert b["status"] == "running" and b["total"] == aud["eligible"] and started
    finally:
        main_mod.threading.Thread = orig
    calls.clear()
    run_broadcast(b["id"])
    assert calls and calls[0][2]["attachment"]["payload"]["text"] == "Aksiya @mijoz!"
    items = client.get(f"/api/broadcasts?account_id={S['acc']}").json()["items"]
    assert items[0]["status"] == "done" and items[0]["sent"] == aud["eligible"]


def test_password_reset_and_verify(client, monkeypatch):
    from app import services
    mails = []
    monkeypatch.setattr(services, "send_email", lambda cfg, to, subj, text, html=None: mails.append((to, text)))
    assert client.post("/api/auth/forgot", json={"email": "a@b.tj"}, headers=H).json() == {"sent": False}

    _login(client, "boss@chatflow.tj")
    r = client.put("/api/admin/platform", json={"smtp_host": "smtp.test", "smtp_from": "ChatFlow <no-reply@test>",
                                               "smtp_password": "secret", "anthropic_api_key": "sk-test"}, headers=H).json()
    assert r["smtp_password_set"] and r["anthropic_api_key_set"] and "secret" not in r.values()
    assert client.get("/api/auth/config").json()["email"] is True

    client.post("/api/auth/logout", headers=H)
    assert client.post("/api/auth/forgot", json={"email": "a@b.tj"}, headers=H).json() == {"sent": True}
    to, text = mails[-1]
    token = text.split("token=")[1].strip()
    assert client.post("/api/auth/reset", json={"token": token, "password": "short"}, headers=H).json()["error"] == "password_short"
    r = client.post("/api/auth/reset", json={"token": token, "password": "newpass123"}, headers=H).json()
    assert r["user"]["email"] == "a@b.tj"
    # havola bir martalik
    assert client.post("/api/auth/reset", json={"token": token, "password": "another123"}, headers=H).json()["error"] == "token_invalid"
    _login(client, "a@b.tj", "newpass123")

    client.post("/api/auth/verify/send", headers=H)
    vtoken = mails[-1][1].split("token=")[1].strip()
    r = client.get(f"/verify-email?token={vtoken}", follow_redirects=False)
    assert r.headers["location"] == "/app?verified=1" and client.get("/api/me").json()["user"]["email_verified"]
    assert client.get("/health").json() == {"ok": True}


def test_gemini_provider(client, monkeypatch):
    from app import services
    _login(client, "boss@chatflow.tj")
    r = client.put("/api/admin/platform", json={"ai_provider": "gemini", "gemini_api_key": "AIza-test"}, headers=H).json()
    assert r["ai_provider"] == "gemini" and r["gemini_api_key_set"] and r["gemini_model"] == "gemini-flash-lite-latest"
    assert client.put("/api/admin/platform", json={"ai_provider": "gpt"}, headers=H).json()["error"] == "bad_provider"

    seen = {}

    class Resp:
        def __init__(self, status, data):
            self.status_code, self._data, self.text = status, data, str(data)

        def json(self):
            return self._data

    def fake_post(url, headers=None, json=None, timeout=None):
        seen.update(url=url, headers=headers, body=json)
        return Resp(200, {"candidates": [{"content": {"parts": [{"text": "Ha, yetkazish bepul 🚚"}]}, "finishReason": "STOP"}]})
    monkeypatch.setattr(services._http, "post", fake_post)
    r = client.post("/api/admin/platform/test-ai", headers=H).json()
    assert r == {"answer": "Ha, yetkazish bepul 🚚", "provider": "gemini"}
    assert seen["url"].endswith("/models/gemini-flash-lite-latest:generateContent")
    assert seen["headers"] == {"x-goog-api-key": "AIza-test"}
    assert seen["body"]["contents"] == [{"role": "user", "parts": [{"text": "Salom! Yetkazib berish bepulmi?"}]}]
    assert "flower shop" in seen["body"]["system_instruction"]["parts"][0]["text"]

    # tarix: assistent -> model, ketma-ket rollar birlashadi, boshidagi assistent xabari tashlanadi
    with SessionLocal() as db:
        services.ai_generate(db, "x", [{"role": "assistant", "content": "a"}, {"role": "user", "content": "1"},
                                       {"role": "user", "content": "2"}, {"role": "assistant", "content": "b"},
                                       {"role": "user", "content": "3"}])
    assert [c["role"] for c in seen["body"]["contents"]] == ["user", "model", "user"]
    assert seen["body"]["contents"][0]["parts"][0]["text"] == "1\n2"

    # xato va bloklash
    monkeypatch.setattr(services._http, "post", lambda *a, **k: Resp(400, {"error": {"message": "User location is not supported for the API use."}}))
    r = client.post("/api/admin/platform/test-ai", headers=H)
    assert r.status_code == 400 and "location is not supported" in r.json()["detail"]
    monkeypatch.setattr(services._http, "post", lambda *a, **k: Resp(200, {"candidates": [{"finishReason": "SAFETY"}]}))
    with SessionLocal() as db:
        assert services.ai_reply(db, "x", [{"role": "user", "content": "?"}]) is None


def test_crm_pipeline(client):
    _login(client, "a@b.tj", "newpass123")
    acc = S["acc"]
    board = client.get(f"/api/crm?account_id={acc}").json()
    assert [s["id"] for s in board["stages"]] == ["new", "contacted", "negotiation", "won", "lost"]
    assert board["stages"][0]["name"] == "Yangi"  # foydalanuvchi tili: uz
    # oldingi testda telefon qoldirgan mijoz avtomatik 'Yangi'da
    card = next(c for c in board["cards"] if c["fields"].get("phone"))
    assert card["stage"] == "new" and board["totals"]["new"]["count"] >= 1

    cid = card["id"]
    r = client.patch(f"/api/contacts/{cid}", json={"stage": "won", "deal_value": 350}, headers=H).json()
    assert r["stage"] == "won" and r["deal_value"] == 350
    assert client.patch(f"/api/contacts/{cid}", json={"stage": "nope"}, headers=H).json()["error"] == "bad_stage"
    tl = client.post(f"/api/contacts/{cid}/notes", json={"text": "Ertaga qo'ng'iroq qilish"}, headers=H).json()
    kinds = [i["type"] for i in tl["items"]]
    assert "note" in kinds and "stage" in kinds and "message" in kinds
    stage_note = next(i for i in tl["items"] if i["type"] == "stage")
    assert stage_note["text"] == "Yangi → Sotildi"
    board = client.get(f"/api/crm?account_id={acc}").json()
    assert board["totals"]["won"] == {"count": 1, "sum": 350}
    assert next(c for c in board["cards"] if c["id"] == cid)["notes"] == 1

    # bosqichlarni o'zgartirish: 'won' o'chirilsa — mijoz birinchi bosqichga o'tadi
    new_stages = [{"id": "new", "name": "Lead", "color": "sky", "type": "open"},
                  {"name": "To'landi", "color": "emerald", "type": "won"}]
    r = client.put("/api/crm/stages", json={"account_id": acc, "stages": new_stages}, headers=H).json()
    assert len(r["stages"]) == 2 and r["stages"][1]["id"]
    assert client.get(f"/api/crm?account_id={acc}").json()["totals"]["new"]["sum"] >= 350
    assert client.put("/api/crm/stages", json={"account_id": acc, "stages": []}, headers=H).json()["error"] == "stages_count"

    # ssenariy amali: set_stage (boshqa faol ssenariylar to'xtatiladi)
    for f in client.get(f"/api/flows?account_id={acc}").json()["items"]:
        client.put(f"/api/flows/{f['id']}", json={"active": False}, headers=H)
    flow = create(client, "price")
    g = flow["graph"]
    msg = node(g, "message")
    act = {"id": "a1", "type": "action", "position": {"x": 0, "y": 0}, "data": {"op": "set_stage", "stage": r["stages"][1]["id"]}}
    g["nodes"].append(act)
    g["edges"].append({"id": "e9", "source": msg["id"], "sourceHandle": "out", "target": "a1"})
    activate(client, flow, g)
    hook(client, comment("c-crm", "narx", from_id="crm-user"))
    with SessionLocal() as db:
        assert db.query(Contact).filter_by(igsid="crm-user").one().stage == r["stages"][1]["id"]
    bad = client.put(f"/api/flows/{flow['id']}", json={"graph": {**g, "nodes": [*g["nodes"][:-1], {**act, "data": {"op": "set_stage"}}]}}, headers=H).json()
    assert any(e["code"] == "action_stage" for e in bad["errors"])
    assert "stage" in client.get(f"/api/contacts/export.csv?account_id={acc}").text.splitlines()[0]


def test_telegram_two_way(client, monkeypatch):
    from app import services
    from app.engine import run_due_reminders
    from app.models import IGAccount, Note, TgLink
    _login(client, "a@b.tj", "newpass123")
    acc = S["acc"]
    sent, msg_id = [], [1000]

    def fake_tg(token, method, **p):
        sent.append((method, p))
        if method == "sendMessage":
            msg_id[0] += 1
            return {"message_id": msg_id[0]}
        return {}
    monkeypatch.setattr(services, "_tg", fake_tg)
    client.put(f"/api/accounts/{acc}/integrations", json={"tg_notify_all": True}, headers=H)
    with SessionLocal() as db:
        a = db.get(IGAccount, acc)
        a.tg_secret = "s3cret"
        db.commit()

    # 1) mijoz yozadi -> Telegram'ga xabar (tugmalar bilan) + bog'lanish
    for f in client.get(f"/api/flows?account_id={acc}").json()["items"]:
        client.put(f"/api/flows/{f['id']}", json={"active": False}, headers=H)
    sent.clear()
    hook(client, text_msg(LONG_MID + "tgw1", "Salom, razmer bormi?"))
    method, p = sent[-1]
    assert method == "sendMessage" and "Salom, razmer bormi?" in p["text"] and p["chat_id"] == "777"
    assert p["reply_markup"]["inline_keyboard"][-1][0]["callback_data"].startswith("p:")
    tg_msg = msg_id[0]
    with SessionLocal() as db:
        link = db.query(TgLink).filter_by(tg_message_id=tg_msg).one()
        cid = link.contact_id

    def tg_update(update, secret="s3cret"):
        return client.post(f"/tg/{acc}", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": secret})

    # 2) egasi Telegram'da Reply qiladi -> Instagram Direct'ga ketadi
    calls.clear()
    sent.clear()
    tg_update({"message": {"message_id": 5, "chat": {"id": 777}, "text": "Ha, M va L bor",
                           "reply_to_message": {"message_id": tg_msg}}})
    assert calls == [("dm", "999", {"text": "Ha, M va L bor"})]
    assert sent[-1][1]["text"] == "✅ Yuborildi"
    thread = client.get(f"/api/inbox/{cid}").json()
    assert thread["messages"][-1]["source"] == "agent" and thread["contact"]["bot_paused"]

    # 3) begona chat va noto'g'ri secret — e'tiborsiz
    calls.clear()
    tg_update({"message": {"message_id": 6, "chat": {"id": 666}, "text": "x", "reply_to_message": {"message_id": tg_msg}}})
    tg_update({"message": {"message_id": 7, "chat": {"id": 777}, "text": "x", "reply_to_message": {"message_id": tg_msg}}}, "bad")
    assert calls == []

    # 4) Reply'siz xabar — yordam matni
    sent.clear()
    tg_update({"message": {"message_id": 8, "chat": {"id": 777}, "text": "/start"}})
    assert "Reply" in sent[-1][1]["text"]

    # 5) tugma: botni yoqish/pauza
    tg_update({"callback_query": {"id": "cb1", "data": f"r:{cid}", "message": {"message_id": tg_msg, "chat": {"id": 777}}}})
    assert client.get(f"/api/inbox/{cid}").json()["contact"]["bot_paused"] is False
    tg_update({"callback_query": {"id": "cb2", "data": f"p:{cid}", "message": {"message_id": tg_msg, "chat": {"id": 777}}}})
    assert client.get(f"/api/inbox/{cid}").json()["contact"]["bot_paused"] is True
    assert any(m == "answerCallbackQuery" for m, _ in sent)

    # 6) 24 soat oynasi yopiq bo'lsa — yuborilmaydi
    with SessionLocal() as db:
        c = db.get(Contact, cid)
        c.last_inbound_at = utcnow() - timedelta(hours=30)
        db.commit()
    calls.clear()
    sent.clear()
    tg_update({"message": {"message_id": 9, "chat": {"id": 777}, "text": "kech javob", "reply_to_message": {"message_id": tg_msg}}})
    assert calls == [] and "24" in sent[-1][1]["text"]

    # 7) CRM eslatmasi
    when = (utcnow() - timedelta(minutes=1)).isoformat() + "Z"
    tl = client.post(f"/api/contacts/{cid}/notes", json={"text": "Qo'ng'iroq qilish", "remind_at": when}, headers=H).json()
    assert next(i for i in tl["items"] if i["type"] == "note")["remind_at"]
    sent.clear()
    assert run_due_reminders() == 1 and "Qo'ng'iroq qilish" in sent[-1][1]["text"]
    assert run_due_reminders() == 0
    with SessionLocal() as db:
        assert db.query(Note).filter(Note.remind_at.is_not(None)).one().reminded
    client.put(f"/api/accounts/{acc}/integrations", json={"tg_notify_all": False}, headers=H)


def test_lead_capture_from_direct(client, monkeypatch):
    from app import services
    from app.engine import extract_contact_info
    assert extract_contact_info("raqamim +992 90 123-45-67 ga qo'ng'iroq qiling") == {"phone": "+992 90 123-45-67"}
    assert extract_contact_info("pochta: ali.v@mail.tj") == {"email": "ali.v@mail.tj"}
    assert extract_contact_info("narxi 150 000 so'm, 2 dona") == {}
    assert extract_contact_info("buyurtma #12345") == {}

    acc = S["acc"]
    for f in client.get(f"/api/flows?account_id={acc}").json()["items"]:
        client.put(f"/api/flows/{f['id']}", json={"active": False}, headers=H)
    sent = []
    monkeypatch.setattr(services, "_tg", lambda token, method, **p: sent.append((method, p)) or {"message_id": 1})
    seen = {}
    monkeypatch.setattr(services, "ai_available", lambda db: True)
    monkeypatch.setattr(services, "ai_reply", lambda db, prompt, h: seen.setdefault("prompt", prompt) and "Rahmat!")
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": True, "ai_collect_leads": True}, headers=H)

    msg = lambda mid, text: {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [  # noqa: E731
        {"sender": {"id": "lead-1"}, "recipient": {"id": IG_ID}, "timestamp": 1, "message": {"mid": mid, "text": text}}]}]}
    hook(client, msg(LONG_MID + "l1", "Narxi qancha?"))
    assert "ask for their phone number" in seen["prompt"]  # AI telefon so'rashga yo'naltirilgan
    sent.clear()
    hook(client, msg(LONG_MID + "l2", "Mening raqamim 90 123 45 67"))
    with SessionLocal() as db:
        c = db.query(Contact).filter_by(igsid="lead-1").one()
        assert c.fields["phone"] == "90 123 45 67" and c.stage
    assert any("🎯" in p.get("text", "") for m, p in sent if m == "sendMessage")

    # telefon olingach — AI qayta so'ramaydi; xuddi shu raqam qayta yozilsa takroriy lid yo'q
    seen.clear()
    sent.clear()
    hook(client, msg(LONG_MID + "l3", "90 123 45 67"))
    assert "ask for their phone number" not in seen.get("prompt", "")
    assert not any("🎯" in p.get("text", "") for m, p in sent if m == "sendMessage")
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": False}, headers=H)

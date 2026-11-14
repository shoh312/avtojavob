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
history: dict[str, list] = {}  # soxta Instagram suhbat tarixi
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
        "get_me": lambda t: {"username": "shop", "name": "Shop", "profile_picture_url": "", "followers_count": 382},
        "conversation_history": lambda t, igsid, limit=40: list(history.get(igsid, [])),
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
    assert r["contact"]["bot_paused"] and r["messages"][-1]["source"] == "agent" and r["messages"][-1]["author"]["name"]
    assert r["contact"]["window_left_h"] is not None

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
    r = client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": True, "ai_prompt": "Dokon: kiyimlar",
                                                               "ai_name": "Madina"}, headers=H).json()
    assert r["ai_enabled"] and r["ai_available"] is False and r["ai_name"] == "Madina" and r["ai_crm"] and r["ai_handoff"]
    assert client.post(f"/api/accounts/{acc}/ai/test", json={"message": "hi"}, headers=H).json()["error"] == "ai_unavailable"

    seen = {}
    monkeypatch.setattr(services, "ai_available", lambda db: True)

    def fake(db, system, history):
        seen["system"], seen["history"] = system, history
        return json.dumps({"reply": "Ish vaqti 9:00–18:00"}), None
    monkeypatch.setattr(services, "ai_chat_json", fake)
    calls.clear()
    hook(client, text_msg(LONG_MID + "ai1", "Soat nechagacha ishlaysiz?"))  # hech bir ssenariy mos emas
    assert calls == [("dm", "999", {"text": "Ish vaqti 9:00–18:00"})]
    assert "Dokon: kiyimlar" in seen["system"] and "You are Madina" in seen["system"]
    assert seen["history"][-1] == {"role": "user", "content": "Soat nechagacha ishlaysiz?"}
    assert "CRM stages" in seen["system"] and "name, phone number and email" in seen["system"]

    # o'chirilgan imkoniyatlar AI ko'rsatmasiga kirmaydi
    r = client.put(f"/api/accounts/{acc}/integrations", json={"ai_crm": False, "ai_collect_leads": False,
                                                               "ai_handoff": False, "ai_followup_hours": 4}, headers=H).json()
    assert r["ai_followup_hours"] == 4 and not r["ai_crm"]
    hook(client, text_msg(LONG_MID + "ai1b", "Yana bir savol"))
    assert "CRM stages" not in seen["system"] and "name, phone number and email" not in seen["system"]
    assert 'Set "handoff": true' not in seen["system"]
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_crm": True, "ai_collect_leads": True, "ai_handoff": True,
                                                          "ai_followup_hours": 0}, headers=H)

    monkeypatch.setattr(services, "ai_chat_json", lambda db, s, h: (None, "error"))  # rad etildi / xato
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
    assert "replies" in items[0] and "stats" in client.get(f"/api/broadcasts?account_id={S['acc']}").json()
    aud2 = client.get(f"/api/broadcasts/audience?account_id={S['acc']}").json()
    assert aud2["window"] >= aud2["eligible"] and isinstance(aud2["tags"], list) and aud2["stages"]
    none = client.get(f"/api/broadcasts/audience?account_id={S['acc']}&stage=no-such-stage").json()
    assert none["eligible"] == 0


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
    monkeypatch.setattr(services, "ai_chat_json", lambda db, system, h: seen.update(system=system) or (json.dumps({"reply": "Rahmat!"}), None))
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": True, "ai_collect_leads": True}, headers=H)

    msg = lambda mid, text: {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [  # noqa: E731
        {"sender": {"id": "lead-1"}, "recipient": {"id": IG_ID}, "timestamp": 1, "message": {"mid": mid, "text": text}}]}]}
    hook(client, msg(LONG_MID + "l1", "Narxi qancha?"))
    assert "name, phone number and email" in seen["system"] and "Known customer details: none" in seen["system"]
    assert "FIRST give its price" in services.build_system("x", "ask") and "only ONCE" in services.build_system("x", "ask")
    assert "manager will reply soon" not in services.build_system("x", "ask")
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
    assert "phone: 90 123 45 67" in seen["system"]
    assert not any("🎯" in p.get("text", "") for m, p in sent if m == "sendMessage")
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": False}, headers=H)


def test_product_catalog(client, monkeypatch):
    from app import catalog, services
    acc = S["acc"]
    for f in client.get(f"/api/flows?account_id={acc}").json()["items"]:
        client.put(f"/api/flows/{f['id']}", json={"active": False}, headers=H)

    # rasm yuklash
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    r = client.post("/api/uploads", files={"file": ("a.png", png, "image/png")}, headers=H).json()
    assert r["image"].endswith(".png") and "/uploads/" in r["image_url"]
    assert client.get(f"/uploads/{r['image']}").status_code == 200
    bad = client.post("/api/uploads", files={"file": ("a.png", b"<html>", "image/png")}, headers=H).json()
    assert bad["error"] == "bad_image"

    p1 = client.post("/api/products", json={"account_id": acc, "name": "Cyberlab", "price": "100$",
                                            "description": "Telegram bot, 7 kun", "image": r["image"],
                                            "url": "https://cyberlab.tj"}, headers=H).json()
    p2 = client.post("/api/products", json={"account_id": acc, "name": "Feff", "price": "50$"}, headers=H).json()
    assert client.post("/api/products", json={"account_id": acc, "name": ""}, headers=H).json()["error"] == "product_name"
    assert client.put(f"/api/products/{p2['id']}", json={"url": "feff.tj"}, headers=H).json()["error"] == "button_url"
    items = client.get(f"/api/products?account_id={acc}").json()["items"]
    assert [p["name"] for p in items] == ["Cyberlab", "Feff"]

    # AI katalogni oladi va teg qo'yadi -> mahsulot kartochkasi
    seen = {}
    monkeypatch.setattr(services, "ai_available", lambda db: True)

    def fake_json(db, system, history):
        seen["catalog"] = system
        return json.dumps({"reply": f"Cyberlab 100$ turadi. [[product:{p1['id']}]]"}), None
    monkeypatch.setattr(services, "ai_chat_json", fake_json)
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": True}, headers=H)
    calls.clear()
    msg = {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [
        {"sender": {"id": "shop-1"}, "recipient": {"id": IG_ID}, "timestamp": 1, "message": {"mid": LONG_MID + "p1", "text": "Cyberlab narxi?"}}]}]}
    hook(client, msg)
    assert f"[id {p1['id']}] Cyberlab — 100$: Telegram bot, 7 kun" in seen["catalog"] and "Feff — 50$" in seen["catalog"]
    assert calls[0] == ("dm", "shop-1", {"text": "Cyberlab 100$ turadi."})
    card = calls[1][2]["attachment"]["payload"]
    assert card["template_type"] == "generic"
    el = card["elements"][0]
    assert el["title"] == "Cyberlab" and el["subtitle"].startswith("100$") and el["image_url"].endswith(r["image"])
    assert el["buttons"][0] == {"type": "postback", "title": "🛒 Buyurtma berish", "payload": f"O:{p1['id']}"}
    assert el["buttons"][1]["url"] == "https://cyberlab.tj"

    # buyurtma tugmasi (AI o'chiq) -> CRM, mahsulot maydoni, kontakt so'rash
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": False}, headers=H)
    calls.clear()
    hook(client, {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [
        {"sender": {"id": "shop-1"}, "recipient": {"id": IG_ID}, "timestamp": 1,
         "postback": {"mid": LONG_MID + "p2", "title": "🛒 Buyurtma berish", "payload": f"O:{p1['id']}"}}]}]})
    assert "telefon raqamingiz" in calls[-1][2]["text"]
    with SessionLocal() as db:
        c = db.query(Contact).filter_by(igsid="shop-1").one()
        assert c.fields["product"] == "Cyberlab" and c.stage

    # teglarni ajratish
    assert catalog.split_tags("Mana [[product:3]] va [[ Product : 5 ]]") == ("Mana  va", [3, 5])
    assert client.post(f"/api/accounts/{acc}/ai/test", json={"message": "narx?"}, headers=H).json()["products"][0]["name"] == "Cyberlab"
    client.delete(f"/api/products/{p2['id']}", headers=H)
    assert len(client.get(f"/api/products?account_id={acc}").json()["items"]) == 1
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": False}, headers=H)


def test_team_managers(client, monkeypatch):
    from app import services, tgbot
    from app.engine import run_due_reminders
    from app.models import IGAccount
    _login(client, "a@b.tj", "newpass123")
    acc = S["acc"]
    r = client.post("/api/team", json={"name": "Menejer Ali", "email": "ali@shop.tj"}, headers=H).json()
    pw, mid = r["password"], r["id"]
    assert len(pw) >= 8 and client.post("/api/team", json={"email": "ali@shop.tj"}, headers=H).json()["error"] == "email_taken"
    with SessionLocal() as db:
        a = db.get(IGAccount, acc)
        a.tg_bot_username = "shop_bot"
        db.commit()
    team = client.get("/api/team").json()
    link = team["members"][0]["telegram"][0]["link"]
    assert link.startswith("https://t.me/shop_bot?start=m")

    # menejer kiradi: egasining akkauntlarini ko'radi, lekin egaga tegishli amallar taqiqlangan
    _login(client, "ali@shop.tj", pw)
    me = client.get("/api/me").json()
    assert me["user"]["role"] == "manager" and me["accounts"][0]["id"] == acc and me["user"]["plan"]["plan"] == "pro"
    assert client.post(f"/api/accounts/{acc}/toggle", headers=H).status_code == 403
    assert client.get("/api/team").status_code == 403
    assert client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": True}, headers=H).status_code == 403
    assert client.get(f"/api/crm?account_id={acc}").status_code == 200

    # menejer o'z Telegram'ini ulaydi (/start havola orqali)
    sent = []
    monkeypatch.setattr(services, "_tg", lambda token, method, **p: sent.append((method, p)) or {"message_id": 500 + len(sent)})
    with SessionLocal() as db:
        a = db.get(IGAccount, acc)
        a.tg_secret = "s3cret"
        db.commit()
    token = link.split("start=")[1]
    client.post(f"/tg/{acc}", json={"message": {"message_id": 1, "chat": {"id": 4242}, "text": f"/start {token}"}},
                headers={"X-Telegram-Bot-Api-Secret-Token": "s3cret"})
    assert "Ulandingiz" in sent[-1][1]["text"]
    client.post(f"/tg/{acc}", json={"message": {"message_id": 2, "chat": {"id": 5555}, "text": f"/start m{mid}_bad"}},
                headers={"X-Telegram-Bot-Api-Secret-Token": "s3cret"})
    assert client.get("/api/team").status_code == 403  # menejer hali ham menejer

    # egasi mijozni menejerga biriktiradi -> menejer chatiga xabar
    _login(client, "a@b.tj", "newpass123")
    board = client.get(f"/api/crm?account_id={acc}").json()
    assert {t["role"] for t in board["team"]} == {"owner", "manager"}
    cid = board["cards"][0]["id"]
    sent.clear()
    r = client.patch(f"/api/contacts/{cid}", json={"assigned_to": mid}, headers=H).json()
    assert r["assigned_to"] == mid and r["assignee"] == "Menejer Ali"
    assert sent and sent[-1][1]["chat_id"] == "4242"
    assert client.patch(f"/api/contacts/{cid}", json={"assigned_to": 999999}, headers=H).json()["error"] == "bad_member"
    assert client.get(f"/api/crm?account_id={acc}&assigned={mid}").json()["cards"][0]["id"] == cid

    # menejer eslatmasi o'zining Telegram'iga keladi
    _login(client, "ali@shop.tj", pw)
    assert client.get(f"/api/crm?account_id={acc}&assigned=me").json()["cards"][0]["id"] == cid
    when = (utcnow() - timedelta(minutes=1)).isoformat() + "Z"
    client.post(f"/api/contacts/{cid}/notes", json={"text": "Ali: qo'ng'iroq", "remind_at": when}, headers=H)
    assert client.get(f"/api/reminders?account_id={acc}").json()["items"][0]["text"] == "Ali: qo'ng'iroq"
    sent.clear()
    run_due_reminders()
    assert sent[-1][1]["chat_id"] == "4242" and "Ali: qo'ng'iroq" in sent[-1][1]["text"]

    # menejer Telegram'da Reply qila oladi
    tg_msg = sent[-1]
    with SessionLocal() as db:
        from app.models import TgLink
        link_row = db.query(TgLink).filter_by(chat_id="4242").order_by(TgLink.id.desc()).first()
        c = db.get(Contact, cid)
        c.last_inbound_at = utcnow()
        db.commit()
        msg_id = link_row.tg_message_id
    calls.clear()
    client.post(f"/tg/{acc}", json={"message": {"message_id": 3, "chat": {"id": 4242}, "text": "Salom, Ali menejer",
                                                "reply_to_message": {"message_id": msg_id}}},
                headers={"X-Telegram-Bot-Api-Secret-Token": "s3cret"})
    assert calls and calls[-1][2] == {"text": "Salom, Ali menejer"}
    del tg_msg

    # avtomatik taqsimlash
    _login(client, "a@b.tj", "newpass123")
    client.put("/api/team/settings", json={"auto_assign": True}, headers=H)
    with SessionLocal() as db:
        from app import crm as crm_mod
        newc = Contact(account_id=acc, igsid="auto-1", username="newlead")
        db.add(newc)
        db.commit()
        crm_mod.set_stage(db, newc, crm_mod.get_stages(newc.account)[0]["id"], "test")
        assert newc.assigned_to == mid
    client.put("/api/team/settings", json={"auto_assign": False}, headers=H)

    ob = client.get(f"/api/onboarding?account_id={acc}").json()
    assert ob["steps"]["instagram"] and ob["steps"]["team"] and ob["steps"]["products"] and ob["total"] == 6

    # menejerni o'chirish — mijozlari biriktirilmagan holatga o'tadi
    client.delete(f"/api/team/{mid}", headers=H)
    assert client.get(f"/api/crm?account_id={acc}&assigned=none").json()["cards"]


def test_ai_generate_flow(client, monkeypatch):
    from app import services
    acc = S["acc"]
    monkeypatch.setattr(services, "ai_available", lambda db: True)
    seen = {}
    ai_json = {"name": "Narx + telefon", "nodes": [
        {"id": "t", "type": "trigger", "data": {"kind": "comment", "keywords": "narx, price", "match": "contains"}},
        {"id": "m", "type": "message", "data": {"text": "Salom! Narxni bilish uchun bosing", "buttons": [{"id": "go", "title": "Narxni bilish", "kind": "flow"}]}},
        {"id": "q", "type": "question", "data": {"text": "Telefoningiz?", "field": "phone", "validate": "phone"}},
        {"id": "a", "type": "action", "data": {"op": "set_stage", "stage": "nonexistent"}},
        {"id": "x", "type": "unknown"}],
        "edges": [{"source": "t", "target": "m", "sourceHandle": "out"},
                  {"source": "m", "target": "q", "sourceHandle": "out"},  # noto'g'ri: tugmali xabarda 'out' yo'q
                  {"source": "m", "target": "q", "sourceHandle": "btn:go"},
                  {"source": "q", "target": "a"}, {"source": "a", "target": "t"}]}

    def fake_complete(db, system, text, json_mode=False, max_tokens=8000):
        seen.update(system=system, text=text, json_mode=json_mode)
        return "```json\n" + json.dumps(ai_json) + "\n```", None
    monkeypatch.setattr(services, "ai_complete", fake_complete)
    r = client.post("/api/flows/generate", json={"account_id": acc, "prompt": "Izohga narx yozganlardan telefon ol"}, headers=H).json()
    assert r["name"] == "Narx + telefon" and r["active"] is False and r["nodes"] == 4
    assert seen["json_mode"] and "Uzbek" in seen["system"] and "CRM stage ids" in seen["system"]
    flow = client.get(f"/api/flows/{r['id']}").json()
    g = flow["graph"]
    assert [n["type"] for n in g["nodes"]] == ["trigger", "message", "question", "action"]
    assert len(g["edges"]) == 3 and {e["sourceHandle"] for e in g["edges"]} == {"out", "btn:go"}
    xs = [n["position"]["x"] for n in g["nodes"]]
    assert xs == sorted(xs) and xs[-1] > 0
    stage = next(n for n in g["nodes"] if n["type"] == "action")["data"]["stage"]
    assert stage and stage != "nonexistent"
    assert flow["errors"] == []

    monkeypatch.setattr(services, "ai_complete", lambda *a, **k: ("bu json emas", None))
    assert client.post("/api/flows/generate", json={"account_id": acc, "prompt": "biror narsa"}, headers=H).json()["error"] == "ai_failed"


def test_ai_sales(client, monkeypatch):
    from app import aimanager, services
    from app.engine import record_message
    from app.models import IGAccount, Product, User
    _login(client, "a@b.tj", "newpass123")
    acc = S["acc"]
    for f in client.get(f"/api/flows?account_id={acc}").json()["items"]:
        client.put(f"/api/flows/{f['id']}", json={"active": False}, headers=H)
    client.put("/api/crm/stages", json={"account_id": acc, "stages": [
        {"id": "new", "name": "Yangi", "color": "sky", "type": "open"},
        {"id": "contacted", "name": "Bog'lanildi", "color": "violet", "type": "open"},
        {"id": "won", "name": "Sotildi", "color": "emerald", "type": "won"}]}, headers=H)
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_name": "", "ai_enabled": False}, headers=H)

    # eski "AI menejer" -> AI sotuvchiga ko'chadi
    with SessionLocal() as db:
        a = db.get(IGAccount, acc)
        legacy = User(email="ai-legacy@ai.chatflow.local", name="Sardor AI", is_ai=True, password_hash="x",
                      owner_id=a.user_id, ai_instructions="Muloyim gapir", ai_followup_hours=4, ai_take_all=True)
        db.add(legacy)
        db.commit()
        c0 = Contact(account_id=acc, igsid="legacy-lead", username="legacy", assigned_to=legacy.id)
        db.add(c0)
        db.commit()
        assert aimanager.migrate_ai_managers(db) == 1
        assert aimanager.migrate_ai_managers(db) == 0
        db.refresh(c0)
        assert c0.assigned_to is None and db.get(User, legacy.id).is_blocked
        product_id = db.query(Product).filter_by(account_id=acc).first().id
    d = client.get(f"/api/accounts/{acc}/integrations").json()
    assert d["ai_name"] == "Sardor AI" and "Muloyim gapir" in d["ai_prompt"] and d["ai_followup_hours"] == 4 and d["ai_enabled"]
    assert "ai_manager" not in client.get("/api/team").json()

    # AI javob beradi, bosqich, izoh, ism/email saqlanadi, kartochka yuboriladi
    seen = {}
    monkeypatch.setattr(services, "ai_available", lambda db: True)

    def fake_json(db, system, history):
        seen.update(system=system, history=history)
        return json.dumps({"reply": f"Albatta! Mana bizning mahsulot [[product:{product_id}]]", "stage": "contacted",
                           "note": "Narx bilan qiziqdi", "handoff": False,
                           "fields": {"name": "Ali", "phone": None, "email": "ali@mail.tj"}}), None
    monkeypatch.setattr(services, "ai_chat_json", fake_json)
    calls.clear()
    msg = lambda mid, text: {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [  # noqa: E731
        {"sender": {"id": "ai-lead"}, "recipient": {"id": IG_ID}, "timestamp": 1, "message": {"mid": mid, "text": text}}]}]}
    hook(client, msg(LONG_MID + "am1", "Salom, nima sotasizlar?"))
    assert "Sardor AI" in seen["system"] and "Muloyim gapir" in seen["system"] and '"contacted"' in seen["system"]
    assert calls[0][2] == {"text": "Albatta! Mana bizning mahsulot"} and calls[1][2]["attachment"]["payload"]["template_type"] == "generic"
    with SessionLocal() as db:
        cid = db.query(Contact).filter_by(account_id=acc, igsid="ai-lead").one().id
    tl = client.get(f"/api/contacts/{cid}/timeline").json()
    assert tl["contact"]["stage"] == "contacted" and tl["contact"]["fields"]["email"] == "ali@mail.tj"
    assert any(i["type"] == "note" and i["text"] == "Narx bilan qiziqdi" and "Sardor AI" in i["author"] for i in tl["items"])

    # 'sotildi' bosqichini AI qo'ya olmaydi
    monkeypatch.setattr(services, "ai_chat_json", lambda db, s, h: (json.dumps({"reply": "Rahmat!", "stage": "won"}), None))
    hook(client, msg(LONG_MID + "am2", "to'ladim"))
    assert client.get(f"/api/contacts/{cid}/timeline").json()["contact"]["stage"] == "contacted"

    # odamga topshirish: mas'ul belgilanadi, AI shu suhbatda jim
    monkeypatch.setattr(services, "ai_chat_json", lambda db, s, h: (json.dumps(
        {"reply": "Rahmat, hamkasbim bog'lanadi", "handoff": True, "fields": {"phone": "+992 90 111 22 33"}}), None))
    hook(client, msg(LONG_MID + "am3", "Raqamim +992 90 111 22 33"))
    with SessionLocal() as db:
        c = db.get(Contact, cid)
        assert c.assigned_to and c.bot_paused() and c.fields["phone"]
    calls.clear()
    hook(client, msg(LONG_MID + "am4", "yana savol"))
    assert calls == []

    # eslatma: AI oxirgi yozgan, mijoz jim
    with SessionLocal() as db:
        c = db.get(Contact, cid)
        record_message(db, acc, c, "out", "Savolingiz bormi?", "ai")
        c.bot_paused_until = None
        c.last_inbound_at = utcnow() - timedelta(hours=6)
        c.last_message_at = utcnow() - timedelta(hours=5)
        c.ai_followup_at = None
        db.commit()
    monkeypatch.setattr(services, "ai_chat_json", lambda db, s, h: (json.dumps({"reply": "Savollaringiz qoldimi? 🙂"}), None))
    calls.clear()
    assert aimanager.run_followups() == 1 and calls[0][2] == {"text": "Savollaringiz qoldimi? 🙂"}
    assert aimanager.run_followups() == 0  # faqat bir marta

    # sinov chati: hech narsa yuborilmaydi
    monkeypatch.setattr(services, "ai_chat_json", lambda db, s, h: (json.dumps(
        {"reply": f"Mana [[product:{product_id}]]", "stage": "contacted", "note": "Qiziqdi", "handoff": True,
         "fields": {"name": "Vali"}}), None))
    calls.clear()
    r = client.post(f"/api/accounts/{acc}/ai/test", json={"stage": "new", "messages": [{"role": "user", "content": "Narxi?"}]},
                    headers=H).json()
    assert r["reply"] == "Mana" and r["products"][0]["id"] == product_id and r["stage"] == "contacted"
    assert r["note"] == "Qiziqdi" and r["handoff"] is True and r["fields"] == {"name": "Vali"} and calls == []
    r = client.post(f"/api/accounts/{acc}/ai/test", json={"crm": False, "handoff": False,
                                                           "messages": [{"role": "user", "content": "Narxi?"}]}, headers=H).json()
    assert r["stage"] is None and r["note"] == "" and r["handoff"] is False
    assert client.post(f"/api/accounts/{acc}/ai/test", json={"messages": []}, headers=H).json()["error"] == "empty"
    client.put(f"/api/accounts/{acc}/integrations", json={"ai_enabled": False, "ai_followup_hours": 0}, headers=H)


def test_flow_analytics(client):
    acc = S["acc"]
    items = client.get(f"/api/flows?account_id={acc}").json()["items"]
    busy = max(items, key=lambda f: f["users"])
    assert busy["users"] >= 1 and 0 <= busy["conversion"] <= 100 and busy["last_run"]
    a = client.get(f"/api/flows/{busy['id']}/analytics?days=7").json()
    assert a["days"] == 7 and len(a["series"]["started"]) == 7 and a["started"] == busy["users"]
    assert a["converted"] <= a["started"]
    contacts = client.get(f"/api/contacts?account_id={acc}&flow={busy['id']}").json()
    assert contacts["total"] == a["started"]
    assert "followers" in client.get("/api/me").json()["accounts"][0]


def test_activity_filters(client):
    acc = S["acc"]
    r = client.get(f"/api/activity?account_id={acc}").json()
    assert r["items"] and len(r["stats"]["hours"]) == 24 and r["stats"]["sent"] >= 1
    errs = client.get(f"/api/activity?account_id={acc}&group=issues").json()["items"]
    assert all(i["kind"] in ("error", "skipped") for i in errs)
    last = r["items"][-1]["id"]
    older = client.get(f"/api/activity?account_id={acc}&before={last}").json()
    assert "stats" not in older and all(i["id"] < last for i in older["items"])
    fid = next(i["flow_id"] for i in r["items"] if i["flow_id"])
    assert all(i["flow_id"] == fid for i in client.get(f"/api/activity?account_id={acc}&flow={fid}").json()["items"])


def test_crm_workspace(client):
    acc = S["acc"]
    c1 = client.post("/api/contacts", json={"account_id": acc, "name": "Qo'lda Mijoz", "phone": "+992 900 11 22 33",
                                            "deal_value": 500}, headers=H).json()
    assert c1["manual"] and c1["fields"]["phone"] and c1["stage"]
    c2 = client.post("/api/contacts", json={"account_id": acc, "name": "Ikkinchi", "phone": "900112233"}, headers=H).json()
    dup = client.get(f"/api/crm/duplicates?account_id={acc}").json()["groups"]
    assert any({c1["id"], c2["id"]} <= {i["id"] for i in g["items"]} for g in dup)

    r = client.get(f"/api/crm/clients?account_id={acc}&list=leads").json()
    assert r["funnel"]["total"] >= r["funnel"]["leads"] >= 2 and all(("phone" in i["fields"]) or ("email" in i["fields"]) for i in r["items"])
    assert client.get(f"/api/crm/clients?account_id={acc}&q=Qo'lda").json()["total"] == 1
    assert client.get(f"/api/crm/clients?account_id={acc}&period=today").json()["funnel"]["manual"] >= 2

    # vazifa
    when = (utcnow() - timedelta(hours=1)).isoformat()
    client.post(f"/api/contacts/{c1['id']}/notes", json={"text": "Qo'ng'iroq qilish", "remind_at": when}, headers=H)
    s = client.get(f"/api/crm/summary?account_id={acc}").json()
    assert s["overdue"] >= 1 and s["urgent"] >= 1 and s["duplicates"] >= 1
    task = next(i for i in client.get(f"/api/crm/tasks?account_id={acc}").json()["items"] if i["text"] == "Qo'ng'iroq qilish")
    client.patch(f"/api/notes/{task['id']}", json={"done": True}, headers=H)
    assert any(i["id"] == task["id"] for i in client.get(f"/api/crm/tasks?account_id={acc}&done=1").json()["items"])
    assert client.delete(f"/api/notes/{task['id']}", headers=H).json()["ok"]

    # teglar
    client.patch(f"/api/contacts/{c1['id']}", json={"tags": ["vip", "eski"]}, headers=H)
    assert client.post("/api/crm/tags", json={"account_id": acc, "from": "eski", "to": "doimiy"}, headers=H).json()["changed"] == 1
    tags = {i["tag"]: i["count"] for i in client.get(f"/api/crm/tags?account_id={acc}").json()["items"]}
    assert "doimiy" in tags and "eski" not in tags
    client.post("/api/crm/tags", json={"account_id": acc, "from": "vip"}, headers=H)

    rep = client.get(f"/api/crm/report?account_id={acc}&days=7").json()
    assert rep["new"] >= 2 and len(rep["series"]["new"]) == 7 and rep["stages"] and rep["people"]


def test_echo_and_history(client):
    from datetime import datetime as _dt
    from app import engine
    from app.models import Message
    engine.ECHO_WAIT_SECONDS = 0
    acc = S["acc"]

    def echo(mid, to, text):
        return {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [
            {"sender": {"id": IG_ID}, "recipient": {"id": to}, "timestamp": 1,
             "message": {"mid": mid, "text": text, "is_echo": True}}]}]}

    # egasi Instagram ilovasidan yozdi -> chatda "app" xabari, bot pauzada
    hook(client, echo("echo-owner-1", "echo-user", "Assalomu alaykum, men egasiman"))
    hook(client, echo("echo-owner-1", "echo-user", "Assalomu alaykum, men egasiman"))  # takror webhook
    with SessionLocal() as db:
        c = db.query(Contact).filter_by(account_id=acc, igsid="echo-user").one()
        cid = c.id
        msgs = db.query(Message).filter_by(contact_id=cid).all()
        assert [(m.direction, m.source, m.text) for m in msgs] == [("out", "app", "Assalomu alaykum, men egasiman")]
        assert c.bot_paused()

    # ChatFlow o'zi yuborgan xabarning echo'si yozilmaydi
    ig._remember({"message_id": "echo-bot-1"})
    hook(client, echo("echo-bot-1", "echo-user", "bot javobi"))
    with SessionLocal() as db:
        assert db.query(Message).filter_by(contact_id=cid).count() == 1

    # suhbat tarixi: chat ochilganda Instagram'dan tortiladi, ikki marta qo'shilmaydi
    history["echo-user"] = [
        {"id": "h1", "from_id": "echo-user", "text": "Narxi qancha?", "created_at": _dt(2026, 1, 5, 10, 0)},
        {"id": "h2", "from_id": IG_ID, "text": "199 somoni", "created_at": _dt(2026, 1, 5, 10, 1)},
    ]
    with SessionLocal() as db:
        db.get(Contact, cid).history_synced = False
        db.commit()
    th = client.get(f"/api/inbox/{cid}").json()["messages"]
    assert [m["text"] for m in th] == ["Narxi qancha?", "199 somoni", "Assalomu alaykum, men egasiman"]
    assert th[0]["direction"] == "in" and th[1]["direction"] == "out" and th[1]["source"] == "app"
    assert client.post(f"/api/inbox/{cid}/sync", headers=H).json()["added"] == 0
    history.clear()


def test_integrations_overview(client):
    d = client.get(f"/api/accounts/{S['acc']}/integrations").json()
    assert d["instagram"]["username"] and isinstance(d["webhook_flows"], list) and "bot" in d["telegram"]
    assert "ai_name" in d and isinstance(d["ai_followup_hours"], int) and d["products"] >= 0


def test_webhook_block(client, monkeypatch):
    from app import services
    posted = []

    def fake(url, payload):
        posted.append((url, payload))
        return {"ok": "ok" in url, "status": 200 if "ok" in url else 500,
                "error": "" if "ok" in url else "HTTP 500", "ms": 5, "body": ""}
    monkeypatch.setattr(services, "send_webhook", fake)

    def graph(url, fail_edge):
        nodes = [
            {"id": "t", "type": "trigger", "position": {"x": 0, "y": 0},
             "data": {"kind": "dm", "keywords": "hookme", "match": "contains"}},
            {"id": "w", "type": "webhook", "position": {"x": 300, "y": 0},
             "data": {"url": url, "extra": [{"key": "source", "value": "insta {name}"}]}},
            {"id": "ok", "type": "message", "position": {"x": 600, "y": 0}, "data": {"text": "Yuborildi", "buttons": []}},
            {"id": "bad", "type": "message", "position": {"x": 600, "y": 200}, "data": {"text": "Xato", "buttons": []}},
        ]
        edges = [{"id": "e1", "source": "t", "target": "w", "sourceHandle": "out"},
                 {"id": "e2", "source": "w", "target": "ok", "sourceHandle": "out"}]
        if fail_edge:
            edges.append({"id": "e3", "source": "w", "target": "bad", "sourceHandle": "fail"})
        return {"nodes": nodes, "edges": edges}

    f = create(client)
    bad = client.put(f"/api/flows/{f['id']}", json={"graph": {**graph("ftp://x", True)}}, headers=H).json()
    assert any(e["code"] == "action_url" for e in bad["errors"])
    r = client.put(f"/api/flows/{f['id']}", json={"graph": graph("https://ok.example/h", True), "active": True}, headers=H).json()
    assert r["active"], r["errors"]

    calls.clear()
    hook(client, messaging({"message": {"mid": LONG_MID + "wh1", "text": "hookme"}}, sender="wh-user"))
    assert posted[-1][0] == "https://ok.example/h"
    p = posted[-1][1]
    assert p["event"] == "flow_webhook" and p["test"] is False and p["data"]["source"].startswith("insta")
    assert p["contact"]["igsid"] and "phone" in p["contact"]
    assert any("Yuborildi" in str(x) for x in calls)

    # xato bo'lsa "fail" tarmog'iga o'tadi
    client.put(f"/api/flows/{f['id']}", json={"graph": graph("https://down.example/h", True)}, headers=H)
    calls.clear()
    hook(client, messaging({"message": {"mid": LONG_MID + "wh2", "text": "hookme"}}, sender="wh-user"))
    assert any("Xato" in str(x) for x in calls) and not any("Yuborildi" in str(x) for x in calls)
    st = client.get(f"/api/flows/{f['id']}/stats").json()["nodes"]["w"]
    assert st.get("sent") == 1 and st.get("failed") == 1

    # test tugmasi
    res = client.post(f"/api/flows/{f['id']}/webhook-test", json={"url": "https://ok.example/t"}, headers=H).json()
    assert res["ok"] and res["payload"]["test"] is True
    assert client.post(f"/api/flows/{f['id']}/webhook-test", json={"url": "nope"}, headers=H).status_code == 400
    client.put(f"/api/flows/{f['id']}", json={"active": False}, headers=H)


def test_detect_lang():
    from app.services import detect_lang, language_hint
    assert detect_lang("Хочу записаться") == "Russian"
    assert detect_lang("Сколько стоит английский?") == "Russian"
    assert detect_lang("Салом, нархаш чанд?") == "Tajik"
    assert detect_lang("Мехоҳам ба курс сабти ном шавам") == "Tajik"
    assert detect_lang("Narxi qancha?") == "Uzbek"
    assert detect_lang("Dizayn kursiga yozilmoqchiman") == "Uzbek"
    assert detect_lang("How much is the course?") == "English"
    assert detect_lang("👍") is None
    assert "Russian" in language_hint([{"role": "user", "content": "Привет"}])


def test_sales_helpers_and_echo_twin(client):
    from app import aimanager, engine
    from app.models import Message
    from app.services import conversation_lang
    assert conversation_lang(["Narxi qancha?", "🛒 Заказать", "[🛒 Заказать]"]) == "Uzbek"
    assert conversation_lang(["Сколько стоит?", "Ali 928415552"]) == "Russian"
    assert aimanager.clean_fields({"name": "Ali", "phone": "92 841 55 52", "email": "A@B.TJ"}) == \
        {"name": "Ali", "phone": "92 841 55 52", "email": "a@b.tj"}
    assert aimanager.clean_fields({"name": "null", "phone": "12", "email": "x"}) == {}

    engine.ECHO_WAIT_SECONDS = 0
    with SessionLocal() as db:
        acc = db.get(engine.IGAccount, S["acc"])
        c = engine.get_contact(db, acc, "twin-user")
        engine.record_message(db, acc.id, c, "out", "Python kursi 1200 TJS turadi.  🛍 Python", "ai")
        cid = c.id
    echo = lambda mid, msg: {"object": "instagram", "entry": [{"id": IG_ID, "time": 1, "messaging": [  # noqa: E731
        {"sender": {"id": IG_ID}, "recipient": {"id": "twin-user"}, "timestamp": 1, "message": {"mid": mid, "is_echo": True, **msg}}]}]}
    hook(client, echo("tw-1", {"text": "Python kursi 1200 TJS turadi."}))
    hook(client, echo("tw-2", {"attachments": [{"type": "template", "payload": {}}]}))
    with SessionLocal() as db:
        rows = db.query(Message).filter_by(contact_id=cid).all()
        assert [(m.source, m.ext_id != "") for m in rows] == [("ai", True)]


def test_profile_avatar(client):
    me = client.get("/api/me").json()["user"]
    assert me["avatar_url"] == "" and "google" in me and me["created_at"]
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    up = client.post("/api/uploads", files={"file": ("a.png", png, "image/png")}, headers=H).json()
    u = client.patch("/api/me", json={"avatar": up["image"]}, headers=H).json()["user"]
    assert u["avatar_url"] == f"/uploads/{up['image']}"
    assert client.get(u["avatar_url"]).status_code == 200
    assert client.patch("/api/me", json={"avatar": "../app.db"}, headers=H).json()["error"] == "bad_image"
    assert client.patch("/api/me", json={"avatar": "999999-x.png"}, headers=H).json()["error"] == "bad_image"
    u = client.patch("/api/me", json={"avatar": ""}, headers=H).json()["user"]
    assert u["avatar_url"] == "" and client.get(f"/uploads/{up['image']}").status_code == 404


def test_team_overview(client):
    d = client.get("/api/team").json()
    assert d["owner"]["email"] and {"assigned", "open", "won", "overdue", "tasks"} <= set(d["owner"])
    assert isinstance(d["unassigned"], int)
    for m in d["members"]:
        assert {"assigned", "open", "won", "overdue"} <= set(m)


def test_accounts_overview(client):
    d = client.get("/api/accounts/overview").json()
    assert d["used"] == len(d["items"]) >= 1 and d["limit"] >= 1
    a = d["items"][0]
    assert {"contacts", "flows_active", "sent_7d", "inbound_7d", "last_event_at", "token_days", "ai", "telegram"} <= set(a)


def test_products_stats_and_reorder(client):
    acc = S["acc"]
    a = client.post("/api/products", json={"account_id": acc, "name": "Alfa", "price": "10"}, headers=H).json()
    b = client.post("/api/products", json={"account_id": acc, "name": "Beta", "price": "20"}, headers=H).json()
    from app.engine import log_event
    from app.models import IGAccount
    with SessionLocal() as db:
        ac = db.get(IGAccount, acc)
        log_event(db, ac, None, "ai_reply", "narx?", "Mana  🛍 Alfa, Beta")
        log_event(db, ac, None, "click", "[🛒 Alfa]", "Alfa")
    items = {p["name"]: p for p in client.get(f"/api/products?account_id={acc}").json()["items"]}
    assert items["Alfa"]["shown_30d"] >= 1 and items["Alfa"]["orders_30d"] >= 1 and items["Beta"]["shown_30d"] >= 1
    assert client.post("/api/products/reorder", json={"account_id": acc, "ids": [b["id"], a["id"]]}, headers=H).json()["ok"]
    names = [p["name"] for p in client.get(f"/api/products?account_id={acc}").json()["items"]]
    assert names.index("Beta") < names.index("Alfa")
    client.delete(f"/api/products/{a['id']}", headers=H)
    client.delete(f"/api/products/{b['id']}", headers=H)


def test_inbox_tabs_and_quick_replies(client):
    acc = S["acc"]
    d = client.get(f"/api/inbox?account_id={acc}&tab=unread").json()
    assert set(d["counts"]) == {"all", "unread", "mine", "human"} and d["counts"]["all"] >= d["counts"]["unread"]
    assert all(c["unread"] > 0 for c in d["items"])
    assert all(c["bot_paused"] for c in client.get(f"/api/inbox?account_id={acc}&tab=human").json()["items"])
    r = client.put(f"/api/accounts/{acc}/quick-replies", json={"items": [
        {"title": "Narx", "text": "Narxlar katalogda"}, {"title": "", "text": "Salom!"}, {"title": "bo'sh", "text": ""}]}, headers=H).json()
    assert [x["title"] for x in r["items"]] == ["Narx", "Salom!"]
    assert client.get(f"/api/accounts/{acc}/quick-replies").json()["items"][0]["text"] == "Narxlar katalogda"


def test_contact_avatars(client, monkeypatch):
    from app import engine
    from app import instagram as ig_mod
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 50
    assert ig_mod.fetch_image("https://evil.example.com/a.png") is None
    assert ig_mod.fetch_image("http://scontent.cdninstagram.com/a.png") is None
    monkeypatch.setattr(ig_mod, "get_user_profile", lambda t, igsid: {
        "username": "rasmli", "name": "Rasmli Mijoz", "profile_pic": "https://scontent.cdninstagram.com/p.jpg"})
    monkeypatch.setattr(ig_mod, "fetch_image", lambda url: png)
    engine._avatar_runs.clear()
    with SessionLocal() as db:
        c = engine.get_contact(db, db.get(IGAccount, S["acc"]), "avatar-user")
        c.last_message_at = utcnow()
        c.avatar_at = None
        db.commit()
        cid = c.id
    assert engine.refresh_avatars(S["acc"]) >= 1
    assert engine.refresh_avatars(S["acc"]) == 0  # 60 soniyada bir marta
    with SessionLocal() as db:
        c = db.get(Contact, cid)
        assert c.avatar.endswith(".png") and c.name == "Rasmli Mijoz"
    url = client.get(f"/api/inbox/{cid}").json()["contact"]["avatar_url"]
    assert url.startswith("/uploads/c") and client.get(url).status_code == 200

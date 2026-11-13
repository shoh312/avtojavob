import asyncio
import csv
import io
import json
import logging
import secrets
import threading
from contextlib import asynccontextmanager
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlencode

import httpx
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from fastapi import BackgroundTasks, Body, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import (FileResponse, JSONResponse, PlainTextResponse, RedirectResponse,
                               StreamingResponse)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from . import instagram as ig
from . import aimanager, catalog, crm, services, tgbot
from .config import settings
from .db import get_db, init_db
from .engine import contact_card as engine_contact_card
from .engine import (broadcast_audience, log_event, process_payload, record_message, refresh_expiring_tokens,
                     resubscribe_all, run_broadcast, run_due_jobs, run_due_reminders)
from .flows import (blank_graph, build_template, generate_system, list_templates, normalize_generated, trigger_of,
                    validate_graph)
from .models import (LANGS, SEND_KINDS, Broadcast, Contact, EventLog, Flow, IGAccount, Message, NodeStat, Note,
                     PlanGrant, Product, TeamTg, User, utcnow)
from .plans import (PLANS, TRIAL_DAYS, accounts_limit, get_setting, is_active, plan_json, plans_public,
                    set_setting)
from .security import (decrypt, encrypt, hash_password, parse_signed_request, verify_password,
                       verify_webhook_signature)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")

WEB_DIR = Path(__file__).parent / "web"
UPLOAD_DIR = Path(settings.UPLOAD_DIR)


async def _background_loops():
    try:
        await asyncio.to_thread(resubscribe_all)
    except Exception:
        log.exception("resubscribe")
    tick = 0
    while True:
        try:
            await asyncio.to_thread(run_due_jobs)
            await asyncio.to_thread(run_due_reminders)
            if tick % 10 == 0:  # ~5 daqiqada bir
                await asyncio.to_thread(aimanager.run_followups)
            if tick % 720 == 0:  # ~6 soatda bir
                await asyncio.to_thread(refresh_expiring_tokens)
        except Exception:
            log.exception("background loop")
        tick += 1
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _promote_admins()
    _interrupt_broadcasts()
    task = asyncio.create_task(_background_loops())
    yield
    task.cancel()


def _admin_emails() -> list[str]:
    return [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]


_http = httpx.Client(timeout=15)


def _interrupt_broadcasts():
    """Server qayta ishga tushsa — tugallanmagan rassilkalar 'to'xtatildi' deb belgilanadi."""
    from .db import SessionLocal
    with SessionLocal() as db:
        for b in db.scalars(select(Broadcast).where(Broadcast.status == "running")):
            b.status = "interrupted"
            b.finished_at = utcnow()
        db.commit()


def _promote_admins():
    emails = _admin_emails()
    if not emails:
        return
    from .db import SessionLocal
    with SessionLocal() as db:
        for u in db.scalars(select(User).where(User.email.in_(emails))):
            u.is_admin = True
        db.commit()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY, same_site="lax",
                   https_only=settings.APP_URL.startswith("https"), max_age=30 * 86400)
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    # API'ga o'zgartiruvchi so'rovlar faqat bizning frontenddan (maxsus sarlavha bilan) keladi
    if request.url.path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if request.headers.get("x-chatflow") != "1":
            return JSONResponse({"error": "csrf"}, status_code=403)
    return await call_next(request)


# ---------------------------------------------------------------- yordamchilar

def err(code: str, status: int = 400):
    raise HTTPException(status_code=status, detail=code)


@app.exception_handler(HTTPException)
async def _http_error(request: Request, exc: HTTPException):
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    uid = request.session.get("uid")
    user = db.get(User, uid) if uid else None
    if not user:
        err("auth", 401)
    if user.is_blocked:
        request.session.clear()
        err("blocked", 403)
    return user


def owner_user(user: User = Depends(current_user)) -> User:
    """Faqat ish maydoni egasi (menejer emas)."""
    if user.is_manager:
        err("owner_only", 403)
    return user


def ws_id(user: User) -> int:
    return user.owner_id or user.id


def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        err("forbidden", 403)
    return user


def owned_account(db: Session, user: User, account_id: int) -> IGAccount:
    acc = db.get(IGAccount, account_id)
    if not acc or acc.user_id != ws_id(user):
        err("not_found", 404)
    return acc


def owned_flow(db: Session, user: User, flow_id: int) -> Flow:
    flow = db.get(Flow, flow_id)
    if not flow or flow.account.user_id != ws_id(user):
        err("not_found", 404)
    return flow


def iso(dt) -> str | None:
    return dt.isoformat() + "Z" if dt else None


def user_json(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "lang": u.lang, "is_admin": u.is_admin,
            "plan": plan_json(u.workspace), "email_verified": u.email_verified,
            "role": "manager" if u.is_manager else "owner"}


def account_json(a: IGAccount) -> dict:
    return {"id": a.id, "username": a.username, "name": a.name, "picture_url": a.picture_url,
            "active": a.active, "token_expires_at": iso(a.token_expires_at)}


def flow_summary(f: Flow) -> dict:
    trig = trigger_of(f.graph) or {}
    d = trig.get("data") or {}
    return {"id": f.id, "account_id": f.account_id, "name": f.name, "active": f.active, "runs": f.runs,
            "trigger": {"kind": d.get("kind"), "keywords": d.get("keywords") or "", "match": d.get("match"),
                        "media_caption": d.get("media_caption") or ""},
            "nodes": len(f.graph["nodes"]), "updated_at": iso(f.updated_at), "created_at": iso(f.created_at)}


def contact_json(c: Contact) -> dict:
    return {"id": c.id, "igsid": c.igsid, "username": c.username, "name": c.name, "tags": c.tags,
            "fields": c.fields, "follows": c.follows, "last_seen_at": iso(c.last_seen_at),
            "created_at": iso(c.created_at), "stage": c.stage, "deal_value": c.deal_value or 0,
            "last_message_preview": c.last_message_preview, "last_message_at": iso(c.last_message_at),
            "assigned_to": c.assigned_to, "assignee": (c.assignee.name or c.assignee.email) if c.assignee else None}


def detect_lang(request: Request) -> str:
    q = request.query_params.get("lang")
    if q in LANGS:
        return q
    al = (request.headers.get("accept-language") or "").lower()
    for code, lang in (("tg", "tj"), ("tj", "tj"), ("uz", "uz"), ("ru", "ru")):
        if al.startswith(code) or f",{code}" in al:
            return lang
    return "en"


# ---------------------------------------------------------------- auth

@app.post("/api/auth/register")
def register(request: Request, background: BackgroundTasks, body: dict = Body(...), db: Session = Depends(get_db)):
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    name = str(body.get("name") or "").strip()[:120]
    lang = body.get("lang") if body.get("lang") in LANGS else "ru"
    if "@" not in email or len(email) > 255:
        err("email_invalid")
    if len(password) < 8:
        err("password_short")
    if db.scalar(select(User).where(User.email == email)):
        err("email_taken")
    user = User(email=email, name=name, password_hash=hash_password(password), lang=lang, plan="trial",
                plan_expires_at=utcnow() + timedelta(days=TRIAL_DAYS), last_login_at=utcnow())
    if email in _admin_emails():
        user.is_admin = True
    db.add(user)
    db.commit()
    request.session.clear()
    request.session["uid"] = user.id
    cfg = services.smtp_config(db)
    if cfg:
        _send_verify(background, cfg, user)
    return {"user": user_json(user)}


@app.post("/api/auth/login")
def login(request: Request, body: dict = Body(...), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(body.get("email") or "").strip().lower()))
    if not user or not verify_password(str(body.get("password") or ""), user.password_hash):
        err("login_failed", 401)
    if user.is_blocked or user.is_ai:
        err("blocked" if user.is_blocked else "login_failed", 403 if user.is_blocked else 401)
    user.last_login_at = utcnow()
    db.commit()
    request.session.clear()
    request.session["uid"] = user.id
    return {"user": user_json(user)}


@app.post("/api/auth/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"user": user_json(user), "accounts": [account_json(a) for a in user.workspace.accounts],
            "ig_ready": settings.ig_ready, "telegram": get_setting(db, "telegram_username"),
            "features": {"email": bool(services.smtp_config(db)), "ai": services.ai_available(db)}}


@app.get("/api/plans")
def plans(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {**plans_public(db), "current": plan_json(user.workspace)}


@app.patch("/api/me")
def update_me(body: dict = Body(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    if "name" in body:
        user.name = str(body["name"] or "").strip()[:120]
    if body.get("lang") in LANGS:
        user.lang = body["lang"]
    if body.get("new_password"):
        if not verify_password(str(body.get("password") or ""), user.password_hash):
            err("password_wrong")
        if len(str(body["new_password"])) < 8:
            err("password_short")
        user.password_hash = hash_password(str(body["new_password"]))
    db.commit()
    return {"user": user_json(user)}


# ---------------------------------------------------------------- Instagram akkauntlar

@app.get("/instagram/connect")
def instagram_connect(request: Request, db: Session = Depends(get_db)):
    if not request.session.get("uid"):
        return RedirectResponse("/login", status_code=303)
    if not settings.ig_ready:
        return RedirectResponse("/app/accounts?ig_error=not_configured", status_code=303)
    state = secrets.token_urlsafe(24)
    request.session["oauth_state"] = state
    return RedirectResponse(ig.authorize_url(state), status_code=302)


@app.get("/instagram/callback")
def instagram_callback(request: Request, code: str | None = None, state: str | None = None,
                       error: str | None = None, error_description: str | None = None,
                       db: Session = Depends(get_db)):
    uid = request.session.get("uid")
    user = db.get(User, uid) if uid else None
    if not user:
        return RedirectResponse("/login", status_code=303)
    back = lambda e: RedirectResponse(f"/app/accounts?ig_error={quote(e[:300])}", status_code=303)  # noqa: E731
    expected = request.session.pop("oauth_state", None)
    if error or not code:
        return back(error_description or error or "cancelled")
    if not expected or state != expected:
        return back("state")
    try:
        short = ig.exchange_code(code)
        token, expires_in = ig.get_long_lived_token(short["access_token"])
        me_ = ig.get_me(token)
        ig.subscribe_webhooks(token)
    except (ig.IGError, KeyError) as e:
        return back(str(e))

    ig_user_id = str(me_.get("user_id") or short.get("user_id"))
    acc = db.scalar(select(IGAccount).where(IGAccount.ig_user_id == ig_user_id))
    if user.is_manager:
        return back("owner_only")
    if acc and acc.user_id != user.id:
        return back("account_taken")
    if not acc and len(user.accounts) >= accounts_limit(user):
        return back("plan_limit")
    if not acc:
        acc = IGAccount(user_id=user.id, ig_user_id=ig_user_id, access_token_enc="")
        db.add(acc)
    acc.scoped_id = str(me_.get("id") or "")
    acc.username = me_.get("username") or ""
    acc.name = me_.get("name") or ""
    acc.picture_url = me_.get("profile_picture_url") or ""
    acc.access_token_enc = encrypt(token)
    acc.token_expires_at = utcnow() + timedelta(seconds=expires_in or 60 * 86400)
    acc.active = True
    db.commit()
    return RedirectResponse(f"/app/accounts?connected={quote(acc.username)}", status_code=303)


@app.post("/api/accounts/{account_id}/toggle")
def account_toggle(account_id: int, user: User = Depends(owner_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    acc.active = not acc.active
    db.commit()
    return account_json(acc)


@app.delete("/api/accounts/{account_id}")
def account_delete(account_id: int, user: User = Depends(owner_user), db: Session = Depends(get_db)):
    db.delete(owned_account(db, user, account_id))
    db.commit()
    return {"ok": True}


@app.get("/api/accounts/{account_id}/media")
def account_media(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    try:
        items = ig.list_media(decrypt(acc.access_token_enc))
    except Exception:  # noqa: BLE001
        items = []
    return {"items": [{"id": m.get("id"), "caption": (m.get("caption") or "")[:200],
                       "thumbnail": m.get("thumbnail_url") or m.get("media_url"),
                       "type": m.get("media_type"), "timestamp": m.get("timestamp")} for m in items]}


# ---------------------------------------------------------------- statistika

@app.get("/api/stats")
def stats(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    now = utcnow()
    sent = lambda since: db.scalar(select(func.count(EventLog.id)).where(  # noqa: E731
        EventLog.account_id == acc.id, EventLog.kind.in_(SEND_KINDS), EventLog.created_at >= since)) or 0
    return {
        "sent_24h": sent(now - timedelta(hours=24)),
        "sent_7d": sent(now - timedelta(days=7)),
        "contacts": db.scalar(select(func.count(Contact.id)).where(Contact.account_id == acc.id)) or 0,
        "contacts_7d": db.scalar(select(func.count(Contact.id)).where(
            Contact.account_id == acc.id, Contact.created_at >= now - timedelta(days=7))) or 0,
        "flows_active": db.scalar(select(func.count(Flow.id)).where(
            Flow.account_id == acc.id, Flow.active.is_(True))) or 0,
        "flows_total": db.scalar(select(func.count(Flow.id)).where(Flow.account_id == acc.id)) or 0,
        "runs_total": db.scalar(select(func.sum(Flow.runs)).where(Flow.account_id == acc.id)) or 0,
    }


# ---------------------------------------------------------------- ssenariylar

@app.get("/api/templates")
def templates_list(user: User = Depends(current_user)):
    return {"items": list_templates(user.lang)}


@app.get("/api/flows")
def flows_list(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    return {"items": [flow_summary(f) for f in sorted(acc.flows, key=lambda f: f.id, reverse=True)]}


def _sync_trigger(flow: Flow) -> None:
    trig = trigger_of(flow.graph) or {}
    flow.trigger_kind = (trig.get("data") or {}).get("kind") or ""


@app.post("/api/flows")
def flow_create(body: dict = Body(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, int(body.get("account_id") or 0))
    template = body.get("template")
    if template:
        try:
            name, graph = build_template(str(template), user.lang)
        except KeyError:
            err("template_not_found")
    else:
        name, graph = "", blank_graph()
    flow = Flow(account_id=acc.id, name=(str(body.get("name") or "").strip() or name or "Flow")[:120])
    flow.graph = graph
    _sync_trigger(flow)
    db.add(flow)
    db.commit()
    return flow_summary(flow)


@app.get("/api/flows/{flow_id}")
def flow_get(flow_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    flow = owned_flow(db, user, flow_id)
    return {**flow_summary(flow), "graph": flow.graph, "errors": validate_graph(flow.graph)}


@app.put("/api/flows/{flow_id}")
def flow_save(flow_id: int, body: dict = Body(...), user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    flow = owned_flow(db, user, flow_id)
    if "name" in body:
        flow.name = str(body["name"] or "").strip()[:120] or flow.name
    if "graph" in body:
        graph = body["graph"] or {}
        if len(json.dumps(graph)) > 500_000:
            err("graph_too_large")
        # Faqat kerakli maydonlarni saqlaymiz
        flow.graph = {
            "nodes": [{"id": str(n.get("id")), "type": n.get("type"), "data": n.get("data") or {},
                       "position": {"x": float((n.get("position") or {}).get("x") or 0),
                                    "y": float((n.get("position") or {}).get("y") or 0)}}
                      for n in graph.get("nodes") or []],
            "edges": [{"id": str(e.get("id")), "source": e.get("source"), "target": e.get("target"),
                       "sourceHandle": e.get("sourceHandle") or "out"} for e in graph.get("edges") or []],
        }
        _sync_trigger(flow)
    errors = validate_graph(flow.graph)
    if "active" in body:
        flow.active = bool(body["active"])
    if errors and flow.active:
        flow.active = False
    flow.updated_at = utcnow()
    db.commit()
    return {**flow_summary(flow), "errors": errors}


@app.post("/api/flows/{flow_id}/duplicate")
def flow_duplicate(flow_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    src = owned_flow(db, user, flow_id)
    copy = Flow(account_id=src.account_id, name=f"{src.name} (2)"[:120], graph_json=src.graph_json,
                trigger_kind=src.trigger_kind, active=False)
    db.add(copy)
    db.commit()
    return flow_summary(copy)


@app.delete("/api/flows/{flow_id}")
def flow_delete(flow_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(owned_flow(db, user, flow_id))
    db.commit()
    return {"ok": True}


@app.get("/api/flows/{flow_id}/stats")
def flow_stats(flow_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    flow = owned_flow(db, user, flow_id)
    out: dict[str, dict[str, int]] = {}
    for s in db.scalars(select(NodeStat).where(NodeStat.flow_id == flow.id)):
        out.setdefault(s.node_id, {})[s.key] = s.count
    return {"runs": flow.runs, "nodes": out}


# ---------------------------------------------------------------- kontaktlar

def _contacts_query(db: Session, acc: IGAccount, q: str, tag: str):
    stmt = select(Contact).where(Contact.account_id == acc.id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Contact.username).like(like), func.lower(Contact.name).like(like),
                              func.lower(Contact.fields_json).like(like)))
    if tag:
        stmt = stmt.where(Contact.tags_json.like(f'%{json.dumps(tag, ensure_ascii=False)}%'))
    return stmt


@app.get("/api/contacts")
def contacts_list(account_id: int, q: str = "", tag: str = "", page: int = 1,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    stmt = _contacts_query(db, acc, q.strip(), tag.strip())
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    per = 50
    rows = db.scalars(stmt.order_by(Contact.last_seen_at.desc()).offset((max(page, 1) - 1) * per).limit(per)).all()
    all_tags: set[str] = set()
    for (tags_json,) in db.execute(select(Contact.tags_json).where(Contact.account_id == acc.id)):
        try:
            all_tags.update(json.loads(tags_json or "[]"))
        except ValueError:
            pass
    return {"items": [contact_json(c) for c in rows], "total": total, "per_page": per,
            "tags": sorted(all_tags)}


@app.patch("/api/contacts/{contact_id}")
def contact_update(contact_id: int, body: dict = Body(...), user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    c = db.get(Contact, contact_id)
    if not c or c.account.user_id != ws_id(user):
        err("not_found", 404)
    if isinstance(body.get("tags"), list):
        c.tags = body["tags"]
    if isinstance(body.get("fields"), dict):
        c.fields = {str(k)[:30]: str(v)[:500] for k, v in body["fields"].items()}
    if "name" in body:
        c.name = str(body["name"] or "")[:255]
    if "deal_value" in body:
        try:
            c.deal_value = max(0, min(int(body["deal_value"] or 0), 10**12))
        except (TypeError, ValueError):
            err("bad_number")
    db.commit()
    if "stage" in body:
        stage = body["stage"] or None
        if stage is not None and not crm.stage_by_id(c.account, stage):
            err("bad_stage")
        crm.set_stage(db, c, stage, user.name or user.email)
    if "assigned_to" in body:
        target = body["assigned_to"]
        member = db.get(User, int(target)) if target else None
        if target and (not member or ws_id(member) != ws_id(user)):
            err("bad_member")
        if (member.id if member else None) != c.assigned_to:
            crm.assign(db, c, member, user.name or user.email)
            if member and member.id != user.id:
                tgbot.notify(db, c.account, engine_contact_card(c, "👤 " + (c.username and f"@{c.username}" or c.name or "")), c, member.id)
    return contact_json(c)


@app.get("/api/contacts/export.csv")
def contacts_export(account_id: int, q: str = "", tag: str = "", user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    rows = db.scalars(_contacts_query(db, acc, q.strip(), tag.strip()).order_by(Contact.id)).all()
    keys = sorted({k for c in rows for k in c.fields})
    buf = io.StringIO()
    buf.write("﻿")  # Excel UTF-8 ni to'g'ri ochishi uchun
    w = csv.writer(buf)
    stages = {s["id"]: s["name"] for s in crm.get_stages(acc)}
    w.writerow(["username", "name", "stage", "deal_value", "tags", "follows", "first_seen", "last_seen", *keys])
    for c in rows:
        w.writerow([c.username, c.name, stages.get(c.stage or "", ""), c.deal_value or 0, ", ".join(c.tags),
                    "" if c.follows is None else int(c.follows), iso(c.created_at), iso(c.last_seen_at),
                    *[c.fields.get(k, "") for k in keys]])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="contacts-{acc.username}.csv"'})


# ---------------------------------------------------------------- faollik

@app.get("/api/activity")
def activity(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    rows = db.scalars(select(EventLog).where(EventLog.account_id == acc.id)
                      .order_by(EventLog.id.desc()).limit(200)).all()
    names = {f.id: f.name for f in acc.flows}
    return {"items": [{"id": r.id, "kind": r.kind, "username": r.username, "incoming": r.incoming,
                       "detail": r.detail, "flow_id": r.flow_id, "flow_name": names.get(r.flow_id or 0, ""),
                       "created_at": iso(r.created_at)} for r in rows]}


# ---------------------------------------------------------------- Meta webhook

@app.get("/webhook")
def webhook_verify(request: Request):
    p = request.query_params
    if (p.get("hub.mode") == "subscribe" and settings.WEBHOOK_VERIFY_TOKEN
            and p.get("hub.verify_token") == settings.WEBHOOK_VERIFY_TOKEN):
        return PlainTextResponse(p.get("hub.challenge", ""))
    return PlainTextResponse("Forbidden", status_code=403)


def _webhook_summary(payload: dict) -> str:
    parts = []
    for entry in payload.get("entry", []) if isinstance(payload, dict) else []:
        kinds = [c.get("field", "?") for c in entry.get("changes", [])]
        for ev in entry.get("messaging", []):
            if "postback" in ev:
                kinds.append("postback")
            elif (ev.get("message") or {}).get("is_echo"):
                kinds.append("echo")
            elif "message" in ev:
                kinds.append("message")
            else:
                kinds.append("+".join(k for k in ev if k not in ("sender", "recipient", "timestamp")) or "?")
        parts.append(f"{entry.get('id')}: {', '.join(kinds) or '-'}")
    return f"object={payload.get('object')} " + "; ".join(parts)


@app.post("/webhook")
async def webhook_receive(request: Request, background: BackgroundTasks):
    body = await request.body()
    if not verify_webhook_signature(body, request.headers.get("x-hub-signature-256")):
        log.warning("webhook: imzo noto'g'ri")
        return PlainTextResponse("Invalid signature", status_code=403)
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return PlainTextResponse("Bad JSON", status_code=400)
    log.info("webhook: %s", _webhook_summary(payload))
    background.add_task(process_payload, payload)
    return PlainTextResponse("EVENT_RECEIVED")


# ---------------------------------------------------------------- Telegram bot webhook (egasining boti)

@app.post("/tg/{account_id}")
async def telegram_webhook(account_id: int, request: Request, background: BackgroundTasks):
    from .db import SessionLocal
    secret = request.headers.get("x-telegram-bot-api-secret-token") or ""
    try:
        update = await request.json()
    except ValueError:
        return PlainTextResponse("ok")

    def handle():
        with SessionLocal() as db:
            acc = db.get(IGAccount, account_id)
            if not acc or not acc.tg_secret or not secrets.compare_digest(secret, acc.tg_secret):
                return
            try:
                tgbot.handle_update(db, acc, update)
            except Exception:  # noqa: BLE001
                log.exception("telegram update")

    background.add_task(handle)
    return PlainTextResponse("ok")


# ---------------------------------------------------------------- Meta talab qiladigan sahifalar

def _legal(request: Request, page: str, code: str = ""):
    return templates.TemplateResponse(request, "legal.html", {"page": page, "lang": detect_lang(request),
                                                              "settings": settings, "code": code})


@app.get("/privacy")
def privacy(request: Request):
    return _legal(request, "privacy")


@app.get("/terms")
def terms(request: Request):
    return _legal(request, "terms")


@app.get("/data-deletion")
def data_deletion_page(request: Request, code: str = ""):
    return _legal(request, "deletion", code)


def _delete_by_signed_request(signed_request: str, db: Session) -> bool:
    data = parse_signed_request(signed_request)
    if not data or not data.get("user_id"):
        return False
    uid = str(data["user_id"])
    for acc in db.scalars(select(IGAccount).where((IGAccount.scoped_id == uid) | (IGAccount.ig_user_id == uid))):
        db.delete(acc)
    db.commit()
    return True


@app.post("/data-deletion")
def data_deletion_callback(signed_request: str = Form(...), db: Session = Depends(get_db)):
    if not _delete_by_signed_request(signed_request, db):
        return JSONResponse({"error": "invalid signed_request"}, status_code=400)
    code = secrets.token_hex(8)
    return {"url": f"{settings.APP_URL}/data-deletion?code={code}", "confirmation_code": code}


@app.post("/deauthorize")
def deauthorize_callback(signed_request: str = Form(...), db: Session = Depends(get_db)):
    _delete_by_signed_request(signed_request, db)
    return PlainTextResponse("ok")


# ---------------------------------------------------------------- grafiklar uchun qatorlar

def _days(n: int) -> list[str]:
    today = utcnow().date()
    return [(today - timedelta(days=i)).isoformat() for i in range(n - 1, -1, -1)]


def _series(dates, n: int) -> list[dict]:
    counts = Counter(d.date().isoformat() for d in dates if d)
    return [{"date": day, "value": counts.get(day, 0)} for day in _days(n)]


@app.get("/api/stats/series")
def stats_series(account_id: int, days: int = 30, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    days = max(7, min(days, 90))
    since = utcnow() - timedelta(days=days)
    logs = db.execute(select(EventLog.created_at, EventLog.kind, EventLog.flow_id).where(
        EventLog.account_id == acc.id, EventLog.created_at >= since)).all()
    sends = [r.created_at for r in logs if r.kind in SEND_KINDS]
    clicks = [r.created_at for r in logs if r.kind == "click"]
    contacts = db.scalars(select(Contact.created_at).where(Contact.account_id == acc.id,
                                                           Contact.created_at >= since)).all()
    names = {f.id: f.name for f in acc.flows}
    top = Counter(r.flow_id for r in logs if r.kind in SEND_KINDS and r.flow_id in names).most_common(5)
    return {"sent": _series(sends, days), "contacts": _series(contacts, days), "clicks": _series(clicks, days),
            "top_flows": [{"id": fid, "name": names[fid], "value": n} for fid, n in top]}


# ---------------------------------------------------------------- admin panel

def _user_status(u: User) -> str:
    if u.is_blocked:
        return "blocked"
    if not is_active(u):
        return "expired"
    return u.plan if u.plan in ("pro", "business") else "trial"


def _sent_by_account(db: Session, days: int = 30) -> dict[int, int]:
    rows = db.execute(select(EventLog.account_id, func.count(EventLog.id)).where(
        EventLog.kind.in_(SEND_KINDS), EventLog.created_at >= utcnow() - timedelta(days=days))
        .group_by(EventLog.account_id)).all()
    return {aid: n for aid, n in rows if aid}


def admin_user_row(u: User, sent_30d: dict[int, int]) -> dict:
    return {**user_json(u), "is_blocked": u.is_blocked, "status": _user_status(u),
            "created_at": iso(u.created_at), "last_login_at": iso(u.last_login_at),
            "accounts": [a.username for a in u.accounts],
            "flows": sum(len(a.flows) for a in u.accounts),
            "sent_30d": sum(sent_30d.get(a.id, 0) for a in u.accounts)}


@app.get("/api/admin/overview")
def admin_overview(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    now = utcnow()
    users = db.scalars(select(User)).all()
    customers = [u for u in users if not u.is_admin]  # admin hisoblari statistikaga kirmaydi
    status = Counter(_user_status(u) for u in customers)
    mrr = sum(PLANS[u.plan]["price"] for u in customers if _user_status(u) in ("pro", "business"))
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    revenue_by_day: Counter = Counter()
    for g in db.scalars(select(PlanGrant).where(PlanGrant.created_at >= now - timedelta(days=30))):
        revenue_by_day[g.created_at.date().isoformat()] += g.amount
    sends = db.scalars(select(EventLog.created_at).where(
        EventLog.kind.in_(SEND_KINDS), EventLog.created_at >= now - timedelta(days=30))).all()
    return {
        "users_total": len(users),
        "users_7d": sum(1 for u in users if u.created_at and u.created_at >= now - timedelta(days=7)),
        "status": dict(status),
        "mrr": mrr,
        "revenue_month": db.scalar(select(func.sum(PlanGrant.amount)).where(PlanGrant.created_at >= month_start)) or 0,
        "revenue_total": db.scalar(select(func.sum(PlanGrant.amount))) or 0,
        "ig_accounts": db.scalar(select(func.count(IGAccount.id))) or 0,
        "flows_active": db.scalar(select(func.count(Flow.id)).where(Flow.active.is_(True))) or 0,
        "contacts": db.scalar(select(func.count(Contact.id))) or 0,
        "sent_24h": sum(1 for d in sends if d >= now - timedelta(hours=24)),
        "series": {
            "signups": _series([u.created_at for u in users if u.created_at and u.created_at >= now - timedelta(days=30)], 30),
            "sent": _series(sends, 30),
            "revenue": [{"date": day, "value": revenue_by_day.get(day, 0)} for day in _days(30)],
        },
        "currency": "TJS",
    }


@app.get("/api/admin/users")
def admin_users(q: str = "", status: str = "", page: int = 1, admin: User = Depends(admin_user),
                db: Session = Depends(get_db)):
    stmt = select(User).order_by(User.id.desc())
    if q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(User.email).like(like), func.lower(User.name).like(like)))
    users = db.scalars(stmt).all()
    if status:
        users = [u for u in users if _user_status(u) == status]
    per = 50
    sent = _sent_by_account(db)
    chunk = users[(max(page, 1) - 1) * per: max(page, 1) * per]
    return {"items": [admin_user_row(u, sent) for u in chunk], "total": len(users), "per_page": per}


def _admin_detail(db: Session, u: User) -> dict:
    grants = db.scalars(select(PlanGrant).where(PlanGrant.user_id == u.id).order_by(PlanGrant.id.desc())).all()
    return {**admin_user_row(u, _sent_by_account(db)),
            "grants": [{"id": g.id, "plan": g.plan, "days": g.days, "amount": g.amount, "note": g.note,
                        "created_at": iso(g.created_at), "expires_at": iso(g.expires_at)} for g in grants]}


def _get_user(db: Session, user_id: int) -> User:
    u = db.get(User, user_id)
    if not u:
        err("not_found", 404)
    return u


@app.get("/api/admin/users/{user_id}")
def admin_user_detail(user_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return _admin_detail(db, _get_user(db, user_id))


@app.post("/api/admin/users/{user_id}/grant")
def admin_grant(user_id: int, body: dict = Body(...), admin: User = Depends(admin_user),
                db: Session = Depends(get_db)):
    u = _get_user(db, user_id)
    plan = body.get("plan")
    if plan not in PLANS:
        err("bad_plan")
    try:
        days = int(body.get("days") or 30)
        amount = int(body.get("amount") or 0)
    except (TypeError, ValueError):
        err("bad_number")
    if not 1 <= days <= 3650 or amount < 0:
        err("bad_number")
    now = utcnow()
    current = u.plan_expires_at or now
    # O'sha tarif hali amal qilsa — muddat uzaytiriladi, aks holda bugundan boshlanadi
    base = current if (u.plan == plan and current > now) else now
    u.plan = plan
    u.plan_expires_at = base + timedelta(days=days)
    db.add(PlanGrant(user_id=u.id, plan=plan, days=days, amount=amount, note=str(body.get("note") or "")[:255],
                     granted_by=admin.id, expires_at=u.plan_expires_at))
    db.commit()
    return _admin_detail(db, u)


@app.post("/api/admin/users/{user_id}/expire")
def admin_expire(user_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = _get_user(db, user_id)
    u.plan_expires_at = utcnow()
    db.commit()
    return _admin_detail(db, u)


@app.post("/api/admin/users/{user_id}/block")
def admin_block(user_id: int, body: dict = Body(...), admin: User = Depends(admin_user),
                db: Session = Depends(get_db)):
    u = _get_user(db, user_id)
    if u.id == admin.id:
        err("self")
    u.is_blocked = bool(body.get("blocked"))
    db.commit()
    return _admin_detail(db, u)


@app.get("/api/admin/settings")
def admin_settings(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return {"telegram_username": get_setting(db, "telegram_username")}


@app.put("/api/admin/settings")
def admin_settings_save(body: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    tg = str(body.get("telegram_username") or "").strip()
    for prefix in ("https://t.me/", "http://t.me/", "t.me/", "@"):
        if tg.startswith(prefix):
            tg = tg[len(prefix):]
    tg = tg.strip("/")
    if tg and not all(c.isalnum() or c == "_" for c in tg):
        err("bad_telegram")
    set_setting(db, "telegram_username", tg[:64])
    return {"telegram_username": tg[:64]}


# ---------------------------------------------------------------- email: tasdiqlash va parolni tiklash

_signer = URLSafeTimedSerializer(settings.SECRET_KEY, salt="chatflow-auth")

EMAIL_TEXT = {
    "en": {"reset_s": "Reset your ChatFlow password", "reset_t": "Reset password",
           "reset_b": "Someone (hopefully you) asked to reset the password of your ChatFlow account. The link is valid for 1 hour.",
           "reset_btn": "Set a new password",
           "verify_s": "Confirm your email — ChatFlow", "verify_t": "Confirm your email",
           "verify_b": "Welcome to ChatFlow! Please confirm your email address.", "verify_btn": "Confirm email"},
    "ru": {"reset_s": "Восстановление пароля ChatFlow", "reset_t": "Восстановление пароля",
           "reset_b": "Кто-то (надеемся, вы) запросил сброс пароля аккаунта ChatFlow. Ссылка действует 1 час.",
           "reset_btn": "Задать новый пароль",
           "verify_s": "Подтвердите email — ChatFlow", "verify_t": "Подтвердите email",
           "verify_b": "Добро пожаловать в ChatFlow! Подтвердите, пожалуйста, ваш email.", "verify_btn": "Подтвердить email"},
    "uz": {"reset_s": "ChatFlow parolini tiklash", "reset_t": "Parolni tiklash",
           "reset_b": "Kimdir (umid qilamizki, siz) ChatFlow hisobingiz parolini tiklashni so'radi. Havola 1 soat amal qiladi.",
           "reset_btn": "Yangi parol o'rnatish",
           "verify_s": "Emailingizni tasdiqlang — ChatFlow", "verify_t": "Emailingizni tasdiqlang",
           "verify_b": "ChatFlow'ga xush kelibsiz! Iltimos, email manzilingizni tasdiqlang.", "verify_btn": "Emailni tasdiqlash"},
    "tj": {"reset_s": "Барқарор кардани пароли ChatFlow", "reset_t": "Барқарор кардани парол",
           "reset_b": "Касе (умедворем, шумо) барқарор кардани пароли ҳисоби ChatFlow-ро дархост кард. Пайванд 1 соат эътибор дорад.",
           "reset_btn": "Пароли нав гузоштан",
           "verify_s": "Email-и худро тасдиқ кунед — ChatFlow", "verify_t": "Email-ро тасдиқ кунед",
           "verify_b": "Ба ChatFlow хуш омадед! Лутфан суроғаи email-и худро тасдиқ кунед.", "verify_btn": "Тасдиқи email"},
}


def _mail_bg(cfg: dict, to: str, subject: str, text: str, html: str) -> None:
    try:
        services.send_email(cfg, to, subject, text, html)
    except Exception:  # noqa: BLE001
        log.exception("email yuborilmadi: %s", to)


def _send_verify(background: BackgroundTasks, cfg: dict, user: User) -> None:
    tx = EMAIL_TEXT.get(user.lang, EMAIL_TEXT["en"])
    url = f"{settings.APP_URL}/verify-email?token={_signer.dumps({'k': 'verify', 'uid': user.id, 'e': user.email})}"
    background.add_task(_mail_bg, cfg, user.email, tx["verify_s"], f"{tx['verify_b']}\n\n{url}",
                        services.email_html(tx["verify_t"], tx["verify_b"], tx["verify_btn"], url))


def _untoken(token: str, kind: str, max_age: int) -> dict:
    try:
        data = _signer.loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        err("token_invalid")
    if not isinstance(data, dict) or data.get("k") != kind:
        err("token_invalid")
    return data


@app.get("/api/auth/config")
def auth_config(db: Session = Depends(get_db)):
    return {"google": _google_ready(db), "email": bool(services.smtp_config(db)),
            "telegram": get_setting(db, "telegram_username")}


@app.post("/api/auth/forgot")
def forgot(background: BackgroundTasks, body: dict = Body(...), db: Session = Depends(get_db)):
    cfg = services.smtp_config(db)
    if not cfg:
        return {"sent": False}
    user = db.scalar(select(User).where(User.email == str(body.get("email") or "").strip().lower()))
    if user and not user.is_blocked:  # foydalanuvchi bor-yo'qligini oshkor qilmaymiz
        tx = EMAIL_TEXT.get(user.lang, EMAIL_TEXT["en"])
        token = _signer.dumps({"k": "reset", "uid": user.id, "ph": user.password_hash[-16:]})
        url = f"{settings.APP_URL}/reset?token={token}"
        background.add_task(_mail_bg, cfg, user.email, tx["reset_s"], f"{tx['reset_b']}\n\n{url}",
                            services.email_html(tx["reset_t"], tx["reset_b"], tx["reset_btn"], url))
    return {"sent": True}


@app.post("/api/auth/reset")
def reset_password(request: Request, body: dict = Body(...), db: Session = Depends(get_db)):
    data = _untoken(str(body.get("token") or ""), "reset", 3600)
    user = db.get(User, data.get("uid"))
    # Parol bir marta almashtirilgach, eski havola ishlamaydi
    if not user or user.password_hash[-16:] != data.get("ph") or user.is_blocked:
        err("token_invalid")
    password = str(body.get("password") or "")
    if len(password) < 8:
        err("password_short")
    user.password_hash = hash_password(password)
    user.email_verified = True
    user.last_login_at = utcnow()
    db.commit()
    request.session.clear()
    request.session["uid"] = user.id
    return {"user": user_json(user)}


@app.post("/api/auth/verify/send")
def verify_send(background: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    cfg = services.smtp_config(db)
    if not cfg:
        err("email_disabled")
    _send_verify(background, cfg, user)
    return {"ok": True}


@app.get("/verify-email")
def verify_email(token: str = "", db: Session = Depends(get_db)):
    try:
        data = _signer.loads(token, max_age=7 * 86400)
        user = db.get(User, data.get("uid")) if data.get("k") == "verify" else None
    except (BadSignature, SignatureExpired):
        user = None
    if not user or user.email != data.get("e"):
        return RedirectResponse("/app?verified=0", status_code=303)
    user.email_verified = True
    db.commit()
    return RedirectResponse("/app?verified=1", status_code=303)


# ---------------------------------------------------------------- Google orqali kirish

def _google_ready(db: Session) -> bool:
    return bool(get_setting(db, "google_client_id") and services.get_secret(db, "google_client_secret"))


def _google_redirect() -> str:
    return f"{settings.APP_URL}/auth/google/callback"


@app.get("/auth/google")
def google_start(request: Request, db: Session = Depends(get_db)):
    if not _google_ready(db):
        return RedirectResponse("/login?error=google", status_code=303)
    state = secrets.token_urlsafe(24)
    request.session["google_state"] = state
    params = {"client_id": get_setting(db, "google_client_id"), "redirect_uri": _google_redirect(),
              "response_type": "code", "scope": "openid email profile", "state": state, "prompt": "select_account"}
    return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params), status_code=302)


@app.get("/auth/google/callback")
def google_callback(request: Request, code: str = "", state: str = "", db: Session = Depends(get_db)):
    expected = request.session.pop("google_state", None)
    if not code or not expected or state != expected or not _google_ready(db):
        return RedirectResponse("/login?error=google", status_code=303)
    try:
        tok = _http.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": get_setting(db, "google_client_id"),
            "client_secret": services.get_secret(db, "google_client_secret"),
            "redirect_uri": _google_redirect(), "grant_type": "authorization_code"}).json()
        info = _http.get("https://openidconnect.googleapis.com/v1/userinfo",
                         headers={"Authorization": f"Bearer {tok['access_token']}"}).json()
    except (httpx.HTTPError, KeyError, ValueError):
        return RedirectResponse("/login?error=google", status_code=303)
    email = str(info.get("email") or "").lower()
    if not info.get("sub") or not email or not info.get("email_verified"):
        return RedirectResponse("/login?error=google", status_code=303)
    user = db.scalar(select(User).where(User.google_sub == info["sub"])) or \
        db.scalar(select(User).where(User.email == email))
    if user and user.is_blocked:
        return RedirectResponse("/login?error=blocked", status_code=303)
    if not user:
        user = User(email=email, name=str(info.get("name") or "")[:120], password_hash=hash_password(secrets.token_urlsafe(24)),
                    lang=detect_lang(request), plan="trial", plan_expires_at=utcnow() + timedelta(days=TRIAL_DAYS))
        if email in _admin_emails():
            user.is_admin = True
        db.add(user)
    user.google_sub = info["sub"]
    user.email_verified = True
    user.last_login_at = utcnow()
    db.commit()
    request.session.clear()
    request.session["uid"] = user.id
    return RedirectResponse("/app", status_code=303)


# ---------------------------------------------------------------- integratsiyalar (AI, Telegram)

def _integrations_json(db: Session, acc: IGAccount) -> dict:
    return {"ai_enabled": acc.ai_enabled, "ai_prompt": acc.ai_prompt, "ai_available": services.ai_available(db),
            "ai_collect_leads": acc.ai_collect_leads,
            "telegram": {"connected": bool(acc.tg_chat_id), "chat": acc.tg_chat_title,
                         "two_way": settings.APP_URL.startswith("https://")},
            "tg_notify_leads": acc.tg_notify_leads, "tg_notify_inbox": acc.tg_notify_inbox,
            "tg_notify_all": acc.tg_notify_all}


@app.get("/api/accounts/{account_id}/integrations")
def integrations_get(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _integrations_json(db, owned_account(db, user, account_id))


@app.put("/api/accounts/{account_id}/integrations")
def integrations_save(account_id: int, body: dict = Body(...), user: User = Depends(owner_user),
                      db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    if "ai_prompt" in body:
        acc.ai_prompt = str(body["ai_prompt"] or "")[:8000]
    for key in ("ai_enabled", "ai_collect_leads", "tg_notify_leads", "tg_notify_inbox", "tg_notify_all"):
        if key in body:
            setattr(acc, key, bool(body[key]))
    db.commit()
    return _integrations_json(db, acc)


@app.post("/api/accounts/{account_id}/telegram")
def telegram_connect(account_id: int, body: dict = Body(...), user: User = Depends(owner_user),
                     db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    token = str(body.get("bot_token") or "").strip()
    if not token or ":" not in token:
        err("tg_invalid")
    acc.tg_secret = secrets.token_urlsafe(24)
    try:
        chat_id, title = services.telegram_connect(token, tgbot.webhook_url(acc), acc.tg_secret)
    except services.TelegramError as e:
        err("tg_no_chat" if str(e) == "no_chat" else "tg_invalid")
    acc.tg_bot_token_enc = encrypt(token)
    acc.tg_chat_id = chat_id
    acc.tg_chat_title = title[:255]
    acc.tg_bot_username = services.LAST_BOT_USERNAME[:64]
    db.commit()
    services.telegram_send(acc.tg_bot_token_enc, chat_id, f"✅ ChatFlow: @{acc.username}\n\n{tgbot.t(acc, 'help')}")
    return _integrations_json(db, acc)


@app.delete("/api/accounts/{account_id}/telegram")
def telegram_disconnect(account_id: int, user: User = Depends(owner_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    if acc.tg_bot_token_enc:
        try:
            services.telegram_call(acc.tg_bot_token_enc, "deleteWebhook")
        except (services.TelegramError, ValueError):
            pass
    acc.tg_bot_token_enc, acc.tg_chat_id, acc.tg_chat_title, acc.tg_secret = "", "", "", ""
    db.commit()
    return _integrations_json(db, acc)


@app.post("/api/accounts/{account_id}/ai/test")
def ai_test(account_id: int, body: dict = Body(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    if not services.ai_available(db):
        err("ai_unavailable")
    question = str(body.get("message") or "").strip()[:1000]
    if not question:
        err("empty")
    prompt = str(body.get("prompt") if body.get("prompt") is not None else acc.ai_prompt)
    collect = body.get("collect_leads") if body.get("collect_leads") is not None else acc.ai_collect_leads
    products = catalog.active_products(db, acc.id)
    answer = services.ai_reply(db, prompt, [{"role": "user", "content": question}], "ask" if collect else "off",
                               catalog.catalog_text(products))
    if not answer:
        err("ai_failed")
    text, ids = catalog.split_tags(answer)
    return {"answer": text, "products": [_product_json(p) for pid in ids for p in products if p.id == pid]}


# ---------------------------------------------------------------- jonli chat (Inbox)

def _owned_contact(db: Session, user: User, contact_id: int) -> Contact:
    c = db.get(Contact, contact_id)
    if not c or c.account.user_id != ws_id(user):
        err("not_found", 404)
    return c


def _conv_json(c: Contact) -> dict:
    return {**contact_json(c), "preview": c.last_message_preview, "last_message_at": iso(c.last_message_at),
            "unread": c.unread or 0, "bot_paused": c.bot_paused(), "bot_paused_until": iso(c.bot_paused_until),
            "can_message": c.can_message()}


@app.get("/api/inbox")
def inbox_list(account_id: int, q: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    stmt = select(Contact).where(Contact.account_id == acc.id, Contact.last_message_at.is_not(None))
    if q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(Contact.username).like(like), func.lower(Contact.name).like(like)))
    rows = db.scalars(stmt.order_by(Contact.last_message_at.desc()).limit(100)).all()
    return {"items": [_conv_json(c) for c in rows],
            "unread": db.scalar(select(func.coalesce(func.sum(Contact.unread), 0)).where(Contact.account_id == acc.id)) or 0}


@app.get("/api/inbox/{contact_id}")
def inbox_thread(contact_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _owned_contact(db, user, contact_id)
    msgs = db.scalars(select(Message).where(Message.contact_id == c.id).order_by(Message.id.desc()).limit(200)).all()
    if c.unread:
        c.unread = 0
        db.commit()
    return {"contact": _conv_json(c),
            "messages": [{"id": m.id, "direction": m.direction, "source": m.source, "text": m.text,
                          "created_at": iso(m.created_at)} for m in reversed(msgs)]}


@app.post("/api/inbox/{contact_id}/send")
def inbox_send(contact_id: int, body: dict = Body(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _owned_contact(db, user, contact_id)
    text = str(body.get("text") or "").strip()
    if not text or len(text) > 1000:
        err("message_text")
    if not is_active(user.workspace):
        err("plan_inactive")
    if not c.can_message():
        err("window_closed")
    try:
        ig.send_dm(decrypt(c.account.access_token_enc), c.igsid, {"text": text})
    except ig.IGError as e:
        err(f"ig:{e}"[:200])
    log_event(db, c.account, c, "agent_reply", "", text)
    record_message(db, c.account_id, c, "out", text, "agent")
    if body.get("pause", True):
        until = utcnow() + timedelta(minutes=60)
        if not c.bot_paused_until or c.bot_paused_until < until:
            c.bot_paused_until = until
        db.commit()
    return inbox_thread(contact_id, user, db)


@app.post("/api/inbox/{contact_id}/pause")
def inbox_pause(contact_id: int, body: dict = Body(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _owned_contact(db, user, contact_id)
    minutes = max(0, min(int(body.get("minutes") or 0), 60 * 24 * 30))
    c.bot_paused_until = utcnow() + timedelta(minutes=minutes) if minutes else None
    db.commit()
    return _conv_json(c)


# ---------------------------------------------------------------- rassilka

def _broadcast_json(b: Broadcast) -> dict:
    return {"id": b.id, "text": b.text, "tag": b.tag, "status": b.status, "total": b.total, "sent": b.sent,
            "failed": b.failed, "buttons": json.loads(b.buttons_json or "[]"),
            "created_at": iso(b.created_at), "finished_at": iso(b.finished_at)}


@app.get("/api/broadcasts")
def broadcasts_list(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    rows = db.scalars(select(Broadcast).where(Broadcast.account_id == acc.id).order_by(Broadcast.id.desc()).limit(50)).all()
    return {"items": [_broadcast_json(b) for b in rows]}


@app.get("/api/broadcasts/audience")
def broadcasts_audience(account_id: int, tag: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    return {"eligible": len(broadcast_audience(db, acc.id, tag.strip())),
            "total": db.scalar(select(func.count(Contact.id)).where(Contact.account_id == acc.id)) or 0}


@app.post("/api/broadcasts")
def broadcasts_create(body: dict = Body(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, int(body.get("account_id") or 0))
    if not is_active(user.workspace):
        err("plan_inactive")
    text = str(body.get("text") or "").strip()
    buttons = []
    for b in (body.get("buttons") or [])[:3]:
        title, url = str(b.get("title") or "").strip(), str(b.get("url") or "").strip()
        if not title and not url:
            continue
        if not title or len(title) > 20:
            err("button_title")
        if not url.startswith(("https://", "http://")):
            err("button_url")
        buttons.append({"title": title, "url": url})
    if not text or len(text) > (640 if buttons else 1000):
        err("message_text")
    if db.scalar(select(Broadcast).where(Broadcast.account_id == acc.id, Broadcast.status == "running")):
        err("broadcast_running")
    tag = str(body.get("tag") or "").strip()[:40]
    audience = broadcast_audience(db, acc.id, tag)
    if not audience:
        err("no_audience")
    b = Broadcast(account_id=acc.id, text=text, tag=tag, total=len(audience),
                  buttons_json=json.dumps(buttons, ensure_ascii=False))
    db.add(b)
    db.commit()
    threading.Thread(target=run_broadcast, args=(b.id,), daemon=True).start()
    return _broadcast_json(b)


# ---------------------------------------------------------------- mahsulot katalogi

def _product_json(p: Product) -> dict:
    return {"id": p.id, "name": p.name, "price": p.price, "description": p.description, "image": p.image,
            "image_url": catalog.image_url(p), "url": p.url, "active": p.active, "sort": p.sort}


def _owned_product(db: Session, user: User, product_id: int) -> Product:
    p = db.get(Product, product_id)
    if not p or db.get(IGAccount, p.account_id).user_id != ws_id(user):
        err("not_found", 404)
    return p


def _apply_product(p: Product, body: dict) -> None:
    if "name" in body:
        name = str(body["name"] or "").strip()[:80]
        if not name:
            err("product_name")
        p.name = name
    for key, limit in (("price", 60), ("description", 1000)):
        if key in body:
            setattr(p, key, str(body[key] or "").strip()[:limit])
    for key in ("image", "url"):
        if key in body:
            val = str(body[key] or "").strip()[:500]
            if val and key == "url" and not val.startswith(("https://", "http://")):
                err("button_url")
            setattr(p, key, val)
    if "active" in body:
        p.active = bool(body["active"])
    if "sort" in body:
        p.sort = int(body["sort"] or 0)


@app.get("/api/products")
def products_list(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    rows = db.scalars(select(Product).where(Product.account_id == acc.id).order_by(Product.sort, Product.id)).all()
    return {"items": [_product_json(p) for p in rows]}


@app.post("/api/products")
def product_create(body: dict = Body(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, int(body.get("account_id") or 0))
    if db.scalar(select(func.count(Product.id)).where(Product.account_id == acc.id)) >= 100:
        err("too_many")
    p = Product(account_id=acc.id, name="")
    _apply_product(p, {"name": body.get("name"), **body})
    db.add(p)
    db.commit()
    return _product_json(p)


@app.put("/api/products/{product_id}")
def product_update(product_id: int, body: dict = Body(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _owned_product(db, user, product_id)
    _apply_product(p, body)
    db.commit()
    return _product_json(p)


@app.delete("/api/products/{product_id}")
def product_delete(product_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _owned_product(db, user, product_id)
    if p.image and not p.image.startswith("http"):
        (UPLOAD_DIR / p.image).unlink(missing_ok=True)
    db.delete(p)
    db.commit()
    return {"ok": True}


IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


@app.post("/api/uploads")
async def upload_image(file: UploadFile = File(...), user: User = Depends(current_user)):
    ext = IMAGE_TYPES.get(file.content_type or "")
    if not ext:
        err("bad_image")
    data = await file.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        err("image_too_large")
    # Fayl haqiqatan rasm ekanini sarlavhasidan tekshiramiz
    if not (data.startswith(b"\xff\xd8") or data.startswith(b"\x89PNG") or data[8:12] == b"WEBP"):
        err("bad_image")
    name = f"{user.id}-{secrets.token_hex(10)}{ext}"
    (UPLOAD_DIR / name).write_bytes(data)
    return {"image": name, "image_url": f"{settings.APP_URL}/uploads/{name}"}


# ---------------------------------------------------------------- jamoa (menejerlar)

def _team_options(db: Session, user: User) -> list[dict]:
    owner = user.workspace
    return [{"id": u.id, "name": u.name or u.email, "role": "owner" if u.id == owner.id else ("ai" if u.is_ai else "manager")}
            for u in [owner, *crm.team_members(db, owner.id)]]


def _member_json(db: Session, owner: User, u: User) -> dict:
    links = []
    for acc in owner.accounts:
        if acc.tg_bot_token_enc:
            linked = db.scalar(select(TeamTg).where(TeamTg.user_id == u.id, TeamTg.account_id == acc.id)) is not None
            link = f"https://t.me/{acc.tg_bot_username}?start={tgbot.start_token(u.id, acc.id)}" if acc.tg_bot_username else ""
            links.append({"account_id": acc.id, "username": acc.username, "linked": linked, "link": link})
    assigned = db.scalar(select(func.count(Contact.id)).where(Contact.assigned_to == u.id)) or 0
    return {"id": u.id, "name": u.name, "email": u.email, "created_at": iso(u.created_at),
            "last_login_at": iso(u.last_login_at), "assigned": assigned, "telegram": links}


def _ai_manager_json(db: Session, m: User | None) -> dict | None:
    if not m:
        return None
    return {"id": m.id, "name": m.name, "instructions": m.ai_instructions, "followup_hours": m.ai_followup_hours,
            "take_all": m.ai_take_all, "assigned": db.scalar(select(func.count(Contact.id)).where(Contact.assigned_to == m.id)) or 0}


@app.get("/api/team")
def team_list(user: User = Depends(owner_user), db: Session = Depends(get_db)):
    return {"members": [_member_json(db, user, m) for m in crm.team_members(db, user.id) if not m.is_ai],
            "auto_assign": user.auto_assign, "ai_manager": _ai_manager_json(db, aimanager.get_ai_manager(db, user.id)),
            "ai_available": services.ai_available(db)}


@app.put("/api/team/ai")
def team_ai_save(body: dict = Body(...), user: User = Depends(owner_user), db: Session = Depends(get_db)):
    m = aimanager.get_ai_manager(db, user.id)
    if not m:
        m = User(email=f"ai-{user.id}-{secrets.token_hex(4)}@ai.chatflow.local", name="AI Menejer", is_ai=True,
                 password_hash=hash_password(secrets.token_urlsafe(32)), owner_id=user.id, lang=user.lang, plan="trial")
        db.add(m)
    if "name" in body:
        m.name = str(body["name"] or "").strip()[:120] or "AI Menejer"
    if "instructions" in body:
        m.ai_instructions = str(body["instructions"] or "")[:4000]
    if "followup_hours" in body:
        m.ai_followup_hours = max(0, min(int(body["followup_hours"] or 0), 20))
    if "take_all" in body:
        m.ai_take_all = bool(body["take_all"])
    db.commit()
    return _ai_manager_json(db, m)


@app.delete("/api/team/ai")
def team_ai_delete(user: User = Depends(owner_user), db: Session = Depends(get_db)):
    m = aimanager.get_ai_manager(db, user.id)
    if m:
        for c in db.scalars(select(Contact).where(Contact.assigned_to == m.id)):
            c.assigned_to = None
        db.delete(m)
        db.commit()
    return {"ok": True}


@app.post("/api/team")
def team_add(body: dict = Body(...), user: User = Depends(owner_user), db: Session = Depends(get_db)):
    email = str(body.get("email") or "").strip().lower()
    if "@" not in email or len(email) > 255:
        err("email_invalid")
    if db.scalar(select(User).where(User.email == email)):
        err("email_taken")
    if len(crm.team_members(db, user.id)) >= 20:
        err("too_many")
    password = secrets.token_urlsafe(8)
    member = User(email=email, name=str(body.get("name") or "").strip()[:120], password_hash=hash_password(password),
                  lang=user.lang, owner_id=user.id, plan="trial")
    db.add(member)
    db.commit()
    return {**_member_json(db, user, member), "password": password}


@app.post("/api/team/{member_id}/password")
def team_password(member_id: int, user: User = Depends(owner_user), db: Session = Depends(get_db)):
    m = db.get(User, member_id)
    if not m or m.owner_id != user.id:
        err("not_found", 404)
    password = secrets.token_urlsafe(8)
    m.password_hash = hash_password(password)
    db.commit()
    return {"password": password}


@app.delete("/api/team/{member_id}")
def team_remove(member_id: int, user: User = Depends(owner_user), db: Session = Depends(get_db)):
    m = db.get(User, member_id)
    if not m or m.owner_id != user.id:
        err("not_found", 404)
    for c in db.scalars(select(Contact).where(Contact.assigned_to == m.id)):
        c.assigned_to = None
    db.delete(m)
    db.commit()
    return {"ok": True}


@app.put("/api/team/settings")
def team_settings(body: dict = Body(...), user: User = Depends(owner_user), db: Session = Depends(get_db)):
    if "auto_assign" in body:
        user.auto_assign = bool(body["auto_assign"])
    db.commit()
    return {"auto_assign": user.auto_assign}


# ---------------------------------------------------------------- eslatmalar va onboarding

@app.get("/api/reminders")
def reminders(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    stmt = select(Note).where(Note.account_id == acc.id, Note.remind_at.is_not(None), Note.reminded.is_(False))
    if user.is_manager:
        stmt = stmt.where(or_(Note.created_by == user.id, Note.contact_id.in_(
            select(Contact.id).where(Contact.assigned_to == user.id))))
    rows = db.scalars(stmt.order_by(Note.remind_at).limit(20)).all()
    out = []
    for n in rows:
        c = db.get(Contact, n.contact_id)
        out.append({"id": n.id, "text": n.text, "remind_at": iso(n.remind_at), "contact_id": n.contact_id,
                    "contact": (f"@{c.username}" if c and c.username else (c.name if c else "")) or "—"})
    my = db.scalar(select(func.count(Contact.id)).where(Contact.account_id == acc.id, Contact.assigned_to == user.id,
                                                         Contact.stage.is_not(None))) or 0
    return {"items": out, "my_leads": my}


@app.get("/api/onboarding")
def onboarding(account_id: int = 0, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owner = user.workspace
    acc = db.get(IGAccount, account_id) if account_id else None
    if acc and acc.user_id != owner.id:
        acc = None
    acc = acc or (owner.accounts[0] if owner.accounts else None)
    steps = {"instagram": bool(owner.accounts), "products": False, "ai": False, "flow": False,
             "telegram": False, "team": bool(crm.team_members(db, owner.id))}
    if acc:
        steps["products"] = (db.scalar(select(func.count(Product.id)).where(Product.account_id == acc.id)) or 0) > 0
        steps["ai"] = bool(acc.ai_enabled and acc.ai_prompt.strip())
        steps["flow"] = (db.scalar(select(func.count(Flow.id)).where(Flow.account_id == acc.id, Flow.active.is_(True))) or 0) > 0
        steps["telegram"] = bool(acc.tg_chat_id)
    return {"steps": steps, "done": sum(steps.values()), "total": len(steps)}


# ---------------------------------------------------------------- AI bilan ssenariy yaratish

@app.post("/api/flows/generate")
def flow_generate(body: dict = Body(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, int(body.get("account_id") or 0))
    idea = str(body.get("prompt") or "").strip()[:2000]
    if len(idea) < 5:
        err("empty")
    if not services.ai_available(db):
        err("ai_unavailable")
    stages = crm.get_stages(acc)
    products = [p.name for p in catalog.active_products(db, acc.id)]
    text, error = services.ai_complete(db, generate_system(user.lang, stages, products), idea, json_mode=True)
    if not text:
        return JSONResponse({"error": "ai_failed", "detail": error or ""}, status_code=400)
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").split("\n", 1)[-1].rsplit("```", 1)[0]
    try:
        start, end = raw.index("{"), raw.rindex("}") + 1
        name, graph = normalize_generated(json.loads(raw[start:end]), {s["id"] for s in stages})
    except (ValueError, TypeError):
        return JSONResponse({"error": "ai_failed", "detail": "bad json"}, status_code=400)
    flow = Flow(account_id=acc.id, name=name, active=False)
    flow.graph = graph
    flow.trigger_kind = graph["nodes"][0]["data"].get("kind", "")
    db.add(flow)
    db.commit()
    return {**flow_summary(flow), "errors": validate_graph(graph)}


# ---------------------------------------------------------------- CRM

@app.get("/api/crm")
def crm_board(account_id: int, q: str = "", assigned: str = "", user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    stages = crm.get_stages(acc)
    ids = [s["id"] for s in stages]
    stmt = select(Contact).where(Contact.account_id == acc.id, Contact.stage.in_(ids))
    if q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(Contact.username).like(like), func.lower(Contact.name).like(like),
                              func.lower(Contact.fields_json).like(like)))
    if assigned == "me":
        stmt = stmt.where(Contact.assigned_to == user.id)
    elif assigned == "none":
        stmt = stmt.where(Contact.assigned_to.is_(None))
    elif assigned.isdigit():
        stmt = stmt.where(Contact.assigned_to == int(assigned))
    cards = db.scalars(stmt.order_by(Contact.stage_changed_at.desc()).limit(1000)).all()
    reminders = dict(db.execute(select(Note.contact_id, func.min(Note.remind_at)).where(
        Note.account_id == acc.id, Note.remind_at.is_not(None), Note.reminded.is_(False)).group_by(Note.contact_id)).all())
    notes = dict(db.execute(select(Note.contact_id, func.count(Note.id)).where(
        Note.account_id == acc.id, Note.kind == "note").group_by(Note.contact_id)).all())
    totals = {sid: {"count": 0, "sum": 0} for sid in ids}
    for c in cards:
        totals[c.stage]["count"] += 1
        totals[c.stage]["sum"] += c.deal_value or 0
    return {"stages": stages, "totals": totals,
            "cards": [{**contact_json(c), "notes": notes.get(c.id, 0), "next_reminder": iso(reminders.get(c.id))}
                      for c in cards],
            "team": _team_options(db, user)}


@app.get("/api/crm/stages")
def crm_stages(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"stages": crm.get_stages(owned_account(db, user, account_id))}


@app.put("/api/crm/stages")
def crm_stages_save(body: dict = Body(...), user: User = Depends(owner_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, int(body.get("account_id") or 0))
    stages = crm.validate_stages(body.get("stages"))
    if isinstance(stages, str):
        err(stages)
    ids = {s["id"] for s in stages}
    # O'chirilgan bosqichdagi mijozlar birinchi bosqichga o'tadi
    for c in db.scalars(select(Contact).where(Contact.account_id == acc.id, Contact.stage.is_not(None))):
        if c.stage not in ids:
            c.stage = stages[0]["id"]
    acc.crm_stages_json = json.dumps(stages, ensure_ascii=False)
    db.commit()
    return {"stages": stages}


@app.get("/api/contacts/{contact_id}/timeline")
def contact_timeline(contact_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _owned_contact(db, user, contact_id)
    notes = db.scalars(select(Note).where(Note.contact_id == c.id).order_by(Note.id.desc()).limit(100)).all()
    msgs = db.scalars(select(Message).where(Message.contact_id == c.id).order_by(Message.id.desc()).limit(50)).all()
    items = [{"type": n.kind, "id": f"n{n.id}", "text": n.text, "author": n.author, "created_at": iso(n.created_at),
              "remind_at": iso(n.remind_at), "reminded": n.reminded} for n in notes]
    items += [{"type": "message", "id": f"m{m.id}", "text": m.text, "direction": m.direction, "source": m.source,
               "created_at": iso(m.created_at)} for m in msgs]
    items.sort(key=lambda x: x["created_at"] or "", reverse=True)
    return {"contact": contact_json(c), "stages": crm.get_stages(c.account), "items": items[:120],
            "team": _team_options(db, user)}


@app.post("/api/contacts/{contact_id}/notes")
def contact_note(contact_id: int, body: dict = Body(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _owned_contact(db, user, contact_id)
    text = str(body.get("text") or "").strip()
    if not text:
        err("empty")
    note = crm.add_note(db, c, text, user.name or user.email, created_by=user.id)
    if body.get("remind_at"):
        try:
            when = datetime.fromisoformat(str(body["remind_at"]).replace("Z", "+00:00"))
        except ValueError:
            err("bad_date")
        if when.tzinfo:
            when = when.astimezone(timezone.utc).replace(tzinfo=None)
        note.remind_at = when
        db.commit()
    return contact_timeline(contact_id, user, db)


# ---------------------------------------------------------------- admin: platforma sozlamalari, parol

@app.post("/api/admin/users/{user_id}/password")
def admin_set_password(user_id: int, body: dict = Body(...), admin: User = Depends(admin_user),
                       db: Session = Depends(get_db)):
    u = _get_user(db, user_id)
    password = str(body.get("password") or "")
    if len(password) < 8:
        err("password_short")
    u.password_hash = hash_password(password)
    db.commit()
    return {"ok": True}


PLAIN_SETTINGS = ("smtp_host", "smtp_port", "smtp_user", "smtp_from", "google_client_id", "ai_provider", "gemini_model")


def _platform_settings(db: Session) -> dict:
    out = {"telegram_username": get_setting(db, "telegram_username")}
    for k in PLAIN_SETTINGS:
        out[k] = get_setting(db, k)
    for k in services.SECRET_KEYS:
        out[f"{k}_set"] = bool(get_setting(db, k))
    out["google_redirect"] = _google_redirect()
    out["ai_provider"] = services.ai_provider(db)
    out["gemini_model"] = out["gemini_model"] or services.GEMINI_DEFAULT_MODEL
    return out


@app.get("/api/admin/platform")
def admin_platform(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return _platform_settings(db)


@app.put("/api/admin/platform")
def admin_platform_save(body: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    if "ai_provider" in body and body["ai_provider"] not in services.AI_PROVIDERS:
        err("bad_provider")
    for k in PLAIN_SETTINGS:
        if k in body:
            set_setting(db, k, str(body[k] or "").strip()[:255])
    for k in services.SECRET_KEYS:
        if body.get(k):  # bo'sh qoldirilsa — eski qiymat saqlanadi
            services.set_secret(db, k, str(body[k]).strip())
        if body.get(f"clear_{k}"):
            services.set_secret(db, k, "")
    return _platform_settings(db)


@app.post("/api/admin/platform/test-ai")
def admin_test_ai(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    answer, error = services.ai_generate(db, "A flower shop in Dushanbe. Delivery is free.",
                                         [{"role": "user", "content": "Salom! Yetkazib berish bepulmi?"}])
    if not answer:
        return JSONResponse({"error": "ai_failed", "detail": error or ""}, status_code=400)
    return {"answer": answer, "provider": services.ai_provider(db)}


@app.post("/api/admin/platform/test-email")
def admin_test_email(body: dict = Body(...), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    cfg = services.smtp_config(db)
    if not cfg:
        err("email_disabled")
    try:
        services.send_email(cfg, str(body.get("to") or admin.email), "ChatFlow SMTP test", "SMTP ishlayapti ✅")
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": "smtp_failed", "detail": str(e)[:300]}, status_code=400)
    return {"ok": True}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"ok": True}


# ---------------------------------------------------------------- React ilova (SPA)

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

if (WEB_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path.startswith(("api/", "webhook", "auth/google", "tg/", "uploads/")):
        return JSONResponse({"error": "not_found"}, status_code=404)
    static = (WEB_DIR / path).resolve()
    if path and static.is_file() and WEB_DIR.resolve() in static.parents:
        return FileResponse(static)
    index = WEB_DIR / "index.html"
    if index.is_file():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return PlainTextResponse("Frontend build topilmadi (app/web).", status_code=503)

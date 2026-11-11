import asyncio
import csv
import io
import json
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote

from fastapi import BackgroundTasks, Body, Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import (FileResponse, JSONResponse, PlainTextResponse, RedirectResponse,
                               StreamingResponse)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from . import instagram as ig
from .config import settings
from .db import get_db, init_db
from .engine import process_payload, refresh_expiring_tokens, resubscribe_all, run_due_jobs
from .flows import blank_graph, build_template, list_templates, trigger_of, validate_graph
from .models import (LANGS, SEND_KINDS, Contact, EventLog, Flow, IGAccount, NodeStat, User, utcnow)
from .security import (decrypt, encrypt, hash_password, parse_signed_request, verify_password,
                       verify_webhook_signature)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")

WEB_DIR = Path(__file__).parent / "web"


async def _background_loops():
    try:
        await asyncio.to_thread(resubscribe_all)
    except Exception:
        log.exception("resubscribe")
    tick = 0
    while True:
        try:
            await asyncio.to_thread(run_due_jobs)
            if tick % 720 == 0:  # ~6 soatda bir
                await asyncio.to_thread(refresh_expiring_tokens)
        except Exception:
            log.exception("background loop")
        tick += 1
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(_background_loops())
    yield
    task.cancel()


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
    return user


def owned_account(db: Session, user: User, account_id: int) -> IGAccount:
    acc = db.get(IGAccount, account_id)
    if not acc or acc.user_id != user.id:
        err("not_found", 404)
    return acc


def owned_flow(db: Session, user: User, flow_id: int) -> Flow:
    flow = db.get(Flow, flow_id)
    if not flow or flow.account.user_id != user.id:
        err("not_found", 404)
    return flow


def iso(dt) -> str | None:
    return dt.isoformat() + "Z" if dt else None


def user_json(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "lang": u.lang, "is_admin": u.is_admin}


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
            "created_at": iso(c.created_at)}


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
def register(request: Request, body: dict = Body(...), db: Session = Depends(get_db)):
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
    user = User(email=email, name=name, password_hash=hash_password(password), lang=lang)
    db.add(user)
    db.commit()
    request.session.clear()
    request.session["uid"] = user.id
    return {"user": user_json(user)}


@app.post("/api/auth/login")
def login(request: Request, body: dict = Body(...), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(body.get("email") or "").strip().lower()))
    if not user or not verify_password(str(body.get("password") or ""), user.password_hash):
        err("login_failed", 401)
    request.session.clear()
    request.session["uid"] = user.id
    return {"user": user_json(user)}


@app.post("/api/auth/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return {"user": user_json(user), "accounts": [account_json(a) for a in user.accounts],
            "ig_ready": settings.ig_ready}


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
    if acc and acc.user_id != user.id:
        return back("account_taken")
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
def account_toggle(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    acc.active = not acc.active
    db.commit()
    return account_json(acc)


@app.delete("/api/accounts/{account_id}")
def account_delete(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
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
    if not c or c.account.user_id != user.id:
        err("not_found", 404)
    if isinstance(body.get("tags"), list):
        c.tags = body["tags"]
    if isinstance(body.get("fields"), dict):
        c.fields = {str(k)[:30]: str(v)[:500] for k, v in body["fields"].items()}
    if "name" in body:
        c.name = str(body["name"] or "")[:255]
    db.commit()
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
    w.writerow(["username", "name", "tags", "follows", "first_seen", "last_seen", *keys])
    for c in rows:
        w.writerow([c.username, c.name, ", ".join(c.tags), "" if c.follows is None else int(c.follows),
                    iso(c.created_at), iso(c.last_seen_at), *[c.fields.get(k, "") for k in keys]])
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


# ---------------------------------------------------------------- React ilova (SPA)

if (WEB_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path.startswith(("api/", "webhook")):
        return JSONResponse({"error": "not_found"}, status_code=404)
    static = (WEB_DIR / path).resolve()
    if path and static.is_file() and WEB_DIR.resolve() in static.parents:
        return FileResponse(static)
    index = WEB_DIR / "index.html"
    if index.is_file():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return PlainTextResponse("Frontend build topilmadi (app/web).", status_code=503)

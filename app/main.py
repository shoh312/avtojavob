import asyncio
import json
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, Form, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from . import instagram as ig
from .config import settings
from .db import get_db, init_db
from .engine import process_payload, refresh_expiring_tokens, resubscribe_all
from .models import (DEFAULT_FOLLOW_BUTTON, DEFAULT_GATE_BUTTON, DEFAULT_NOT_FOLLOWING, MATCH_MODES, SEND_KINDS,
                     TRIGGERS, EventLog, IGAccount, Rule, User, utcnow)
from .security import (decrypt, encrypt, hash_password, parse_signed_request,
                       verify_password, verify_webhook_signature)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")


async def _refresh_loop():
    try:
        await asyncio.to_thread(resubscribe_all)
    except Exception:
        log.exception("resubscribe")
    while True:
        try:
            await asyncio.to_thread(refresh_expiring_tokens)
        except Exception:
            log.exception("token refresh loop")
        await asyncio.sleep(6 * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(_refresh_loop())
    yield
    task.cancel()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    same_site="lax",
    https_only=settings.APP_URL.startswith("https"),
    max_age=30 * 86400,
)
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


# ---------- Yordamchilar ----------

class LoginRequired(Exception):
    pass


class NotFound(Exception):
    pass


@app.exception_handler(LoginRequired)
async def _login_required(request: Request, exc: LoginRequired):
    return RedirectResponse("/login", status_code=303)


@app.exception_handler(NotFound)
async def _not_found(request: Request, exc: NotFound):
    return PlainTextResponse("Topilmadi", status_code=404)


def current_user(request: Request, db: Session) -> User | None:
    uid = request.session.get("uid")
    return db.get(User, uid) if uid else None


def require_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = current_user(request, db)
    if not user:
        raise LoginRequired()
    return user


def flash(request: Request, message: str, kind: str = "ok") -> None:
    items = request.session.get("flashes", [])
    items.append({"kind": kind, "message": message})
    request.session["flashes"] = items


def render(request: Request, name: str, **ctx):
    ctx.setdefault("user", None)
    ctx["flashes"] = request.session.pop("flashes", [])
    ctx["settings"] = settings
    return templates.TemplateResponse(request, name, ctx)


def redirect(url: str) -> RedirectResponse:
    return RedirectResponse(url, status_code=303)


def owned_account(db: Session, user: User, account_id: int) -> IGAccount:
    acc = db.get(IGAccount, account_id)
    if not acc or acc.user_id != user.id:
        raise NotFound()
    return acc


def owned_rule(db: Session, user: User, rule_id: int) -> Rule:
    rule = db.get(Rule, rule_id)
    if not rule or rule.account.user_id != user.id:
        raise NotFound()
    return rule


# ---------- Sahifalar ----------

@app.get("/")
def index(request: Request, db: Session = Depends(get_db)):
    if current_user(request, db):
        return redirect("/dashboard")
    return render(request, "index.html")


@app.get("/register")
def register_page(request: Request):
    return render(request, "auth.html", mode="register")


@app.post("/register")
def register(request: Request, name: str = Form(""), email: str = Form(...), password: str = Form(...),
             db: Session = Depends(get_db)):
    email = email.strip().lower()
    if "@" not in email or len(password) < 8:
        flash(request, "Email to'g'ri bo'lishi va parol kamida 8 belgi bo'lishi kerak.", "error")
        return redirect("/register")
    if db.scalar(select(User).where(User.email == email)):
        flash(request, "Bu email bilan ro'yxatdan o'tilgan. Kiring.", "error")
        return redirect("/login")
    user = User(email=email, name=name.strip(), password_hash=hash_password(password))
    db.add(user)
    db.commit()
    request.session.clear()
    request.session["uid"] = user.id
    flash(request, "Xush kelibsiz! Endi Instagram akkauntingizni ulang.")
    return redirect("/dashboard")


@app.get("/login")
def login_page(request: Request):
    return render(request, "auth.html", mode="login")


@app.post("/login")
def login(request: Request, email: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if not user or not verify_password(password, user.password_hash):
        flash(request, "Email yoki parol noto'g'ri.", "error")
        return redirect("/login")
    request.session.clear()
    request.session["uid"] = user.id
    return redirect("/dashboard")


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return redirect("/")


@app.get("/dashboard")
def dashboard(request: Request, user: User = Depends(require_user), db: Session = Depends(get_db)):
    account_ids = [a.id for a in user.accounts]
    since = utcnow() - timedelta(hours=24)
    sent_24h = 0
    if account_ids:
        sent_24h = db.scalar(select(func.count(EventLog.id)).where(
            EventLog.account_id.in_(account_ids), EventLog.kind.in_(SEND_KINDS), EventLog.created_at >= since
        )) or 0
    return render(request, "dashboard.html", user=user, sent_24h=sent_24h, triggers=TRIGGERS, modes=MATCH_MODES, defaults=RULE_DEFAULTS)


# ---------- Instagram ulash ----------

@app.get("/instagram/connect")
def instagram_connect(request: Request, user: User = Depends(require_user)):
    if not settings.ig_ready:
        flash(request, "Server sozlanmagan: IG_APP_ID va IG_APP_SECRET .env faylida yo'q.", "error")
        return redirect("/dashboard")
    state = secrets.token_urlsafe(24)
    request.session["oauth_state"] = state
    return RedirectResponse(ig.authorize_url(state), status_code=302)


@app.get("/instagram/callback")
def instagram_callback(request: Request, code: str | None = None, state: str | None = None,
                       error: str | None = None, error_description: str | None = None,
                       user: User = Depends(require_user), db: Session = Depends(get_db)):
    expected = request.session.pop("oauth_state", None)
    if error or not code:
        flash(request, f"Ulanish bekor qilindi: {error_description or error or 'kod yo‘q'}", "error")
        return redirect("/dashboard")
    if not expected or state != expected:
        flash(request, "Xavfsizlik tekshiruvi o'tmadi (state). Qaytadan urinib ko'ring.", "error")
        return redirect("/dashboard")

    try:
        short = ig.exchange_code(code)
        token, expires_in = ig.get_long_lived_token(short["access_token"])
        me = ig.get_me(token)
        ig.subscribe_webhooks(token)
    except (ig.IGError, KeyError) as e:
        flash(request, f"Instagram xatosi: {e}", "error")
        return redirect("/dashboard")

    ig_user_id = str(me.get("user_id") or short.get("user_id"))
    acc = db.scalar(select(IGAccount).where(IGAccount.ig_user_id == ig_user_id))
    if acc and acc.user_id != user.id:
        flash(request, "Bu Instagram akkaunt boshqa foydalanuvchiga ulangan.", "error")
        return redirect("/dashboard")
    if not acc:
        acc = IGAccount(user_id=user.id, ig_user_id=ig_user_id, access_token_enc="")
        db.add(acc)
    acc.scoped_id = str(me.get("id") or "")
    acc.username = me.get("username") or ""
    acc.name = me.get("name") or ""
    acc.picture_url = me.get("profile_picture_url") or ""
    acc.access_token_enc = encrypt(token)
    acc.token_expires_at = utcnow() + timedelta(seconds=expires_in or 60 * 86400)
    acc.active = True
    db.commit()
    flash(request, f"@{acc.username} muvaffaqiyatli ulandi!")
    return redirect("/dashboard")


@app.post("/accounts/{account_id}/toggle")
def account_toggle(account_id: int, request: Request, user: User = Depends(require_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    acc.active = not acc.active
    db.commit()
    flash(request, f"@{acc.username}: avtojavob {'yoqildi' if acc.active else 'to‘xtatildi'}.")
    return redirect("/dashboard")


@app.post("/accounts/{account_id}/disconnect")
def account_disconnect(account_id: int, request: Request, user: User = Depends(require_user),
                       db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    db.delete(acc)
    db.commit()
    flash(request, "Akkaunt uzildi va uning qoidalari o'chirildi.")
    return redirect("/dashboard")


# ---------- Qoidalar ----------

RULE_DEFAULTS = {"gate_button": DEFAULT_GATE_BUTTON, "follow_button": DEFAULT_FOLLOW_BUTTON,
                 "not_following_text": DEFAULT_NOT_FOLLOWING}

def _media_for(acc: IGAccount) -> list[dict]:
    try:
        return ig.list_media(decrypt(acc.access_token_enc))
    except Exception:  # noqa: BLE001 — post ro'yxati bo'lmasa ham forma ishlayveradi
        return []


class RuleForm:
    """Qoida formasi maydonlari (yaratish va tahrirlash uchun umumiy)."""

    def __init__(self, name: str = Form(""), trigger: str = Form("comment"), keywords: str = Form(""),
                 match_mode: str = Form("contains"), media: str = Form(""), comment_replies: str = Form(""),
                 dm_text: str = Form(""), btn_title: list[str] = Form([]), btn_url: list[str] = Form([]),
                 follow_gate: str = Form(""), gate_button: str = Form(""), reward_text: str = Form(""),
                 not_following_text: str = Form(""), follow_button: str = Form("")):
        self.name, self.trigger, self.keywords, self.match_mode = name, trigger, keywords, match_mode
        self.media, self.comment_replies, self.dm_text = media, comment_replies, dm_text
        self.btn_title, self.btn_url = btn_title, btn_url
        self.follow_gate = follow_gate in ("1", "on", "true")
        self.gate_button, self.reward_text = gate_button.strip(), reward_text.strip()
        self.not_following_text, self.follow_button = not_following_text.strip(), follow_button.strip()


def _apply_form(rule: Rule, f: RuleForm) -> str | None:
    if f.trigger not in TRIGGERS or f.match_mode not in MATCH_MODES:
        return "Noto'g'ri qiymat."
    keywords = ", ".join(k.strip() for k in f.keywords.split(",") if k.strip())
    if f.match_mode != "any" and not keywords:
        return "Kamida bitta kalit so'z kiriting (yoki 'Har qanday matn' rejimini tanlang)."
    if f.trigger == "comment" and not f.comment_replies.strip() and not f.dm_text.strip():
        return "Izoh qoidasi uchun izohga javob yoki Direct matnidan kamida bittasi kerak."
    if f.trigger == "dm" and not f.dm_text.strip():
        return "Direct qoidasi uchun javob matni kerak."
    if len(f.dm_text) > 1000 or any(len(line) > 1000 for line in f.comment_replies.splitlines()):
        return "Matn juda uzun (maks. 1000 belgi)."

    buttons = []
    for title, url in zip(f.btn_title, f.btn_url):
        title, url = title.strip(), url.strip()
        if not title and not url:
            continue
        if not title or not url:
            return "Har bir tugmaga ham nom, ham havola yozing."
        if len(title) > 20:
            return f"Tugma nomi 20 belgidan oshmasin: «{title}»."
        if not url.startswith(("https://", "http://")):
            return f"Havola https:// bilan boshlanishi kerak: {url}"
        buttons.append({"title": title, "url": url})
    if len(buttons) > 3:
        return "Ko'pi bilan 3 ta tugma."

    if f.follow_gate:
        if not f.dm_text.strip():
            return "Obuna tekshiruvi uchun Direct xabar matni kerak."
        if not buttons and not f.reward_text:
            return "Obuna tekshiruvidan keyin nima yuborilsin? Havola tugmasi yoki mukofot matnini kiriting."
        for label, value in (("Tugma", f.gate_button), ("Tugma", f.follow_button)):
            if len(value) > 20:
                return f"{label} nomi 20 belgidan oshmasin: «{value}»."
    if (buttons or f.follow_gate) and (len(f.dm_text) > 640 or len(f.reward_text) > 640
                                        or len(f.not_following_text) > 640):
        return "Tugmali xabar matni 640 belgidan oshmasin."

    media_id, caption = (f.media.split("::", 1) + [""])[:2] if f.media else (None, "")
    rule.name = f.name.strip() or "Qoida"
    rule.trigger = f.trigger
    rule.keywords = keywords
    rule.match_mode = f.match_mode
    rule.media_id = (media_id or None) if f.trigger == "comment" else None
    rule.media_caption = caption[:250] if rule.media_id else ""
    rule.comment_replies = f.comment_replies.strip() if f.trigger == "comment" else ""
    rule.dm_text = f.dm_text.strip()
    rule.buttons = buttons
    rule.follow_gate = f.follow_gate
    rule.gate_button = f.gate_button or DEFAULT_GATE_BUTTON
    rule.reward_text = f.reward_text
    rule.not_following_text = f.not_following_text or DEFAULT_NOT_FOLLOWING
    rule.follow_button = f.follow_button or DEFAULT_FOLLOW_BUTTON
    return None


@app.get("/accounts/{account_id}/rules/new")
def rule_new_page(account_id: int, request: Request, user: User = Depends(require_user),
                  db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    return render(request, "rule_form.html", user=user, account=acc, rule=None, media=_media_for(acc),
                  triggers=TRIGGERS, modes=MATCH_MODES, defaults=RULE_DEFAULTS)


@app.post("/accounts/{account_id}/rules/new")
def rule_create(account_id: int, request: Request, form: RuleForm = Depends(),
                user: User = Depends(require_user), db: Session = Depends(get_db)):
    acc = owned_account(db, user, account_id)
    rule = Rule(account_id=acc.id, name="")
    err = _apply_form(rule, form)
    if err:
        flash(request, err, "error")
        return render(request, "rule_form.html", user=user, account=acc, rule=rule, media=_media_for(acc),
                      triggers=TRIGGERS, modes=MATCH_MODES, defaults=RULE_DEFAULTS)
    db.add(rule)
    db.commit()
    flash(request, f"«{rule.name}» qoidasi yaratildi.")
    return redirect("/dashboard")


@app.get("/rules/{rule_id}/edit")
def rule_edit_page(rule_id: int, request: Request, user: User = Depends(require_user),
                   db: Session = Depends(get_db)):
    rule = owned_rule(db, user, rule_id)
    return render(request, "rule_form.html", user=user, account=rule.account, rule=rule,
                  media=_media_for(rule.account), triggers=TRIGGERS, modes=MATCH_MODES, defaults=RULE_DEFAULTS)


@app.post("/rules/{rule_id}/edit")
def rule_update(rule_id: int, request: Request, form: RuleForm = Depends(),
                user: User = Depends(require_user), db: Session = Depends(get_db)):
    rule = owned_rule(db, user, rule_id)
    err = _apply_form(rule, form)
    if err:
        db.rollback()
        flash(request, err, "error")
        return redirect(f"/rules/{rule_id}/edit")
    db.commit()
    flash(request, "Qoida saqlandi.")
    return redirect("/dashboard")


@app.post("/rules/{rule_id}/toggle")
def rule_toggle(rule_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    rule = owned_rule(db, user, rule_id)
    rule.active = not rule.active
    db.commit()
    return redirect("/dashboard")


@app.post("/rules/{rule_id}/delete")
def rule_delete(rule_id: int, request: Request, user: User = Depends(require_user), db: Session = Depends(get_db)):
    rule = owned_rule(db, user, rule_id)
    db.delete(rule)
    db.commit()
    flash(request, "Qoida o'chirildi.")
    return redirect("/dashboard")


@app.get("/logs")
def logs_page(request: Request, user: User = Depends(require_user), db: Session = Depends(get_db)):
    accounts = {a.id: a for a in user.accounts}
    rows = []
    if accounts:
        rows = db.scalars(select(EventLog).where(EventLog.account_id.in_(accounts.keys()))
                          .order_by(EventLog.id.desc()).limit(200)).all()
    return render(request, "logs.html", user=user, rows=rows, accounts=accounts)


# ---------- Meta webhook ----------

@app.get("/webhook")
def webhook_verify(request: Request):
    p = request.query_params
    if (p.get("hub.mode") == "subscribe" and settings.WEBHOOK_VERIFY_TOKEN
            and p.get("hub.verify_token") == settings.WEBHOOK_VERIFY_TOKEN):
        return PlainTextResponse(p.get("hub.challenge", ""))
    return PlainTextResponse("Forbidden", status_code=403)


def _webhook_summary(payload: dict) -> str:
    """Logga qisqa: qaysi akkauntga qanday hodisa keldi (matnlarsiz)."""
    parts = []
    for entry in payload.get("entry", []) if isinstance(payload, dict) else []:
        kinds = [c.get("field", "?") for c in entry.get("changes", [])]
        for ev in entry.get("messaging", []):
            if "postback" in ev:
                kinds.append(f"postback({(ev['postback'].get('payload') or '')[:20]})")
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


# ---------- Meta talab qiladigan sahifalar ----------

@app.get("/privacy")
def privacy(request: Request):
    return render(request, "legal.html", page="privacy")


@app.get("/terms")
def terms(request: Request):
    return render(request, "legal.html", page="terms")


@app.get("/data-deletion")
def data_deletion_page(request: Request, code: str = ""):
    return render(request, "legal.html", page="deletion", code=code)


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

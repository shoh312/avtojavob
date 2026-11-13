"""Ssenariy dvigateli: webhook hodisasi -> trigger -> bloklar zanjiri.

Instagram qoidalari (kodda hisobga olingan):
  * Izohga javoban faqat 1 ta "private reply" yuborish mumkin. Mijoz tugma bosmaguncha yoki
    yozmaguncha unga yana xabar yuborib bo'lmaydi.
  * Mijoz oxirgi marta yozgan/bosgandan keyin 24 soat ichida xabar yuborish mumkin.
"""

import hashlib
import logging
import random
import re
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import instagram as ig
from .config import settings
from .db import SessionLocal
from .flows import field_key, trigger_of
from .models import (SEND_KINDS, Broadcast, Contact, EventLog, Flow, FlowSession, IGAccount, Message, NodeStat,
                     ProcessedEvent, ScheduledJob, utcnow)
from . import aimanager, catalog, crm, services, tgbot
from .plans import account_owner_active
from .security import decrypt, encrypt

log = logging.getLogger("engine")

_APOSTROPHES = re.compile(r"[‘’ʻʼ`´]")
FLOW_PREFIX = "F:"
MAX_STEPS = 25
SESSION_TTL = timedelta(hours=24)


# ---------------------------------------------------------------- yordamchilar

def normalize(text: str) -> str:
    text = _APOSTROPHES.sub("'", text or "").lower()
    return " ".join(text.split())


def keyword_match(data: dict, text: str) -> bool:
    match = data.get("match") or "contains"
    if match == "any":
        return True
    t = normalize(text)
    keywords = [normalize(k) for k in (data.get("keywords") or "").split(",") if k.strip()]
    if match == "exact":
        return t in keywords
    return any(k and k in t for k in keywords)


def mark_processed(db: Session, key: str) -> bool:
    """True — yangi hodisa; False — avval ishlangan."""
    if len(key) > 64:  # Instagram mid'lari ~200 belgi
        prefix, _, rest = key.partition(":")
        key = f"{prefix}:#{hashlib.sha256(rest.encode()).hexdigest()}"
    db.add(ProcessedEvent(key=key))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False
    except Exception:
        db.rollback()
        raise


def sends_last_hour(db: Session, account_id: int) -> int:
    since = utcnow() - timedelta(hours=1)
    return db.scalar(select(func.count(EventLog.id)).where(
        EventLog.account_id == account_id, EventLog.kind.in_(SEND_KINDS), EventLog.created_at >= since)) or 0


def bump(db: Session, flow_id: int, node_id: str, key: str) -> None:
    stat = db.scalar(select(NodeStat).where(NodeStat.flow_id == flow_id, NodeStat.node_id == node_id,
                                            NodeStat.key == key))
    if stat:
        stat.count += 1
    else:
        db.add(NodeStat(flow_id=flow_id, node_id=node_id, key=key, count=1))
    try:
        db.commit()
    except IntegrityError:  # parallel yozuv — keyingi safar sanaladi
        db.rollback()


def get_contact(db: Session, account: IGAccount, igsid: str, username: str = "") -> Contact:
    contact = db.scalar(select(Contact).where(Contact.account_id == account.id, Contact.igsid == igsid))
    if not contact:
        contact = Contact(account_id=account.id, igsid=igsid, username=username[:120])
        db.add(contact)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            contact = db.scalar(select(Contact).where(Contact.account_id == account.id, Contact.igsid == igsid))
    if username and contact.username != username:
        contact.username = username[:120]
    contact.last_seen_at = utcnow()
    db.commit()
    return contact


def touch_inbound(db: Session, contact: Contact) -> None:
    contact.last_inbound_at = utcnow()
    contact.last_seen_at = utcnow()
    db.commit()


def record_message(db: Session, account_id: int, contact: Contact, direction: str, text: str, source: str) -> None:
    """Jonli chat tarixi."""
    text = (text or "").strip()
    db.add(Message(account_id=account_id, contact_id=contact.id, direction=direction, source=source, text=text[:2000]))
    contact.last_message_at = utcnow()
    contact.last_message_preview = text[:250]
    if direction == "in":
        contact.unread = (contact.unread or 0) + 1
    db.commit()


def log_event(db: Session, account: IGAccount, contact: Contact | None, kind: str, incoming: str = "",
              detail: str = "", flow_id: int | None = None) -> None:
    db.add(EventLog(account_id=account.id, flow_id=flow_id, contact_id=contact.id if contact else None, kind=kind,
                    username=contact.username if contact else "", incoming=incoming[:1000], detail=detail[:1000]))
    db.commit()


def contact_card(contact: Contact, title: str, extra: str = "") -> str:
    lines = [title, ""]
    who = " ".join(x for x in (f"@{contact.username}" if contact.username else "", contact.name) if x)
    lines.append(f"👤 {who or contact.igsid}")
    for k, v in contact.fields.items():
        lines.append(f"• {k}: {v}")
    if contact.tags:
        lines.append("🏷 " + ", ".join(contact.tags))
    if extra:
        lines += ["", extra]
    return "\n".join(lines)


_PHONE = re.compile(r"(?<![\w+])\+?\d[\d\s\-().]{6,18}\d(?!\w)")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def extract_contact_info(text: str) -> dict:
    found = {}
    m = _EMAIL.search(text or "")
    if m:
        found["email"] = m.group(0)[:200]
    for m in _PHONE.finditer(_EMAIL.sub(" ", text or "")):
        digits = re.sub(r"\D", "", m.group(0))
        if 9 <= len(digits) <= 15:
            found["phone"] = m.group(0).strip()[:40]
            break
    return found


def capture_lead(db: Session, account: IGAccount, contact: Contact, text: str) -> bool:
    """Direct'dagi telefon/email: kontaktga saqlash, CRM'ga qo'shish, Telegram'ga xabar."""
    found = {k: v for k, v in extract_contact_info(text).items() if contact.fields.get(k) != v}
    if not found:
        return False
    fields = contact.fields
    fields.update(found)
    contact.fields = fields
    db.commit()
    log_event(db, account, contact, "answer", text, ", ".join(f"{k} = {v}" for k, v in found.items()))
    if not contact.stage:
        crm.set_stage(db, contact, crm.get_stages(account)[0]["id"], "⚡ Direct")
    if account.tg_notify_leads and account.tg_chat_id:
        notify_telegram(db, account, contact_card(contact, "🎯 Lead · Direct"), contact)
    return True


def notify_telegram(db: Session, account: IGAccount, text: str, contact: Contact | None = None,
                    user_id: int | None = None) -> None:
    tgbot.notify(db, account, text, contact, user_id)


def fill(template: str, contact: Contact) -> str:
    values = {"username": f"@{contact.username}" if contact.username else "", "name": contact.name or ""}
    values.update({k: str(v) for k, v in contact.fields.items()})
    return re.sub(r"\{([a-z_][a-z0-9_]*)\}", lambda m: values.get(m.group(1), ""), template or "").strip()


# ---------------------------------------------------------------- graf

class Graph:
    def __init__(self, data: dict):
        self.nodes = {n["id"]: n for n in data.get("nodes", []) if n.get("id")}
        self.edges = data.get("edges", [])

    def next(self, node_id: str, handle: str = "out") -> str | None:
        for e in self.edges:
            if e.get("source") == node_id and (e.get("sourceHandle") or "out") == handle:
                return e.get("target")
        return None


@dataclass
class Ctx:
    db: Session
    account: IGAccount
    contact: Contact
    flow: Flow
    graph: Graph
    token: str
    comment_id: str | None = None   # private reply uchun (bir marta)
    private_used: bool = False
    incoming: str = ""
    sent: list = field(default_factory=list)

    def log(self, kind: str, detail: str = "") -> None:
        self.db.add(EventLog(account_id=self.account.id, flow_id=self.flow.id, contact_id=self.contact.id,
                             kind=kind, username=self.contact.username, incoming=self.incoming[:1000],
                             detail=detail[:1000]))
        self.db.commit()


def make_ctx(db: Session, account: IGAccount, contact: Contact, flow: Flow, **kw) -> Ctx:
    return Ctx(db=db, account=account, contact=contact, flow=flow, graph=Graph(flow.graph),
               token=decrypt(account.access_token_enc), **kw)


def describe(text: str, buttons: list[dict]) -> str:
    return text + ("  " + " ".join(f"[{b['title']}]" for b in buttons) if buttons else "")


def send(ctx: Ctx, message: dict, desc: str) -> bool:
    if sends_last_hour(ctx.db, ctx.account.id) >= settings.HOURLY_SEND_LIMIT:
        ctx.log("skipped", "limit")
        return False
    try:
        if ctx.comment_id and not ctx.private_used:
            ig.private_reply(ctx.token, ctx.comment_id, message)
            ctx.private_used = True
            ctx.log("private_reply", desc)
        elif ctx.contact.can_message():
            ig.send_dm(ctx.token, ctx.contact.igsid, message)
            ctx.log("dm_reply", desc)
        else:
            # Instagram ruxsat bermaydi: mijoz javob bermaguncha kutish kerak
            ctx.log("skipped", "wait_user")
            return False
    except ig.IGError as e:
        ctx.log("error", f"{desc[:200]} → {e}")
        return False
    ctx.sent.append(message)
    record_message(ctx.db, ctx.account.id, ctx.contact, "out", desc, "flow")
    return True


# ---------------------------------------------------------------- bloklar

def build_message(ctx: Ctx, node: dict) -> tuple[dict, str]:
    d = node.get("data") or {}
    text = fill(d.get("text", ""), ctx.contact)
    buttons = []
    for b in (d.get("buttons") or [])[:3]:
        title = (b.get("title") or "").strip()[:20]
        if not title:
            continue
        if b.get("kind") == "url":
            buttons.append(ig.url_button(title, b.get("url") or ""))
        else:
            buttons.append(ig.postback_button(title, f"{FLOW_PREFIX}{ctx.flow.id}:{node['id']}:{b.get('id')}"))
    return ig.build_message(text, buttons), describe(text, buttons)


def check_follows(ctx: Ctx) -> bool:
    try:
        profile = ig.get_user_profile(ctx.token, ctx.contact.igsid)
    except ig.IGError as e:
        ctx.log("error", f"follow_check → {e}")
        return True  # tekshirib bo'lmasa — mijozni to'xtatmaymiz
    if profile.get("username") and not ctx.contact.username:
        ctx.contact.username = profile["username"][:120]
    ctx.contact.follows = bool(profile.get("is_user_follow_business"))
    ctx.db.commit()
    return ctx.contact.follows


def evaluate(ctx: Ctx, d: dict) -> bool:
    check = d.get("check")
    if check == "follows":
        return check_follows(ctx)
    if check == "has_tag":
        return (d.get("tag") or "").strip() in ctx.contact.tags
    if check == "has_field":
        return bool(ctx.contact.fields.get((d.get("field") or "").strip().lower()))
    return False


def apply_action(ctx: Ctx, d: dict) -> None:
    c = ctx.contact
    op = d.get("op")
    if op == "add_tag":
        c.tags = c.tags + [d.get("tag", "")]
    elif op == "remove_tag":
        c.tags = [t for t in c.tags if t != (d.get("tag") or "").strip()]
    elif op == "set_field":
        fields = c.fields
        fields[(d.get("field") or "").strip().lower()] = fill(d.get("value", ""), c)[:500]
        c.fields = fields
    elif op == "notify":
        if ctx.account.tg_chat_id:
            notify_telegram(ctx.db, ctx.account, contact_card(c, f"🔔 {fill(d.get('text', ''), c) or ctx.flow.name}"), c)
        else:
            ctx.log("error", "notify → telegram_not_connected")
    elif op == "set_stage":
        if not crm.set_stage(ctx.db, c, (d.get("stage") or "").strip(), f"⚡ {ctx.flow.name}") and \
                not crm.stage_by_id(ctx.account, d.get("stage")):
            ctx.log("error", "set_stage → unknown_stage")
    elif op == "webhook":
        payload = {"event": "flow_webhook", "flow": {"id": ctx.flow.id, "name": ctx.flow.name},
                   "account": ctx.account.username,
                   "contact": {"id": c.id, "username": c.username, "name": c.name, "tags": c.tags, "fields": c.fields}}
        problem = services.post_webhook((d.get("url") or "").strip(), payload)
        ctx.log("error" if problem else "webhook", f"webhook → {problem}" if problem else d.get("url", ""))
    ctx.db.commit()


def run_from(ctx: Ctx, node_id: str | None) -> None:
    db, g = ctx.db, ctx.graph
    for _ in range(MAX_STEPS):
        if not node_id:
            return
        node = g.nodes.get(node_id)
        if not node:
            return
        ntype, d = node.get("type"), node.get("data") or {}

        if ntype == "trigger":
            node_id = g.next(node_id)
        elif ntype == "message":
            message, desc = build_message(ctx, node)
            if not send(ctx, message, desc):
                return
            bump(db, ctx.flow.id, node_id, "sent")
            if any(b.get("kind") != "url" for b in d.get("buttons") or []):
                return  # tugmali xabar: ssenariy tugma bosilganda davom etadi
            node_id = g.next(node_id)
        elif ntype == "question":
            if not send(ctx, ig.build_message(fill(d.get("text", ""), ctx.contact)), fill(d.get("text", ""), ctx.contact)):
                return
            bump(db, ctx.flow.id, node_id, "sent")
            for s in db.scalars(select(FlowSession).where(FlowSession.contact_id == ctx.contact.id)):
                db.delete(s)
            db.flush()
            db.add(FlowSession(contact_id=ctx.contact.id, flow_id=ctx.flow.id, node_id=node_id,
                               expires_at=utcnow() + SESSION_TTL))
            db.commit()
            return
        elif ntype == "condition":
            ok = evaluate(ctx, d)
            bump(db, ctx.flow.id, node_id, "yes" if ok else "no")
            node_id = g.next(node_id, "yes" if ok else "no")
        elif ntype == "action":
            apply_action(ctx, d)
            bump(db, ctx.flow.id, node_id, "done")
            node_id = g.next(node_id)
        elif ntype == "delay":
            target = g.next(node_id)
            if target:
                minutes = int(d.get("amount") or 1) * (60 if d.get("unit") == "hours" else 1)
                db.add(ScheduledJob(contact_id=ctx.contact.id, flow_id=ctx.flow.id, node_id=target,
                                    run_at=utcnow() + timedelta(minutes=minutes)))
                db.commit()
                bump(db, ctx.flow.id, node_id, "scheduled")
            return
        else:
            return
    ctx.log("error", "loop_limit")


# ---------------------------------------------------------------- triggerlar

def find_flow(db: Session, account: IGAccount, kind: str, text: str, media_id: str | None = None):
    flows = db.scalars(select(Flow).where(Flow.account_id == account.id, Flow.active.is_(True),
                                          Flow.trigger_kind == kind).order_by(Flow.id)).all()
    candidates = []
    for f in flows:
        trig = trigger_of(f.graph)
        if not trig:
            continue
        d = trig.get("data") or {}
        if d.get("media_id") and d.get("media_id") != media_id:
            continue
        if kind == "story_mention" or keyword_match(d, text):
            candidates.append((not d.get("media_id"), d.get("match") == "any", f.id, f, trig))
    if not candidates:
        return None, None
    candidates.sort(key=lambda c: c[:3])  # aniq post > kalit so'z > "har qanday"
    return candidates[0][3], candidates[0][4]


def start_flow(ctx: Ctx, trig: dict) -> None:
    ctx.flow.runs += 1
    ctx.db.commit()
    bump(ctx.db, ctx.flow.id, trig["id"], "runs")
    run_from(ctx, ctx.graph.next(trig["id"]))


def handle_comment(db: Session, account: IGAccount, value: dict) -> None:
    sender = value.get("from") or {}
    sender_id = str(sender.get("id") or "")
    if not sender_id or sender_id == account.ig_user_id:
        return  # o'zimizning izoh/javobimiz
    comment_id = value.get("id")
    if not comment_id:
        return
    text = value.get("text") or ""
    media_id = (value.get("media") or {}).get("id")

    flow, trig = find_flow(db, account, "comment", text, media_id)
    if not flow or not mark_processed(db, f"c:{comment_id}"):
        return
    contact = get_contact(db, account, sender_id, sender.get("username") or "")
    record_message(db, account.id, contact, "in", f"💬 {text}", "comment")
    if contact.bot_paused():
        return
    ctx = make_ctx(db, account, contact, flow, comment_id=comment_id, incoming=text)

    variants = [v.strip() for v in (trig["data"].get("comment_replies") or "").splitlines() if v.strip()]
    if variants:
        reply = fill(random.choice(variants), contact)
        try:
            ig.reply_to_comment(ctx.token, comment_id, reply)
            ctx.log("comment_reply", reply)
        except ig.IGError as e:
            ctx.log("error", f"comment_reply → {e}")
    start_flow(ctx, trig)


def handle_answer(db: Session, account: IGAccount, contact: Contact, session: FlowSession, text: str) -> None:
    flow = db.get(Flow, session.flow_id)
    if not flow or not flow.active:
        db.delete(session)
        db.commit()
        return
    ctx = make_ctx(db, account, contact, flow, incoming=text)
    node = ctx.graph.nodes.get(session.node_id)
    if not node:
        db.delete(session)
        db.commit()
        return
    d = node.get("data") or {}
    value = text.strip()
    validator = d.get("validate") or "any"
    valid = {
        "any": bool(value),
        "phone": 7 <= len(re.sub(r"\D", "", value)) <= 15 and bool(re.fullmatch(r"[\d\s()+\-.]+", value)),
        "email": bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value)),
        "number": bool(re.fullmatch(r"-?\d+([.,]\d+)?", value)),
    }.get(validator, bool(value))

    if not valid:
        session.attempts += 1
        db.commit()
        if session.attempts >= 3:
            db.delete(session)
            db.commit()
            ctx.log("skipped", "answer_attempts")
            return
        err = fill(d.get("error_text") or "", contact)
        if err:
            send(ctx, ig.build_message(err), err)
        return

    key = field_key(d)
    fields = contact.fields
    fields[key] = value[:500]
    contact.fields = fields
    if key == "name" and not contact.name:
        contact.name = value[:255]
    db.delete(session)
    db.commit()
    bump(db, flow.id, node["id"], "answered")
    ctx.log("answer", f"{key} = {value[:100]}")
    # Telefon yoki email qoldirgan mijoz — avtomatik CRM'ning birinchi bosqichiga
    if key in ("phone", "email") and not contact.stage:
        crm.set_stage(db, contact, crm.get_stages(account)[0]["id"], f"⚡ {flow.name}")
    if account.tg_notify_leads and account.tg_chat_id:
        notify_telegram(db, account, contact_card(contact, f"🎯 {flow.name}"), contact)
    run_from(ctx, ctx.graph.next(node["id"]))


def handle_postback(db: Session, account: IGAccount, contact: Contact, payload: str, title: str, mid: str) -> None:
    if payload.startswith(catalog.ORDER_PREFIX):
        pid = payload[len(catalog.ORDER_PREFIX):]
        if pid.isdigit() and mark_processed(db, f"p:{mid}"):
            handle_order(db, account, contact, int(pid))
        return
    if not payload.startswith(FLOW_PREFIX):
        log.info("postback: begona payload %r", payload[:40])
        return
    try:
        flow_id_s, node_id, btn_id = payload[len(FLOW_PREFIX):].split(":", 2)
        flow_id = int(flow_id_s)
    except ValueError:
        return
    flow = db.get(Flow, flow_id)
    if not flow or flow.account_id != account.id or not flow.active:
        log.info("postback: ssenariy #%s topilmadi yoki o'chirilgan", flow_id)
        return
    if not mark_processed(db, f"p:{mid}"):
        return
    # Tugma bosilsa — kutilayotgan savol bekor qilinadi
    for s in db.scalars(select(FlowSession).where(FlowSession.contact_id == contact.id)):
        db.delete(s)
    db.commit()
    ctx = make_ctx(db, account, contact, flow, incoming=f"[{title or 'button'}]")
    bump(db, flow.id, node_id, f"clicked:{btn_id}")
    ctx.log("click", title or "")
    run_from(ctx, ctx.graph.next(node_id, f"btn:{btn_id}"))


def ensure_profile(db: Session, account: IGAccount, contact: Contact) -> None:
    if contact.profile_checked:
        return
    contact.profile_checked = True
    try:
        profile = ig.get_user_profile(decrypt(account.access_token_enc), contact.igsid)
        contact.username = (profile.get("username") or contact.username or "")[:120]
        if profile.get("is_user_follow_business") is not None:
            contact.follows = bool(profile.get("is_user_follow_business"))
    except Exception as e:  # noqa: BLE001
        log.info("profile @%s: %s", contact.igsid, e)
    db.commit()


def handle_messaging(db: Session, account: IGAccount, event: dict) -> None:
    sender_id = str((event.get("sender") or {}).get("id") or "")
    if not sender_id or sender_id == account.ig_user_id:
        return
    message = event.get("message") or {}
    postback = event.get("postback")
    if not postback and (not message or message.get("is_echo") or message.get("is_deleted")):
        return

    mid = (postback or {}).get("mid") or message.get("mid") or f"{sender_id}:{event.get('timestamp')}"
    if not mark_processed(db, f"in:{mid}"):
        return  # Meta webhook'ni qayta yubordi

    contact = get_contact(db, account, sender_id)
    touch_inbound(db, contact)

    text = message.get("text") or ""
    attachments = message.get("attachments") or []
    qr = (message.get("quick_reply") or {}).get("payload")
    if postback:
        record_message(db, account.id, contact, "in", f"[{postback.get('title') or 'button'}]", "button")
    elif qr:
        record_message(db, account.id, contact, "in", f"[{text or 'button'}]", "button")
    elif any(a.get("type") == "story_mention" for a in attachments):
        record_message(db, account.id, contact, "in", "@ story mention", "story")
    elif (message.get("reply_to") or {}).get("story"):
        record_message(db, account.id, contact, "in", f"↩ story: {text}", "story")
    else:
        record_message(db, account.id, contact, "in", text or "[media]", "user")

    if account.tg_notify_all and account.tg_chat_id and not postback and not qr:
        who = f"@{contact.username}" if contact.username else (contact.name or contact.igsid)
        notify_telegram(db, account, f"{tgbot.t(account, 'new_msg')} · {who}\n\n{text or '[media]'}", contact)

    if contact.bot_paused():
        if text and not postback and not qr:
            capture_lead(db, account, contact, text)
        return  # operator suhbatni o'z qo'liga olgan

    if postback:
        handle_postback(db, account, contact, postback.get("payload") or "", postback.get("title") or "", mid)
        return
    if qr:
        handle_postback(db, account, contact, qr, text, mid)
        return
    ensure_profile(db, account, contact)

    if any(a.get("type") == "story_mention" for a in attachments):
        kind = "story_mention"
    elif (message.get("reply_to") or {}).get("story"):
        kind = "story_reply"
    else:
        kind = "dm"

    if kind == "dm" and text and not db.scalar(select(FlowSession).where(FlowSession.contact_id == contact.id)):
        capture_lead(db, account, contact, text)

    if kind == "dm":
        session = db.scalar(select(FlowSession).where(FlowSession.contact_id == contact.id))
        if session:
            if session.expires_at > utcnow():
                if mark_processed(db, f"m:{mid}"):
                    handle_answer(db, account, contact, session, text)
                return
            db.delete(session)
            db.commit()
        if not text:
            return

    flow, trig = find_flow(db, account, kind, text)
    if not flow:
        # Hech bir ssenariy mos kelmadi: AI yordamchi yoki operatorga xabarnoma
        if kind == "dm" and text and mark_processed(db, f"m:{mid}"):
            if aimanager.reply(db, account, contact, text):
                return
            if not (account.ai_enabled and ai_answer(db, account, contact, text)):
                if account.tg_notify_inbox and account.tg_chat_id and not account.tg_notify_all:
                    notify_telegram(db, account, contact_card(contact, "💬 Direct", f"“{text[:500]}”"), contact)
        return
    if not mark_processed(db, f"m:{mid}"):
        return
    ctx = make_ctx(db, account, contact, flow, incoming=text or f"[{kind}]")
    start_flow(ctx, trig)


def ai_answer(db: Session, account: IGAccount, contact: Contact, text: str) -> bool:
    if not services.ai_available(db):
        return False
    if sends_last_hour(db, account.id) >= settings.HOURLY_SEND_LIMIT:
        log_event(db, account, contact, "skipped", text, "limit")
        return False
    rows = db.scalars(select(Message).where(Message.contact_id == contact.id, Message.source != "comment")
                      .order_by(Message.id.desc()).limit(12)).all()
    history = [{"role": "user" if m.direction == "in" else "assistant", "content": m.text or "…"} for m in reversed(rows)]
    leads = "off" if not account.ai_collect_leads else ("done" if contact.fields.get("phone") else "ask")
    products = catalog.active_products(db, account.id)
    answer = services.ai_reply(db, account.ai_prompt, history, leads, catalog.catalog_text(products))
    if not answer:
        log_event(db, account, contact, "skipped", text, "ai_no_answer")
        return False
    answer, ids = catalog.split_tags(answer)
    chosen = [p for pid in ids for p in products if p.id == pid]
    token = decrypt(account.access_token_enc)
    try:
        if answer:
            ig.send_dm(token, contact.igsid, {"text": answer})
        if chosen:
            ig.send_dm(token, contact.igsid, catalog.product_cards(account, chosen))
    except ig.IGError as e:
        log_event(db, account, contact, "error", text, f"ai_reply → {e}")
        return False
    cards = ("  🛍 " + ", ".join(p.name for p in chosen)) if chosen else ""
    log_event(db, account, contact, "ai_reply", text, answer + cards)
    record_message(db, account.id, contact, "out", (answer + cards).strip(), "ai")
    return True


def handle_order(db: Session, account: IGAccount, contact: Contact, product_id: int) -> None:
    """Mahsulot kartochkasidagi '🛒 Buyurtma berish' tugmasi."""
    from .models import Product
    p = db.get(Product, product_id)
    if not p or p.account_id != account.id:
        return
    fields = contact.fields
    fields["product"] = p.name[:200]
    contact.fields = fields
    db.commit()
    crm.add_note(db, contact, f"🛒 {p.name}" + (f" — {p.price}" if p.price else ""), "⚡ Instagram")
    if not contact.stage:
        crm.set_stage(db, contact, crm.get_stages(account)[0]["id"], "⚡ Instagram")
    has_phone = bool(contact.fields.get("phone"))
    reply = catalog.t(account, "thanks" if has_phone else "ask_phone", p=p.name)
    try:
        ig.send_dm(decrypt(account.access_token_enc), contact.igsid, {"text": reply})
        record_message(db, account.id, contact, "out", reply, "ai")
    except ig.IGError as e:
        log_event(db, account, contact, "error", p.name, f"order → {e}")
    log_event(db, account, contact, "click", f"[🛒 {p.name}]", p.name)
    if account.tg_chat_id:
        notify_telegram(db, account, contact_card(contact, f"🛒 {p.name}" + (f" — {p.price}" if p.price else "")), contact)


def run_broadcast(broadcast_id: int) -> None:
    """Rassilka: 24 soat ichida yozgan kontaktlarga (teg bo'yicha) xabar yuborish."""
    import json as _json
    import time

    db = SessionLocal()
    try:
        b = db.get(Broadcast, broadcast_id)
        if not b:
            return
        account = db.get(IGAccount, b.account_id)
        token = decrypt(account.access_token_enc)
        buttons = [ig.url_button(x["title"], x["url"]) for x in _json.loads(b.buttons_json or "[]")]
        message = ig.build_message(b.text, buttons)
        for contact in broadcast_audience(db, account.id, b.tag):
            if sends_last_hour(db, account.id) >= settings.HOURLY_SEND_LIMIT:
                b.status = "limited"
                break
            text = fill(b.text, contact)
            try:
                ig.send_dm(token, contact.igsid, ig.build_message(text, buttons) if "{" in b.text else message)
                b.sent += 1
                log_event(db, account, contact, "broadcast", "", text[:200])
                record_message(db, account.id, contact, "out", text, "broadcast")
            except ig.IGError as e:
                b.failed += 1
                log.info("broadcast %s → %s: %s", b.id, contact.igsid, e)
            db.commit()
            time.sleep(0.3)
        else:
            b.status = "done"
        b.finished_at = utcnow()
        db.commit()
    except Exception:
        log.exception("broadcast failed")
        db.rollback()
        b = db.get(Broadcast, broadcast_id)
        if b:
            b.status = "interrupted"
            b.finished_at = utcnow()
            db.commit()
    finally:
        db.close()


def broadcast_audience(db: Session, account_id: int, tag: str = "") -> list[Contact]:
    since = utcnow() - timedelta(hours=23, minutes=30)
    rows = db.scalars(select(Contact).where(Contact.account_id == account_id, Contact.last_inbound_at >= since)).all()
    return [c for c in rows if not tag or tag in c.tags]


def process_payload(payload: dict) -> None:
    if payload.get("object") != "instagram":
        return
    db = SessionLocal()
    try:
        for entry in payload.get("entry", []):
            account = db.scalar(select(IGAccount).where(IGAccount.ig_user_id == str(entry.get("id"))))
            if not account or not account_owner_active(account):
                continue
            for change in entry.get("changes", []):
                if change.get("field") == "comments":
                    try:
                        handle_comment(db, account, change.get("value") or {})
                    except Exception:
                        db.rollback()
                        log.exception("comment handling failed")
            for event in entry.get("messaging", []):
                try:
                    handle_messaging(db, account, event)
                except Exception:
                    db.rollback()
                    log.exception("message handling failed")
    finally:
        db.close()


# ---------------------------------------------------------------- fon vazifalari

def run_due_jobs() -> int:
    """Kutish bloklari: vaqti kelgan qadamlarni bajarish."""
    db = SessionLocal()
    done = 0
    try:
        jobs = db.scalars(select(ScheduledJob).where(ScheduledJob.run_at <= utcnow())
                          .order_by(ScheduledJob.run_at).limit(100)).all()
        for job in jobs:
            flow, contact = db.get(Flow, job.flow_id), db.get(Contact, job.contact_id)
            node_id = job.node_id
            db.delete(job)
            db.commit()
            if not flow or not contact or not flow.active or not account_owner_active(flow.account):
                continue
            try:
                run_from(make_ctx(db, flow.account, contact, flow, incoming="[delay]"), node_id)
                done += 1
            except Exception:
                db.rollback()
                log.exception("scheduled job failed")
        return done
    finally:
        db.close()


def resubscribe_all() -> None:
    """Yangi webhook maydonlari eski ulangan akkauntlarga ham yoqilsin."""
    db = SessionLocal()
    try:
        for acc in db.scalars(select(IGAccount)).all():
            try:
                token = decrypt(acc.access_token_enc)
                ig.subscribe_webhooks(token)
                me = ig.get_me(token)
                acc.username = me.get("username") or acc.username
                acc.name = me.get("name") or acc.name
                acc.picture_url = me.get("profile_picture_url") or acc.picture_url
                acc.followers = int(me.get("followers_count") or acc.followers or 0)
                db.commit()
                log.info("resubscribe @%s: ok", acc.username)
            except Exception as e:  # noqa: BLE001
                log.warning("resubscribe @%s: %s", acc.username, e)
    finally:
        db.close()


def refresh_expiring_tokens() -> None:
    """Long-lived token 60 kun yashaydi; 10 kun qolganda yangilaymiz."""
    db = SessionLocal()
    try:
        soon = utcnow() + timedelta(days=10)
        for acc in db.scalars(select(IGAccount).where(IGAccount.token_expires_at < soon)).all():
            try:
                token, expires_in = ig.refresh_token(decrypt(acc.access_token_enc))
                acc.access_token_enc = encrypt(token)
                acc.token_expires_at = utcnow() + timedelta(seconds=expires_in or 60 * 86400)
                db.commit()
            except Exception as e:  # noqa: BLE001
                db.rollback()
                db.add(EventLog(account_id=acc.id, kind="error", detail=f"token_refresh → {e}"[:1000]))
                db.commit()
        db.query(ProcessedEvent).filter(ProcessedEvent.created_at < utcnow() - timedelta(days=14)).delete()
        db.query(FlowSession).filter(FlowSession.expires_at < utcnow()).delete()
        db.commit()
    finally:
        db.close()


def run_due_reminders() -> int:
    """CRM eslatmalari: vaqti kelgan izohlarni Telegram'ga yuborish."""
    from .models import Note
    db = SessionLocal()
    sent = 0
    try:
        notes = db.scalars(select(Note).where(Note.remind_at <= utcnow(), Note.reminded.is_(False)).limit(100)).all()
        for n in notes:
            n.reminded = True
            db.commit()
            contact = db.get(Contact, n.contact_id)
            if contact and contact.account.tg_bot_token_enc:
                notify_telegram(db, contact.account, contact_card(contact, f"{tgbot.t(contact.account, 'reminder')}: {n.text}"),
                                contact, user_id=n.created_by)
                sent += 1
        return sent
    finally:
        db.close()

"""AI sotuvchi: Direct'dagi yagona AI (avvalgi "AI yordamchi" + "AI menejer" birlashgan).

Sozlamalar Instagram akkauntida (Integratsiyalar → AI sotuvchi):
  ai_enabled, ai_name, ai_prompt (biznes haqida + ko'rsatmalar),
  ai_collect_leads (ism/telefon/email yig'ish), ai_crm (bosqich + izoh), ai_handoff (odamga topshirish),
  ai_followup_hours (jim qolgan mijozga bir martalik eslatma; 0 — o'chiq).

Har bir kiruvchi xabarga AI JSON qaytaradi:
  {"reply": "...", "stage": "<id>"|null, "note": "..."|null, "handoff": bool, "fields": {"name","phone","email"}}
"""

import json
import logging
import re
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import catalog, crm, services
from . import instagram as ig
from .models import Contact, IGAccount, Message, User, utcnow
from .security import decrypt

log = logging.getLogger("aisales")

HANDOFF_PAUSE = timedelta(hours=12)  # odamga topshirilgach AI shu muddat jim turadi


@dataclass
class Cfg:
    name: str
    prompt: str
    leads: bool
    crm: bool
    handoff: bool


def cfg_of(account: IGAccount, overrides: dict | None = None) -> Cfg:
    o = overrides or {}

    def pick(key, attr):
        return o[key] if o.get(key) is not None else getattr(account, attr)
    return Cfg(name=str(pick("name", "ai_name") or "").strip(), prompt=str(pick("prompt", "ai_prompt") or ""),
               leads=bool(pick("collect_leads", "ai_collect_leads")), crm=bool(pick("crm", "ai_crm")),
               handoff=bool(pick("handoff", "ai_handoff")))


def _system(cfg: Cfg, account: IGAccount, products: list, followup: bool, current: str, known: str) -> str:
    cat = catalog.catalog_text(products)
    task = ("The customer has NOT replied for a while. Write ONE short, friendly follow-up message that brings them back "
            "to the conversation (no pressure, no repeating everything)." if followup
            else "Reply to the customer's last message.")
    who = f"You are {cfg.name}, " if cfg.name else "You are "
    rules = [
        "Reply in the language of the customer's LAST message (Uzbek, Russian, Tajik, English...), even if the "
        "business information is written in another language. Short, warm, human: plain text, no markdown, 1-4 sentences.",
        "Use ONLY facts from the business information and catalog. Never invent prices, discounts, addresses, "
        "schedules or promises. If something is not written there, say a colleague will clarify.",
        "If the customer asks the price (or wants to buy) without naming the product and there are several, briefly "
        "list them and ask which one interests them — don't send all prices at once.",
        "When you mention specific products, add their tags at the very end of the reply, e.g. [[product:12]] (max 3); "
        "the customer automatically gets a card with photo, price and an Order button.",
        "Greet only at the start of the conversation. Never ask for card numbers, passwords or codes.",
    ]
    if cfg.leads:
        rules += [
            "When the product is clear: give its price and one short benefit, then in ONE sentence ask for the contact "
            "details you don't have yet: name, phone number and email. Ask once; don't insist.",
            "When the customer sends contact details, put them into \"fields\".",
        ]
    if cfg.handoff:
        rules.append("Set \"handoff\": true when you have the phone number and the customer wants to buy/sign up, when "
                     "they ask for a human, complain, or ask something you can't answer. Then thank them and say a "
                     "colleague will contact them shortly.")
    out = f"""{who}the sales assistant of this business in Instagram Direct.
Your job: help the customer, answer questions, recommend products and move them towards a purchase.

{task}

Rules:
""" + "\n".join(f"- {r}" for r in rules)
    if cfg.crm:
        stages = [s for s in crm.get_stages(account) if s["type"] != "won"]
        out += "\n\nCRM stages you may set (use the id, or null to keep the current one; never mark as sold — a human " \
               "does that):\n" + "\n".join(f'- "{s["id"]}": {s["name"]} ({s["type"]})' for s in stages)
        out += f"\nCurrent stage: {current}\nAdd a short CRM note (in the business owner's language) only when " \
               "something important happens (interest in a product, contacts received, objection)."
    out += f"\n\nBusiness information and instructions (written by the owner):\n{cfg.prompt.strip() or '(none)'}"
    if cat:
        out += "\n\nProduct catalog:\n" + cat
    out += f"\n\nKnown customer details: {known}"
    out += '\n\nReturn ONLY JSON: {"reply": "...", "stage": null, "note": null, "handoff": false, ' \
           '"fields": {"name": null, "phone": null, "email": null}}'
    return out


def _history(db: Session, contact: Contact) -> list[dict]:
    rows = db.scalars(select(Message).where(Message.contact_id == contact.id, Message.source != "comment")
                      .order_by(Message.id.desc()).limit(16)).all()
    return [{"role": "user" if m.direction == "in" else "assistant", "content": m.text or "…"} for m in reversed(rows)]


def _known(contact: Contact | None) -> str:
    if contact is None:
        return "none"
    f = contact.fields
    pairs = (("name", contact.name or f.get("name")), ("phone", f.get("phone")), ("email", f.get("email")))
    return ", ".join(f"{k}: {v}" for k, v in pairs if v) or "none"


def _ask(db: Session, cfg: Cfg, account: IGAccount, contact: Contact | None, followup: bool,
         history: list[dict] | None = None, stage_id: str | None = None, hint: str | None = None) -> dict | None:
    products = catalog.active_products(db, account.id)
    current = crm.stage_by_id(account, contact.stage if contact is not None else stage_id)
    system = _system(cfg, account, products, followup, current["name"] if current else "none", _known(contact))
    history = list(history) if history is not None else _history(db, contact)
    if hint:
        history.append({"role": "user", "content": hint})
    system += services.language_hint(history)
    if followup:
        history.append({"role": "user", "content": "[The customer has been silent. Write the follow-up now.]"})
    text, error = services.ai_chat_json(db, system, history)
    if not text:
        log.warning("AI: %s", error)
        return None
    try:
        raw = text.strip()
        data = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
    except (ValueError, TypeError):
        # JSON o'rniga oddiy matn qaytgan bo'lsa ham javob beramiz
        return {"reply": text.strip()[:950]} if text.strip() and "{" not in text else None
    return data if isinstance(data, dict) else None


def clean_fields(raw) -> dict:
    """AI qaytargan ism/telefon/email — tekshirilgan holda."""
    out = {}
    if not isinstance(raw, dict):
        return out
    name = str(raw.get("name") or "").strip()
    if name and name.lower() not in ("null", "none") and len(name) <= 80:
        out["name"] = name
    phone = str(raw.get("phone") or "").strip()
    if len(re.sub(r"\D", "", phone)) >= 7:
        out["phone"] = phone[:40]
    email = str(raw.get("email") or "").strip()
    if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        out["email"] = email[:120].lower()
    return out


def save_fields(db: Session, contact: Contact, raw) -> dict:
    found = clean_fields(raw)
    new = {}
    if found.get("name") and not contact.name:
        contact.name = found["name"]
    fields = contact.fields
    for k in ("name", "phone", "email"):
        if found.get(k) and not fields.get(k):
            fields[k] = new[k] = found[k]
    if new:
        contact.fields = fields
        db.commit()
    return new


def _author(cfg: Cfg) -> str:
    return f"🤖 {cfg.name or 'AI'}"


def _apply(db: Session, cfg: Cfg, account: IGAccount, contact: Contact, data: dict, incoming: str,
           allow_handoff: bool = True) -> bool:
    from .engine import contact_card, contact_lang, log_event, notify_telegram, record_message  # sikl importdan qochish

    reply, ids = catalog.split_tags(str(data.get("reply") or ""))
    products = catalog.active_products(db, account.id)
    chosen = [p for pid in ids for p in products if p.id == pid]
    if not reply and not chosen:
        return False
    token = decrypt(account.access_token_enc)
    try:
        if reply:
            ig.send_dm(token, contact.igsid, {"text": reply[:1000]})
        if chosen:
            ig.send_dm(token, contact.igsid, catalog.product_cards(account, chosen, contact_lang(db, contact)))
    except ig.IGError as e:
        log_event(db, account, contact, "error", incoming, f"ai → {e}")
        return False
    cards = ("  🛍 " + ", ".join(p.name for p in chosen)) if chosen else ""
    log_event(db, account, contact, "ai_reply", incoming, reply + cards)
    record_message(db, account.id, contact, "out", (reply + cards).strip(), "ai")

    if cfg.leads:
        new = save_fields(db, contact, data.get("fields"))
        if new:
            log_event(db, account, contact, "answer", incoming, ", ".join(f"{k} = {v}" for k, v in new.items()))
            if not contact.stage:
                crm.set_stage(db, contact, crm.get_stages(account)[0]["id"], _author(cfg))
            if account.tg_notify_leads and account.tg_chat_id and new.get("phone"):
                notify_telegram(db, account, contact_card(contact, f"🎯 Lead · {_author(cfg)}"), contact)
    if cfg.crm:
        stage = data.get("stage")
        target = crm.stage_by_id(account, stage) if isinstance(stage, str) else None
        if target and target["type"] != "won" and stage != contact.stage:
            crm.set_stage(db, contact, stage, _author(cfg))
        note = str(data.get("note") or "").strip()
        if note and note.lower() != "null":
            crm.add_note(db, contact, note[:500], _author(cfg))
    if cfg.handoff and allow_handoff and data.get("handoff") is True:
        handoff(db, cfg, account, contact, str(data.get("note") or "").strip() or reply)
    return True


def handoff(db: Session, cfg: Cfg, account: IGAccount, contact: Contact, reason: str) -> None:
    """Mijozni odamga topshirish: mas'ul belgilanadi, Telegram'ga xabar, AI bu suhbatda vaqtincha jim."""
    from .engine import contact_card, notify_telegram

    owner = account.user
    target = None
    if contact.assigned_to:
        target = db.get(User, contact.assigned_to)
        if target and (target.is_ai or target.is_blocked):
            target = None
    if target is None:
        humans = [m for m in crm.team_members(db, owner.id) if not m.is_ai]
        if humans:
            load = dict(db.execute(select(Contact.assigned_to, func.count(Contact.id)).where(
                Contact.account_id == account.id, Contact.assigned_to.in_([h.id for h in humans]))
                .group_by(Contact.assigned_to)).all())
            target = min(humans, key=lambda h: (load.get(h.id, 0), h.id))
        else:
            target = owner
        crm.assign(db, contact, target, f"{_author(cfg)} → 🤝")
    until = utcnow() + HANDOFF_PAUSE
    if not contact.bot_paused_until or contact.bot_paused_until < until:
        contact.bot_paused_until = until
    contact.ai_followup_at = utcnow()  # topshirilgan mijozga eslatma yuborilmaydi
    db.commit()
    notify_telegram(db, account, contact_card(contact, f"🤝 {cfg.name or 'AI'}: {reason[:300]}"), contact, target.id)


def reply(db: Session, account: IGAccount, contact: Contact, text: str, hint: str | None = None) -> bool:
    """Kiruvchi xabarga AI sotuvchi javobi. True — javob yuborildi."""
    from .engine import log_event, sends_last_hour
    from .config import settings

    if not account.ai_enabled or not services.ai_available(db):
        return False
    if sends_last_hour(db, account.id) >= settings.HOURLY_SEND_LIMIT:
        log_event(db, account, contact, "skipped", text, "limit")
        return False
    cfg = cfg_of(account)
    data = _ask(db, cfg, account, contact, followup=False, hint=hint)
    if not data:
        log_event(db, account, contact, "skipped", text, "ai_no_answer")
        return False
    contact.ai_followup_at = None
    db.commit()
    return _apply(db, cfg, account, contact, data, text)


def simulate(db: Session, account: IGAccount, history: list[dict], stage_id: str | None,
             overrides: dict | None = None) -> dict | None:
    """Sinov chati: AI nima qilishini qaytaradi, lekin hech narsa yubormaydi va saqlamaydi."""
    cfg = cfg_of(account, overrides)
    data = _ask(db, cfg, account, None, False, history=history, stage_id=stage_id)
    if not data:
        return None
    reply_text, ids = catalog.split_tags(str(data.get("reply") or ""))
    products = catalog.active_products(db, account.id)
    target = None
    note = ""
    if cfg.crm:
        stage = data.get("stage")
        target = crm.stage_by_id(account, stage) if isinstance(stage, str) else None
        if target and (target["type"] == "won" or target["id"] == stage_id):
            target = None
        note = str(data.get("note") or "").strip()
        if note.lower() == "null":
            note = ""
    return {"reply": reply_text, "products": [p for pid in ids for p in products if p.id == pid],
            "stage": target["id"] if target else None, "stage_name": target["name"] if target else "",
            "note": note[:500], "handoff": cfg.handoff and data.get("handoff") is True,
            "fields": clean_fields(data.get("fields")) if cfg.leads else {}}


def run_followups() -> int:
    """Jim qolgan mijozlarga bir martalik eslatma (AI oxirgi yozgan bo'lsa, 24 soat oynasi ichida)."""
    from .db import SessionLocal
    from .plans import account_owner_active

    db = SessionLocal()
    sent = 0
    try:
        now = utcnow()
        accounts = db.scalars(select(IGAccount).where(IGAccount.ai_enabled.is_(True), IGAccount.active.is_(True),
                                                      IGAccount.ai_followup_hours > 0)).all()
        for account in accounts:
            if not account_owner_active(account):
                continue
            cfg = cfg_of(account)
            contacts = db.scalars(select(Contact).where(
                Contact.account_id == account.id, Contact.ai_followup_at.is_(None),
                Contact.last_inbound_at.is_not(None), Contact.last_inbound_at > now - timedelta(hours=22),
                Contact.last_message_at < now - timedelta(hours=account.ai_followup_hours))).all()
            for c in contacts:
                last = db.scalar(select(Message).where(Message.contact_id == c.id).order_by(Message.id.desc()).limit(1))
                if not last or last.direction != "out" or last.source != "ai" or c.bot_paused():
                    continue
                if not services.ai_available(db):
                    return sent
                c.ai_followup_at = now  # bir marta
                db.commit()
                data = _ask(db, cfg, account, c, followup=True)
                if data and _apply(db, cfg, account, c, data, "[follow-up]", allow_handoff=False):
                    sent += 1
        return sent
    finally:
        db.close()


def migrate_ai_managers(db: Session) -> int:
    """Eski "AI menejer" (virtual jamoa a'zosi) sozlamalarini akkauntning AI sotuvchisiga ko'chirish."""
    moved = 0
    for m in db.scalars(select(User).where(User.is_ai.is_(True), User.is_blocked.is_(False))).all():
        for acc in db.scalars(select(IGAccount).where(IGAccount.user_id == m.owner_id)).all():
            if not acc.ai_name and m.name:
                acc.ai_name = m.name[:80]
            extra = (m.ai_instructions or "").strip()
            if extra and extra not in (acc.ai_prompt or ""):
                acc.ai_prompt = f"{(acc.ai_prompt or '').strip()}\n\n{extra}".strip()[:8000]
            if not acc.ai_followup_hours and m.ai_followup_hours:
                acc.ai_followup_hours = m.ai_followup_hours
            if m.ai_take_all:
                acc.ai_enabled = True
        for c in db.scalars(select(Contact).where(Contact.assigned_to == m.id)).all():
            c.assigned_to = None
        m.is_blocked = True
        moved += 1
    db.commit()
    return moved

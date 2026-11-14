"""AI menejer: o'ziga biriktirilgan lidlar bilan ishlaydigan virtual sotuv menejeri.

Har bir kiruvchi xabarga AI JSON qaytaradi:
  {"reply": "...", "stage": "<bosqich id>"|null, "note": "..."|null, "handoff": true|false}
- reply   — mijozga javob ([[product:ID]] teglari mahsulot kartochkasiga aylanadi)
- stage   — CRM bosqichini o'zgartirish (faqat "open"/"lost" turidagi bosqichlar; "sotildi"ni odam belgilaydi)
- note    — CRM uchun qisqa izoh
- handoff — mijoz sotib olishga tayyor / odam so'radi -> odam menejerga topshirish
Jim qolgan mijozga belgilangan soatdan keyin bir marta follow-up yuboriladi (24 soat oynasi ichida).
"""

import json
import logging
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import catalog, crm, services
from . import instagram as ig
from .models import Contact, IGAccount, Message, User, utcnow
from .security import decrypt

log = logging.getLogger("aimanager")

LANG_NAMES = {"uz": "Uzbek", "ru": "Russian", "tj": "Tajik", "en": "English"}


def is_ai_manager(user: User | None) -> bool:
    return bool(user and user.is_ai and not user.is_blocked)


def get_ai_manager(db: Session, owner_id: int) -> User | None:
    return db.scalar(select(User).where(User.owner_id == owner_id, User.is_ai.is_(True)))


def _system(manager: User, account: IGAccount, products: list, followup: bool = False) -> str:
    stages = crm.get_stages(account)
    movable = [s for s in stages if s["type"] != "won"]
    stage_list = "\n".join(f'- "{s["id"]}": {s["name"]} ({s["type"]})' for s in movable)
    cat = catalog.catalog_text(products)
    task = ("The customer has NOT replied for a while. Write ONE short, friendly follow-up message that brings them back "
            "to the conversation (no pressure, no repeating everything). Keep stage null unless clearly needed."
            if followup else "Reply to the customer's last message.")
    return f"""You are {manager.name or "the sales manager"}, a sales manager of this business working in Instagram Direct.
Your job: help the customer, answer questions, recommend products, collect their phone number, and move the deal forward.

{task}

Rules:
- Reply in the language of the customer's LAST message (Uzbek, Russian, Tajik, English...), even if the business \
information is written in another language. Short, warm, human: plain text, no markdown, 1-4 sentences.
- Never guess facts that are not written in the business information (address, schedule, discounts) — say you will \
check with a colleague and set handoff to true.
- Use ONLY facts from the business information and catalog. Never invent prices or promises.
- Ask for the phone number once when the customer is interested; don't repeat if already given or refused.
- When you mention specific products, add their tags at the end of reply, e.g. [[product:12]] (max 3).
- Greet only at the start of the conversation.

CRM stages you may set (use the id, or null to keep the current one; never mark as sold — a human does that):
{stage_list}
Current stage: {{current}}

Set "handoff": true when the customer is ready to pay/order, asks for a human, complains, or asks something you can't answer.

Owner's instructions for you:
{(manager.ai_instructions or "").strip() or "(none)"}

Business information:
{(account.ai_prompt or "").strip() or "(none)"}
{("Product catalog:" + chr(10) + cat) if cat else ""}

Return ONLY JSON: {{"reply": "...", "stage": "<id or null>", "note": "<short note for CRM or null>", "handoff": false}}"""


def _history(db: Session, contact: Contact) -> list[dict]:
    rows = db.scalars(select(Message).where(Message.contact_id == contact.id, Message.source != "comment")
                      .order_by(Message.id.desc()).limit(16)).all()
    return [{"role": "user" if m.direction == "in" else "assistant", "content": m.text or "…"} for m in reversed(rows)]


def _ask(db: Session, manager: User, account: IGAccount, contact: Contact | None, followup: bool,
         history: list[dict] | None = None, stage_id: str | None = None) -> dict | None:
    products = catalog.active_products(db, account.id)
    current = crm.stage_by_id(account, contact.stage if contact is not None else stage_id)
    system = _system(manager, account, products, followup).replace("{current}", current["name"] if current else "none")
    history = list(history) if history is not None else _history(db, contact)
    system += services.language_hint(history)
    if followup:
        history.append({"role": "user", "content": "[The customer has been silent. Write the follow-up now.]"})
    text, error = services.ai_chat_json(db, system, history)
    if not text:
        log.warning("AI manager: %s", error)
        return None
    try:
        raw = text.strip()
        data = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
    except (ValueError, TypeError):
        return None
    return data if isinstance(data, dict) else None


def _apply(db: Session, manager: User, account: IGAccount, contact: Contact, data: dict, incoming: str) -> bool:
    from .engine import log_event, notify_telegram, record_message, contact_card  # sikl importdan qochish

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
            ig.send_dm(token, contact.igsid, catalog.product_cards(account, chosen))
    except ig.IGError as e:
        log_event(db, account, contact, "error", incoming, f"ai_manager → {e}")
        return False
    cards = ("  🛍 " + ", ".join(p.name for p in chosen)) if chosen else ""
    log_event(db, account, contact, "ai_reply", incoming, reply + cards)
    record_message(db, account.id, contact, "out", (reply + cards).strip(), "ai")

    author = f"🤖 {manager.name or 'AI'}"
    stage = data.get("stage")
    target = crm.stage_by_id(account, stage) if isinstance(stage, str) else None
    if target and target["type"] != "won" and stage != contact.stage:
        crm.set_stage(db, contact, stage, author)
    note = str(data.get("note") or "").strip()
    if note and note.lower() != "null":
        crm.add_note(db, contact, note[:500], author)
    if data.get("handoff") is True:
        handoff(db, manager, account, contact, note or reply)
    return True


def simulate(db: Session, manager: User, account: IGAccount, history: list[dict], stage_id: str | None,
             followup: bool = False) -> dict | None:
    """Sinov chati: AI menejer nima qilishini qaytaradi, lekin hech narsa yubormaydi va saqlamaydi."""
    data = _ask(db, manager, account, None, followup, history=history, stage_id=stage_id)
    if not data:
        return None
    reply, ids = catalog.split_tags(str(data.get("reply") or ""))
    products = catalog.active_products(db, account.id)
    stage = data.get("stage")
    target = crm.stage_by_id(account, stage) if isinstance(stage, str) else None
    if target and target["type"] == "won":
        target = None
    note = str(data.get("note") or "").strip()
    return {"reply": reply, "products": [p for pid in ids for p in products if p.id == pid],
            "stage": target["id"] if target and target["id"] != stage_id else None,
            "stage_name": target["name"] if target and target["id"] != stage_id else "",
            "note": "" if note.lower() == "null" else note[:500], "handoff": data.get("handoff") is True}


def handoff(db: Session, manager: User, account: IGAccount, contact: Contact, reason: str) -> None:
    """Lidni eng kam yuklangan odam menejerga (yoki egasiga) topshirish."""
    from .engine import contact_card, notify_telegram

    owner = account.user
    humans = [m for m in crm.team_members(db, owner.id) if not m.is_ai]
    if humans:
        load = dict(db.execute(select(Contact.assigned_to, func.count(Contact.id)).where(
            Contact.account_id == account.id, Contact.assigned_to.in_([h.id for h in humans]))
            .group_by(Contact.assigned_to)).all())
        target = min(humans, key=lambda h: (load.get(h.id, 0), h.id))
    else:
        target = owner
    crm.assign(db, contact, target, f"🤖 {manager.name or 'AI'} → 🤝")
    notify_telegram(db, account, contact_card(contact, f"🤝 {manager.name or 'AI'}: {reason[:300]}"), contact, target.id)


def reply(db: Session, account: IGAccount, contact: Contact, text: str) -> bool:
    """Kiruvchi xabarga AI menejer javobi. True — javob yuborildi."""
    manager = db.get(User, contact.assigned_to) if contact.assigned_to else None
    if not is_ai_manager(manager) or not services.ai_available(db):
        return False
    data = _ask(db, manager, account, contact, followup=False)
    if not data:
        return False
    contact.ai_followup_at = None
    db.commit()
    return _apply(db, manager, account, contact, data, text)


def run_followups() -> int:
    """Jim qolgan mijozlarga bir martalik follow-up (24 soat oynasi ichida)."""
    from .db import SessionLocal
    from .plans import account_owner_active

    db = SessionLocal()
    sent = 0
    try:
        managers = db.scalars(select(User).where(User.is_ai.is_(True), User.ai_followup_hours > 0)).all()
        now = utcnow()
        for manager in managers:
            hours = manager.ai_followup_hours
            contacts = db.scalars(select(Contact).where(
                Contact.assigned_to == manager.id, Contact.ai_followup_at.is_(None),
                Contact.last_inbound_at.is_not(None), Contact.last_inbound_at > now - timedelta(hours=22),
                Contact.last_message_at < now - timedelta(hours=hours))).all()
            for c in contacts:
                last = db.scalar(select(Message).where(Message.contact_id == c.id).order_by(Message.id.desc()).limit(1))
                if not last or last.direction != "out" or not account_owner_active(c.account) or c.bot_paused():
                    continue
                if not services.ai_available(db):
                    return sent
                c.ai_followup_at = now  # bir marta
                db.commit()
                data = _ask(db, manager, c.account, c, followup=True)
                if data and _apply(db, manager, c.account, c, {**data, "handoff": False}, "[follow-up]"):
                    sent += 1
        return sent
    finally:
        db.close()

"""Webhook hodisalarini qayta ishlash: qoidani topish va javob yuborish."""

import logging
import random
import re
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import instagram as ig
from .config import settings
from .db import SessionLocal
from .models import SEND_KINDS, EventLog, IGAccount, ProcessedEvent, Rule, utcnow
from .security import decrypt, encrypt

log = logging.getLogger("engine")

_APOSTROPHES = re.compile(r"[‘’ʻʼ`´]")


def normalize(text: str) -> str:
    text = _APOSTROPHES.sub("'", text or "").lower()
    return " ".join(text.split())


def rule_matches(rule: Rule, text: str) -> bool:
    if rule.match_mode == "any":
        return True
    t = normalize(text)
    keywords = [normalize(k) for k in rule.keyword_list]
    if rule.match_mode == "exact":
        return t in keywords
    return any(k and k in t for k in keywords)


def find_rule(db: Session, account: IGAccount, trigger: str, text: str, media_id: str | None = None) -> Rule | None:
    rules = db.scalars(
        select(Rule).where(Rule.account_id == account.id, Rule.active.is_(True), Rule.trigger == trigger).order_by(Rule.id)
    ).all()
    # Avval aniq postga bog'langan qoidalar, keyin "barcha postlar" qoidalari
    rules = sorted(rules, key=lambda r: (r.media_id is None, r.id))
    for rule in rules:
        if rule.media_id and rule.media_id != media_id:
            continue
        if rule_matches(rule, text):
            return rule
    return None


def mark_processed(db: Session, key: str) -> bool:
    """True — yangi hodisa; False — avval ishlangan."""
    db.add(ProcessedEvent(key=key))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def sends_last_hour(db: Session, account_id: int) -> int:
    since = utcnow() - timedelta(hours=1)
    return db.scalar(
        select(func.count(EventLog.id)).where(
            EventLog.account_id == account_id, EventLog.kind.in_(SEND_KINDS), EventLog.created_at >= since
        )
    ) or 0


def _log(db: Session, account: IGAccount, kind: str, rule: Rule | None = None, username: str = "",
         incoming: str = "", detail: str = "") -> None:
    db.add(EventLog(account_id=account.id, rule_id=rule.id if rule else None, kind=kind,
                    username=username, incoming=incoming[:1000], detail=detail[:1000]))
    db.commit()


def _fill(template: str, username: str) -> str:
    return template.replace("{username}", f"@{username}" if username else "").strip()


# ---------- Hodisalar ----------

def handle_comment(db: Session, account: IGAccount, value: dict) -> None:
    sender = value.get("from") or {}
    if str(sender.get("id")) == account.ig_user_id:
        return  # o'zimizning izoh/javobimiz — sikl bo'lmasin
    comment_id = value.get("id")
    if not comment_id:
        return
    text = value.get("text") or ""
    username = sender.get("username") or ""
    media_id = (value.get("media") or {}).get("id")

    rule = find_rule(db, account, "comment", text, media_id)
    if not rule:
        return
    if not mark_processed(db, f"c:{comment_id}"):
        return
    if sends_last_hour(db, account.id) >= settings.HOURLY_SEND_LIMIT:
        _log(db, account, "skipped", rule, username, text, "Soatlik limitga yetildi")
        return

    token = decrypt(account.access_token_enc)

    variants = rule.reply_variants
    if variants:
        reply = _fill(random.choice(variants), username)
        try:
            ig.reply_to_comment(token, comment_id, reply)
            _log(db, account, "comment_reply", rule, username, text, reply)
        except ig.IGError as e:
            _log(db, account, "error", rule, username, text, f"Izohga javob: {e}")

    if rule.dm_text.strip():
        dm = _fill(rule.dm_text, username)
        try:
            ig.private_reply(token, comment_id, dm)
            _log(db, account, "private_reply", rule, username, text, dm)
        except ig.IGError as e:
            _log(db, account, "error", rule, username, text, f"Direct (private reply): {e}")

    rule.hits += 1
    db.commit()


def handle_message(db: Session, account: IGAccount, event: dict) -> None:
    message = event.get("message") or {}
    if not message or message.get("is_echo") or message.get("is_deleted"):
        return
    sender_id = str((event.get("sender") or {}).get("id") or "")
    if not sender_id or sender_id == account.ig_user_id:
        return
    mid = message.get("mid")
    text = message.get("text") or ""
    if not mid or not text:
        return

    rule = find_rule(db, account, "dm", text)
    if not rule or not rule.dm_text.strip():
        return
    if not mark_processed(db, f"m:{mid}"):
        return
    if sends_last_hour(db, account.id) >= settings.HOURLY_SEND_LIMIT:
        _log(db, account, "skipped", rule, "", text, "Soatlik limitga yetildi")
        return

    token = decrypt(account.access_token_enc)
    reply = _fill(rule.dm_text, "")
    try:
        ig.send_dm(token, sender_id, reply)
        _log(db, account, "dm_reply", rule, "", text, reply)
    except ig.IGError as e:
        _log(db, account, "error", rule, "", text, f"Direct javob: {e}")

    rule.hits += 1
    db.commit()


def process_payload(payload: dict) -> None:
    if payload.get("object") != "instagram":
        return
    db = SessionLocal()
    try:
        for entry in payload.get("entry", []):
            account = db.scalar(select(IGAccount).where(IGAccount.ig_user_id == str(entry.get("id"))))
            if not account or not account.active:
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
                    handle_message(db, account, event)
                except Exception:
                    db.rollback()
                    log.exception("message handling failed")
    finally:
        db.close()


# ---------- Token yangilash ----------

def refresh_expiring_tokens() -> None:
    """Long-lived token 60 kun yashaydi; 10 kun qolganda yangilaymiz."""
    db = SessionLocal()
    try:
        soon = utcnow() + timedelta(days=10)
        accounts = db.scalars(select(IGAccount).where(IGAccount.token_expires_at < soon)).all()
        for acc in accounts:
            try:
                token, expires_in = ig.refresh_token(decrypt(acc.access_token_enc))
                acc.access_token_enc = encrypt(token)
                acc.token_expires_at = utcnow() + timedelta(seconds=expires_in or 60 * 86400)
                db.commit()
            except Exception as e:  # noqa: BLE001
                db.rollback()
                _log(db, acc, "error", detail=f"Token yangilanmadi: {e}")
        # Eski dedup yozuvlarini tozalash
        db.query(ProcessedEvent).filter(ProcessedEvent.created_at < utcnow() - timedelta(days=14)).delete()
        db.commit()
    finally:
        db.close()

"""CRM: savdo voronkasi (bosqichlar), bitim summasi, izohlar."""

import json
import uuid

from sqlalchemy.orm import Session

from .models import Contact, IGAccount, Note, utcnow

COLORS = ("sky", "violet", "amber", "emerald", "rose", "slate", "orange", "teal")
TYPES = ("open", "won", "lost")

_DEFAULT = [
    ("new", "sky", "open", {"tj": "Нав", "ru": "Новый", "uz": "Yangi", "en": "New"}),
    ("contacted", "violet", "open", {"tj": "Тамос гирифта шуд", "ru": "Связались", "uz": "Bog'lanildi", "en": "Contacted"}),
    ("negotiation", "amber", "open", {"tj": "Гуфтушунид", "ru": "Переговоры", "uz": "Muzokara", "en": "Negotiation"}),
    ("won", "emerald", "won", {"tj": "Фурӯхта шуд", "ru": "Продано", "uz": "Sotildi", "en": "Won"}),
    ("lost", "slate", "lost", {"tj": "Рад шуд", "ru": "Отказ", "uz": "Rad etildi", "en": "Lost"}),
]


def default_stages(lang: str) -> list[dict]:
    return [{"id": sid, "name": names.get(lang) or names["en"], "color": color, "type": typ}
            for sid, color, typ, names in _DEFAULT]


def get_stages(account: IGAccount) -> list[dict]:
    try:
        stages = json.loads(account.crm_stages_json or "[]")
    except ValueError:
        stages = []
    if not stages:
        stages = default_stages(account.user.lang if account.user else "en")
    return stages


def validate_stages(raw: list) -> list[dict] | str:
    if not isinstance(raw, list) or not 1 <= len(raw) <= 10:
        return "stages_count"
    out, seen = [], set()
    for s in raw:
        name = str((s or {}).get("name") or "").strip()[:30]
        if not name:
            return "stage_name"
        sid = str(s.get("id") or "").strip()[:40] or uuid.uuid4().hex[:8]
        if sid in seen:
            sid = uuid.uuid4().hex[:8]
        seen.add(sid)
        out.append({"id": sid, "name": name,
                    "color": s.get("color") if s.get("color") in COLORS else "slate",
                    "type": s.get("type") if s.get("type") in TYPES else "open"})
    return out


def stage_by_id(account: IGAccount, stage_id: str | None) -> dict | None:
    return next((s for s in get_stages(account) if s["id"] == stage_id), None)


def add_note(db: Session, contact: Contact, text: str, author: str, kind: str = "note") -> Note:
    note = Note(account_id=contact.account_id, contact_id=contact.id, kind=kind, author=author[:120], text=text[:2000])
    db.add(note)
    db.commit()
    return note


def set_stage(db: Session, contact: Contact, stage_id: str | None, author: str) -> bool:
    """Bosqichni o'zgartiradi va tarixga yozadi. None — CRM'dan olib tashlash."""
    if stage_id == contact.stage:
        return False
    if stage_id is not None and not stage_by_id(contact.account, stage_id):
        return False
    old = stage_by_id(contact.account, contact.stage)
    new = stage_by_id(contact.account, stage_id)
    contact.stage = stage_id
    contact.stage_changed_at = utcnow()
    db.commit()
    add_note(db, contact, f"{old['name'] if old else '—'} → {new['name'] if new else '—'}", author, kind="stage")
    return True

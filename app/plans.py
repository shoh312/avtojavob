"""Tariflar va cheklovlar."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AppSetting, IGAccount, User, utcnow

CURRENCY = "TJS"
TRIAL_DAYS = 7
# ai_replies — AI sotuvchining oylik javoblari (ish maydonidagi barcha akkauntlar uchun jami), products — har akkauntga
PLANS = {
    "trial": {"price": 0, "accounts": 1, "ai_replies": 1000, "products": 50, "content_daily": 10},
    "pro": {"price": 199, "accounts": 1, "ai_replies": 1000, "products": 50, "content_daily": 10},
    "business": {"price": 499, "accounts": 3, "ai_replies": 3000, "products": 150, "content_daily": 25},
}
ADMIN_PRODUCTS = 500
ADMIN_ACCOUNTS = 10


def plan_expires(user: User) -> datetime:
    # Eski foydalanuvchilarda muddat bo'lmasa — ro'yxatdan o'tgandan 7 kun
    return user.plan_expires_at or (user.created_at or utcnow()) + timedelta(days=TRIAL_DAYS)


def is_active(user: User) -> bool:
    if user.is_blocked:
        return False
    if user.is_admin:
        return True
    return plan_expires(user) > utcnow()


def accounts_limit(user: User) -> int:
    if user.is_admin:
        return ADMIN_ACCOUNTS
    return PLANS.get(user.plan, PLANS["trial"])["accounts"]


def _plan(user: User) -> dict:
    return PLANS.get(user.plan, PLANS["trial"])


def products_limit(user: User) -> int:
    return ADMIN_PRODUCTS if user.is_admin else _plan(user)["products"]


def ai_limit(user: User) -> int | None:
    """Oylik AI javoblar limiti; None — cheklovsiz (admin)."""
    return None if user.is_admin else _plan(user)["ai_replies"]


def content_limit(user: User) -> int | None:
    """AI kontent: kuniga nechta yaratish (ish maydonining barcha akkauntlari uchun jami); None — cheklovsiz."""
    return None if user.is_admin else _plan(user)["content_daily"]


def month_start() -> datetime:
    now = utcnow()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def ai_used(db: Session, owner_id: int) -> int:
    """Shu oy AI sotuvchi yuborgan javoblar (ish maydonining barcha akkauntlari)."""
    from sqlalchemy import func

    from .models import EventLog
    return db.scalar(select(func.count(EventLog.id)).join(IGAccount, IGAccount.id == EventLog.account_id).where(
        IGAccount.user_id == owner_id, EventLog.kind == "ai_reply", EventLog.created_at >= month_start())) or 0


def ai_quota_left(db: Session, account: IGAccount) -> bool:
    owner = account.user
    if not owner:
        return False
    limit = ai_limit(owner)
    return limit is None or ai_used(db, owner.id) < limit


def usage_json(db: Session, user: User) -> dict:
    return {"ai_used": ai_used(db, user.id), "ai_limit": ai_limit(user), "products_limit": products_limit(user)}


def plan_json(user: User) -> dict:
    exp = plan_expires(user)
    left = (exp - utcnow()).total_seconds()
    return {
        "plan": user.plan if user.plan in PLANS else "trial",
        "active": is_active(user),
        "expires_at": exp.isoformat() + "Z",
        "days_left": max(0, int(left // 86400) + (1 if left % 86400 > 0 else 0)) if left > 0 else 0,
        "accounts_limit": accounts_limit(user),
        "ai_limit": ai_limit(user),
        "products_limit": products_limit(user),
        "content_limit": content_limit(user),
        "unlimited": user.is_admin,
    }


def account_owner_active(account: IGAccount) -> bool:
    return bool(account.active and account.user and is_active(account.user))


def get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.get(AppSetting, key)
    return row.value if row else default


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()


def plans_public(db: Session) -> dict:
    return {
        "currency": CURRENCY,
        "trial_days": TRIAL_DAYS,
        "telegram": get_setting(db, "telegram_username"),
        "plans": [{"key": k, **v} for k, v in PLANS.items()],
    }

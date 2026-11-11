"""Tariflar va cheklovlar."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AppSetting, IGAccount, User, utcnow

CURRENCY = "TJS"
TRIAL_DAYS = 7
PLANS = {
    "trial": {"price": 0, "accounts": 1},
    "pro": {"price": 199, "accounts": 1},
    "business": {"price": 499, "accounts": 3},
}
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


def plan_json(user: User) -> dict:
    exp = plan_expires(user)
    left = (exp - utcnow()).total_seconds()
    return {
        "plan": user.plan if user.plan in PLANS else "trial",
        "active": is_active(user),
        "expires_at": exp.isoformat() + "Z",
        "days_left": max(0, int(left // 86400) + (1 if left % 86400 > 0 else 0)) if left > 0 else 0,
        "accounts_limit": accounts_limit(user),
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

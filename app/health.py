"""Instagram ulanishi nazorati: token bekor bo'lsa — akkauntni belgilash va egasiga xabar berish.

Token ikki yo'l bilan aniqlanadi:
  * har qanday Graph so'rovi 190 xatosi bilan qaytsa (instagram._dead) — darhol, keyingi fon siklida;
  * har 2 soatda faol akkauntlarni get_me bilan tekshirish (trafik bo'lmasa ham).
Xabar bir marta yuboriladi; qayta ulanganda (/instagram/callback) token_invalid_at tozalanadi.
"""
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import instagram as ig
from . import services, tgbot
from .config import settings
from .db import SessionLocal
from .models import EventLog, IGAccount, utcnow
from .security import decrypt

log = logging.getLogger("chatflow.health")

TXT = {
    "subject": {
        "en": "⚠️ Instagram @{u} disconnected from ChatFlow",
        "ru": "⚠️ Instagram @{u} отключился от ChatFlow",
        "uz": "⚠️ Instagram @{u} ChatFlow'dan uzildi",
        "tj": "⚠️ Instagram @{u} аз ChatFlow ҷудо шуд",
    },
    "title": {
        "en": "Instagram connection lost",
        "ru": "Подключение Instagram прервано",
        "uz": "Instagram ulanishi uzildi",
        "tj": "Пайвасти Instagram қатъ шуд",
    },
    "body": {
        "en": "Instagram ended ChatFlow's access to @{u} (usually after a password change or \"log out of all devices\"). "
              "Auto-replies, flows and the AI seller are paused for this account. Reconnect it — it takes a minute, "
              "and your flows, CRM and settings stay as they are.",
        "ru": "Instagram прекратил доступ ChatFlow к @{u} (обычно после смены пароля или «выхода со всех устройств»). "
              "Автоответы, сценарии и AI-продавец для этого аккаунта остановлены. Подключите его заново — это займёт минуту, "
              "сценарии, CRM и настройки сохранятся.",
        "uz": "Instagram ChatFlow'ning @{u} akkauntiga ruxsatini bekor qildi (odatda parol o'zgarganda yoki «barcha qurilmalardan chiqish» bosilganda). "
              "Bu akkauntda avtojavoblar, ssenariylar va AI sotuvchi to'xtadi. Qayta ulang — bir daqiqa oladi, "
              "ssenariylar, CRM va sozlamalar joyida qoladi.",
        "tj": "Instagram дастрасии ChatFlow-ро ба @{u} бекор кард (одатан пас аз иваз кардани парол ё «баромадан аз ҳамаи дастгоҳҳо»). "
              "Ҷавобҳои худкор, сенарияҳо ва AI-фурӯшанда барои ин аккаунт қатъ шуданд. Онро аз нав пайваст кунед — як дақиқа мегирад, "
              "сенарияҳо, CRM ва танзимот боқӣ мемонанд.",
    },
    "button": {"en": "Reconnect Instagram", "ru": "Подключить заново", "uz": "Qayta ulash", "tj": "Аз нав пайваст кардан"},
}


def _t(key: str, lang: str, **kw) -> str:
    return (TXT[key].get(lang) or TXT[key]["en"]).format(**kw)


def reconnect_url() -> str:
    return f"{settings.APP_URL}/app/accounts?reconnect=1"


def mark_disconnected(db: Session, acc: IGAccount, reason: str) -> bool:
    """Akkauntni "uzilgan" deb belgilaydi va egasiga bir marta xabar beradi. Yangi belgilangan bo'lsa True."""
    if acc.token_invalid_at:
        return False
    acc.token_invalid_at = utcnow()
    db.add(EventLog(account_id=acc.id, kind="error", detail=f"ig_disconnected → {reason}"[:1000]))
    db.commit()
    owner = acc.user
    lang = (owner.lang if owner else "en") or "en"
    u = acc.username or acc.ig_user_id
    url = reconnect_url()
    log.warning("Instagram @%s disconnected: %s", u, reason[:200])
    cfg = services.smtp_config(db)
    if cfg and owner and owner.email:
        try:
            services.send_email(cfg, owner.email, _t("subject", lang, u=u),
                                f"{_t('title', lang)}\n\n{_t('body', lang, u=u)}\n\n{url}",
                                services.email_html(_t("title", lang), _t("body", lang, u=u), _t("button", lang), url))
        except Exception:  # noqa: BLE001
            log.exception("disconnect email failed: account %s", acc.id)
    try:
        tgbot.notify(db, acc, f"⚠️ {_t('title', lang)}: @{u}\n\n{_t('body', lang, u=u)}\n\n{url}")
    except Exception:  # noqa: BLE001
        log.exception("disconnect telegram failed: account %s", acc.id)
    return True


def check_dead_tokens() -> int:
    """Graph 190 qaytargan tokenlarni akkauntlarga bog'laydi (har fon siklida, arzon)."""
    dead = ig.pop_dead_tokens()
    if not dead:
        return 0
    n = 0
    with SessionLocal() as db:
        for acc in db.scalars(select(IGAccount).where(IGAccount.token_invalid_at.is_(None))).all():
            try:
                token = decrypt(acc.access_token_enc)
            except Exception:  # noqa: BLE001
                continue
            if token in dead:
                n += mark_disconnected(db, acc, "token rejected by Instagram")
    return n


def check_connections() -> int:
    """Faol akkauntlar tokenini get_me bilan tekshiradi (kam trafikli akkauntlar uchun)."""
    n = 0
    with SessionLocal() as db:
        for acc in db.scalars(select(IGAccount).where(IGAccount.token_invalid_at.is_(None), IGAccount.active.is_(True))).all():
            try:
                ig.get_me(decrypt(acc.access_token_enc))
            except ig.IGTokenError as e:
                n += mark_disconnected(db, acc, str(e))
            except Exception:  # noqa: BLE001 — tarmoq xatosi va h.k.: uzilgan deb hisoblamaymiz
                pass
    ig.pop_dead_tokens()  # yuqorida aniqlanganlar allaqachon belgilandi
    return n

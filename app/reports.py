"""Email xatlari: tasdiqlash kodi (OTP) va kunlik analitika hisoboti.

Kunlik hisobot har kuni ertalab (UTC+5 bo'yicha 09:00 dan keyin) bir marta yuboriladi — faqat emaili tasdiqlangan,
faol tarifdagi, Instagram ulangan va hisobotni o'chirmagan egalarga. Kecha hech qanday faollik bo'lmasa, yuborilmaydi.
"""
import hashlib
import hmac
import html
import logging
import secrets
from datetime import timedelta

from itsdangerous import BadSignature, URLSafeSerializer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import services
from .config import settings
from .models import Contact, EventLog, IGAccount, Message, User, utcnow
from .plans import is_active

log = logging.getLogger("reports")

CODE_TTL = timedelta(minutes=15)
CODE_RESEND = timedelta(seconds=60)
CODE_MAX_TRIES = 5
REPORT_HOUR_UTC = 4  # 09:00 Dushanbe / Toshkent

_unsub = URLSafeSerializer(settings.SECRET_KEY, salt="chatflow-report-unsub")

BRAND = "#e5161f"
INK = "#111114"

# ------------------------------------------------------------------ matnlar

TX = {
    "ru": {
        "code_s": "{code} — код подтверждения ChatFlow", "code_t": "Подтвердите email",
        "code_b": "Введите этот код в ChatFlow, чтобы подтвердить адрес. Код действует 15 минут.",
        "code_n": "Если вы не регистрировались в ChatFlow — просто проигнорируйте это письмо.",
        "rep_s": "📊 ChatFlow: итоги за сутки — {n} сообщений", "rep_t": "Итоги за последние 24 часа",
        "rep_hi": "Доброе утро! Вот как поработал ChatFlow, пока вы отдыхали.",
        "k_in": "Входящих сообщений", "k_auto": "Автоответов", "k_contacts": "Новых клиентов", "k_leads": "Заявок с телефоном",
        "auto_share": "{p}% сообщений обработано автоматически", "ai": "из них ответил AI-продавец: {n}",
        "leads_t": "Новые заявки", "unread": "Ждут ответа в чатах: {n}", "open": "Открыть ChatFlow",
        "vs": "вчера", "per_acc": "По аккаунтам", "foot": "Вы получаете это письмо, потому что включён ежедневный отчёт.",
        "unsub": "Отписаться", "unsub_ok": "Вы отписались от ежедневного отчёта. Включить снова можно в Настройках.",
    },
    "uz": {
        "code_s": "{code} — ChatFlow tasdiqlash kodi", "code_t": "Emailingizni tasdiqlang",
        "code_b": "Manzilni tasdiqlash uchun ushbu kodni ChatFlow'ga kiriting. Kod 15 daqiqa amal qiladi.",
        "code_n": "Agar ChatFlow'da ro'yxatdan o'tmagan bo'lsangiz — bu xatga e'tibor bermang.",
        "rep_s": "📊 ChatFlow: kunlik hisobot — {n} ta xabar", "rep_t": "So'nggi 24 soat natijalari",
        "rep_hi": "Xayrli tong! Siz dam olayotganingizda ChatFlow qanday ishlaganini ko'ring.",
        "k_in": "Kiruvchi xabarlar", "k_auto": "Avtojavoblar", "k_contacts": "Yangi mijozlar", "k_leads": "Raqamli arizalar",
        "auto_share": "Xabarlarning {p}% avtomatik javob oldi", "ai": "shundan AI sotuvchi javob berdi: {n}",
        "leads_t": "Yangi arizalar", "unread": "Chatlarda javob kutmoqda: {n}", "open": "ChatFlow'ni ochish",
        "vs": "kecha", "per_acc": "Akkauntlar bo'yicha", "foot": "Bu xatni kunlik hisobot yoqilgani uchun olyapsiz.",
        "unsub": "Obunani bekor qilish", "unsub_ok": "Kunlik hisobotdan obunani bekor qildingiz. Sozlamalarda qayta yoqish mumkin.",
    },
    "tj": {
        "code_s": "{code} — рамзи тасдиқи ChatFlow", "code_t": "Email-ро тасдиқ кунед",
        "code_b": "Барои тасдиқи суроға ин рамзро дар ChatFlow ворид кунед. Рамз 15 дақиқа эътибор дорад.",
        "code_n": "Агар шумо дар ChatFlow сабти ном нашуда бошед — ин мактубро нодида гиред.",
        "rep_s": "📊 ChatFlow: ҳисоботи шабонарӯзӣ — {n} паём", "rep_t": "Натиҷаҳои 24 соати охир",
        "rep_hi": "Субҳ ба хайр! Вақте ки шумо истироҳат мекардед, ChatFlow чӣ тавр кор кард.",
        "k_in": "Паёмҳои воридотӣ", "k_auto": "Ҷавобҳои худкор", "k_contacts": "Мизоҷони нав", "k_leads": "Дархостҳо бо рақам",
        "auto_share": "{p}% паёмҳо худкор ҷавоб гирифтанд", "ai": "аз онҳо AI-фурӯшанда: {n}",
        "leads_t": "Дархостҳои нав", "unread": "Дар чатҳо ҷавобро интизоранд: {n}", "open": "Кушодани ChatFlow",
        "vs": "дирӯз", "per_acc": "Аз рӯи аккаунтҳо", "foot": "Шумо ин мактубро мегиред, зеро ҳисоботи ҳаррӯза фаъол аст.",
        "unsub": "Бекор кардани обуна", "unsub_ok": "Шумо аз ҳисоботи ҳаррӯза даст кашидед. Дар Танзимот аз нав фаъол кардан мумкин.",
    },
    "en": {
        "code_s": "{code} is your ChatFlow code", "code_t": "Confirm your email",
        "code_b": "Enter this code in ChatFlow to confirm your address. It expires in 15 minutes.",
        "code_n": "If you didn't sign up for ChatFlow, just ignore this email.",
        "rep_s": "📊 ChatFlow daily report — {n} messages", "rep_t": "Your last 24 hours",
        "rep_hi": "Good morning! Here's how ChatFlow worked while you were resting.",
        "k_in": "Incoming messages", "k_auto": "Auto-replies", "k_contacts": "New customers", "k_leads": "Leads with phone",
        "auto_share": "{p}% of messages were handled automatically", "ai": "AI seller replied to {n}",
        "leads_t": "New leads", "unread": "Waiting for a reply: {n}", "open": "Open ChatFlow",
        "vs": "yesterday", "per_acc": "By account", "foot": "You get this email because the daily report is on.",
        "unsub": "Unsubscribe", "unsub_ok": "You unsubscribed from the daily report. Turn it back on in Settings.",
    },
}


def tx(lang: str) -> dict:
    return TX.get(lang, TX["ru"])


# ------------------------------------------------------------------ tasdiqlash kodi

def _code_hash(user_id: int, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def new_code(user: User) -> str:
    """Yangi 6 xonali kod yaratadi (xeshi bazaga yoziladi)."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.verify_code = _code_hash(user.id, code)
    user.verify_exp = utcnow() + CODE_TTL
    user.verify_tries = 0
    user.verify_sent_at = utcnow()
    return code


def resend_wait(user: User) -> int:
    """Qayta yuborishgacha qolgan soniyalar."""
    if not user.verify_sent_at:
        return 0
    left = (user.verify_sent_at + CODE_RESEND - utcnow()).total_seconds()
    return max(0, int(left) + (1 if left % 1 else 0))


def check_code(user: User, code: str) -> str | None:
    """Kodni tekshiradi. None — to'g'ri; aks holda xato kodi."""
    code = "".join(ch for ch in str(code or "") if ch.isdigit())
    if not user.verify_code or not user.verify_exp:
        return "code_invalid"
    if user.verify_tries >= CODE_MAX_TRIES:
        return "code_too_many"
    if user.verify_exp < utcnow():
        return "code_expired"
    user.verify_tries += 1
    if len(code) != 6 or not hmac.compare_digest(user.verify_code, _code_hash(user.id, code)):
        return "code_invalid"
    user.verify_code = ""
    user.verify_exp = None
    return None


# ------------------------------------------------------------------ HTML

def _shell(inner: str, lang: str, preheader: str = "", footer: str = "") -> str:
    """Pochta dasturlari uchun xavfsiz jadvalli maket (inline uslublar)."""
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>ChatFlow</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;-webkit-text-size-adjust:100%">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">{html.escape(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f6">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;font-family:Inter,Segoe UI,Arial,sans-serif;color:{INK}">
<tr><td style="padding:0 6px 18px">
  <span style="display:inline-block;width:34px;height:34px;border-radius:10px;background:{BRAND};color:#fff;font-weight:800;font-size:18px;line-height:34px;text-align:center;vertical-align:middle">💬</span>
  <span style="font-size:21px;font-weight:800;font-style:italic;vertical-align:middle;margin-left:8px">Chat<span style="color:{BRAND}">Flow</span></span>
</td></tr>
{inner}
<tr><td style="padding:22px 10px 0;font-size:12px;line-height:1.6;color:#9a9aa4;text-align:center">{footer}</td></tr>
</table></td></tr></table></body></html>"""


def code_email(lang: str, code: str) -> tuple[str, str, str]:
    t = tx(lang)
    digits = "".join(
        f'<td style="padding:0 3px"><div style="width:44px;height:56px;border-radius:12px;background:#f4f4f6;border:1px solid #e6e6eb;'
        f'font-size:28px;font-weight:800;line-height:56px;text-align:center;color:{INK};font-family:Consolas,Menlo,monospace">{d}</div></td>'
        for d in code)
    inner = f"""<tr><td style="background:#fff;border-radius:24px;padding:36px 28px;text-align:center">
  <div style="display:inline-block;width:56px;height:56px;border-radius:18px;background:#fff1f1;font-size:28px;line-height:56px">✉️</div>
  <h1 style="margin:18px 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.02em">{t['code_t']}</h1>
  <p style="margin:0 auto;max-width:400px;font-size:15px;line-height:1.6;color:#55555f">{t['code_b']}</p>
  <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:26px auto 6px"><tr>{digits}</tr></table>
</td></tr>"""
    subject = t["code_s"].format(code=code)
    text = f"{t['code_t']}\n\n{t['code_b']}\n\n{code}\n\n{t['code_n']}"
    return subject, text, _shell(inner, lang, preheader=f"{code} — {t['code_b']}", footer=t["code_n"])


# ------------------------------------------------------------------ kunlik hisobot

def _account_stats(db: Session, acc: IGAccount, a, b) -> dict:
    def count(q) -> int:
        return db.scalar(q) or 0

    in_ = count(select(func.count(Message.id)).where(Message.account_id == acc.id, Message.direction == "in",
                                                     Message.created_at >= a, Message.created_at < b))
    auto = count(select(func.count(Message.id)).where(Message.account_id == acc.id, Message.direction == "out",
                                                      Message.source.in_(("flow", "ai")), Message.created_at >= a, Message.created_at < b))
    ai = count(select(func.count(Message.id)).where(Message.account_id == acc.id, Message.direction == "out",
                                                    Message.source == "ai", Message.created_at >= a, Message.created_at < b))
    contacts = count(select(func.count(Contact.id)).where(Contact.account_id == acc.id, Contact.created_at >= a, Contact.created_at < b))
    lead_ids = list(db.scalars(select(EventLog.contact_id).where(
        EventLog.account_id == acc.id, EventLog.kind == "answer", EventLog.detail.like("%phone%"),
        EventLog.created_at >= a, EventLog.created_at < b, EventLog.contact_id.is_not(None)).distinct()))
    return {"in": in_, "auto": auto, "ai": ai, "contacts": contacts, "leads": len(lead_ids), "lead_ids": lead_ids}


def build_report(db: Session, user: User) -> dict | None:
    """Foydalanuvchining barcha akkauntlari bo'yicha 24 soatlik hisobot ma'lumotlari."""
    now = utcnow()
    d1, d2 = now - timedelta(days=1), now - timedelta(days=2)
    accs = [a for a in user.accounts if a.active]
    if not accs:
        return None
    total = {"in": 0, "auto": 0, "ai": 0, "contacts": 0, "leads": 0}
    prev = dict(total)
    per, leads, unread = [], [], 0
    for acc in accs:
        cur, old = _account_stats(db, acc, d1, now), _account_stats(db, acc, d2, d1)
        for k in total:
            total[k] += cur[k]
            prev[k] += old[k]
        per.append((acc, cur))
        unread += db.scalar(select(func.count(Contact.id)).where(Contact.account_id == acc.id, Contact.unread > 0)) or 0
        for c in db.scalars(select(Contact).where(Contact.id.in_(cur["lead_ids"])).limit(8)):
            leads.append((acc, c))
    return {"total": total, "prev": prev, "per": per, "leads": leads[:8], "unread": unread}


def _delta(cur: int, old: int, t: dict) -> str:
    if not old and not cur:
        return f'<span style="color:#a1a1ab">— {t["vs"]}</span>'
    if not old:
        return f'<span style="color:#10a36b">▲ {t["vs"]}: 0</span>'
    p = round((cur - old) / old * 100)
    color = "#10a36b" if p >= 0 else "#d93a3a"
    arrow = "▲" if p >= 0 else "▼"
    return f'<span style="color:{color}">{arrow} {abs(p)}% · {t["vs"]} {old}</span>'


def report_email(user: User, data: dict) -> tuple[str, str, str]:
    t = tx(user.lang)
    tot, prev = data["total"], data["prev"]
    e = html.escape

    def kpi(key: str, label: str, accent: bool = False) -> str:
        bg, fg, sub = (BRAND, "#fff", "rgba(255,255,255,.75)") if accent else ("#fff", INK, "#6b6b76")
        delta = _delta(tot[key], prev[key], t) if not accent else \
            f'<span style="color:rgba(255,255,255,.85)">{t["vs"]}: {prev[key]}</span>'
        return f"""<td width="50%" style="padding:5px;vertical-align:top"><div style="background:{bg};border-radius:18px;padding:18px 18px 16px;border:1px solid {'transparent' if accent else '#ececf0'}">
  <div style="font-size:12.5px;font-weight:600;color:{sub}">{label}</div>
  <div style="font-size:34px;font-weight:800;letter-spacing:-0.03em;color:{fg};margin-top:4px">{tot[key]}</div>
  <div style="font-size:12px;font-weight:600;margin-top:2px">{delta}</div></div></td>"""

    share = round(tot["auto"] / tot["in"] * 100) if tot["in"] else 0
    share = min(share, 100)
    bar = f"""<tr><td colspan="2" style="padding:6px 5px 0"><div style="background:#fff;border:1px solid #ececf0;border-radius:18px;padding:18px">
  <div style="font-size:14px;font-weight:700">⚡ {t['auto_share'].format(p=share)}</div>
  <div style="margin-top:10px;height:10px;border-radius:99px;background:#f1f1f4;overflow:hidden"><div style="height:10px;width:{share}%;background:linear-gradient(90deg,#7b5cff,{BRAND});border-radius:99px"></div></div>
  <div style="margin-top:8px;font-size:12.5px;color:#6b6b76">🤖 {t['ai'].format(n=tot['ai'])}</div></div></td></tr>"""

    leads_html = ""
    if data["leads"]:
        rows = ""
        for acc, c in data["leads"]:
            name = e(c.name or (f"@{c.username}" if c.username else c.igsid))
            phone = e(str((c.fields or {}).get("phone") or ""))
            rows += f"""<tr><td width="44" style="padding:10px 0;border-top:1px solid #f1f1f4;vertical-align:middle">
  <div style="width:34px;height:34px;border-radius:50%;background:#fff1f1;color:{BRAND};font-weight:800;line-height:34px;text-align:center">{e((c.username or c.name or '?')[:1].upper())}</div></td>
<td style="padding:10px 0;border-top:1px solid #f1f1f4;vertical-align:middle"><b style="font-size:14px">{name}</b><br><span style="font-size:12.5px;color:#6b6b76">{phone}{' · ' if phone else ''}@{e(acc.username)}</span></td></tr>"""
        leads_html = f"""<tr><td colspan="2" style="padding:6px 5px 0"><div style="background:#fff;border:1px solid #ececf0;border-radius:18px;padding:18px 18px 8px">
  <div style="font-size:14px;font-weight:700;margin-bottom:6px">🔥 {t['leads_t']}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">{rows}</table></div></td></tr>"""

    per_html = ""
    if len(data["per"]) > 1:
        rows = "".join(
            f"""<tr><td style="padding:8px 0;border-top:1px solid #f1f1f4;font-size:13.5px"><b>@{e(acc.username)}</b></td>
<td style="padding:8px 0;border-top:1px solid #f1f1f4;font-size:13px;color:#6b6b76;text-align:right">💬 {s['in']} · ⚡ {s['auto']} · 📞 {s['leads']}</td></tr>"""
            for acc, s in data["per"])
        per_html = f"""<tr><td colspan="2" style="padding:6px 5px 0"><div style="background:#fff;border:1px solid #ececf0;border-radius:18px;padding:18px 18px 10px">
  <div style="font-size:14px;font-weight:700;margin-bottom:6px">{t['per_acc']}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">{rows}</table></div></td></tr>"""

    unread = ""
    if data["unread"]:
        unread = f"""<tr><td colspan="2" style="padding:6px 5px 0"><div style="background:#fff7e6;border:1px solid #fde4ae;border-radius:18px;padding:14px 18px;font-size:14px;font-weight:600;color:#8a5a00">⏳ {t['unread'].format(n=data['unread'])}</div></td></tr>"""

    token = _unsub.dumps({"u": user.id})
    unsub_url = f"{settings.APP_URL}/email/unsubscribe?token={token}"
    date = utcnow().strftime("%d.%m.%Y")
    inner = f"""<tr><td style="background:{INK};border-radius:24px;padding:28px 26px;color:#fff">
  <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ff6369">{date}</div>
  <h1 style="margin:8px 0 6px;font-size:26px;font-weight:800;letter-spacing:-0.02em">{t['rep_t']}</h1>
  <p style="margin:0;font-size:14.5px;line-height:1.55;color:rgba(255,255,255,.7)">{t['rep_hi']}</p>
</td></tr>
<tr><td style="padding:10px 0 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">
  <tr>{kpi('in', t['k_in'], True)}{kpi('auto', t['k_auto'])}</tr>
  <tr>{kpi('contacts', t['k_contacts'])}{kpi('leads', t['k_leads'])}</tr>
  {bar}{leads_html}{unread}{per_html}
</table></td></tr>
<tr><td align="center" style="padding:24px 0 4px"><a href="{settings.APP_URL}/app" style="display:inline-block;background:{BRAND};color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:14px">{t['open']} →</a></td></tr>"""
    footer = f'{t["foot"]}<br><a href="{unsub_url}" style="color:#9a9aa4">{t["unsub"]}</a>'
    subject = t["rep_s"].format(n=tot["in"])
    text = "\n".join([t["rep_t"], "", f"{t['k_in']}: {tot['in']}", f"{t['k_auto']}: {tot['auto']}",
                      f"{t['k_contacts']}: {tot['contacts']}", f"{t['k_leads']}: {tot['leads']}", "",
                      f"{settings.APP_URL}/app", "", f"{t['unsub']}: {unsub_url}"])
    return subject, text, _shell(inner, user.lang, preheader=t["rep_hi"], footer=footer)


def unsubscribe(db: Session, token: str) -> User | None:
    try:
        data = _unsub.loads(token)
    except BadSignature:
        return None
    user = db.get(User, data.get("u")) if isinstance(data, dict) else None
    if user:
        user.daily_report = False
        db.commit()
    return user


def due(user: User, now=None) -> bool:
    now = now or utcnow()
    if now.hour < REPORT_HOUR_UTC:
        return False
    return not user.report_sent_at or user.report_sent_at.date() < now.date()


def run_daily(force_user_id: int | None = None) -> int:
    """Vaqti kelgan foydalanuvchilarga hisobot yuboradi. Yuborilganlar sonini qaytaradi."""
    from .db import SessionLocal
    sent = 0
    with SessionLocal() as db:
        cfg = services.smtp_config(db)
        if not cfg:
            return 0
        q = select(User).where(User.daily_report.is_(True), User.email_verified.is_(True), User.is_blocked.is_(False),
                               User.owner_id.is_(None))
        if force_user_id:
            q = select(User).where(User.id == force_user_id)
        for user in db.scalars(q).all():
            if not force_user_id and (not due(user) or not is_active(user)):
                continue
            data = build_report(db, user)
            user.report_sent_at = utcnow()
            db.commit()
            if not data or (not force_user_id and not (data["total"]["in"] or data["total"]["contacts"])):
                continue  # jim kun — xat yubormaymiz
            subject, text, body = report_email(user, data)
            try:
                services.send_email(cfg, user.email, subject, text, body)
                sent += 1
            except Exception:  # noqa: BLE001
                log.exception("hisobot yuborilmadi: user %s", user.id)
    return sent

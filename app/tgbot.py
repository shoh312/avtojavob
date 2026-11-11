"""Telegram — biznes egasining mobil "ilovasi".

Foydalanuvchi o'z botini ulaydi. ChatFlow:
  * yangi xabar, lid, javobsiz xabar va CRM eslatmalarini botga yuboradi (tugmalar bilan);
  * bot xabariga "Reply" qilib yozilgan javobni mijozga Instagram Direct orqali yetkazadi;
  * tugmalar: botni pauza qilish / qayta yoqish.
"""

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import instagram as ig
from . import services
from .config import settings
from .models import Contact, IGAccount, TgLink, utcnow
from .plans import is_active
from .security import decrypt

log = logging.getLogger("tgbot")

TXT = {
    "chat": {"uz": "💬 Chatni ochish", "ru": "💬 Открыть чат", "tj": "💬 Кушодани чат", "en": "💬 Open chat"},
    "pause": {"uz": "⏸ Botni to'xtatish (1 soat)", "ru": "⏸ Пауза бота (1 ч)", "tj": "⏸ Боздоштани бот (1 соат)", "en": "⏸ Pause bot (1 h)"},
    "resume": {"uz": "▶️ Botni yoqish", "ru": "▶️ Включить бота", "tj": "▶️ Фаъол кардани бот", "en": "▶️ Resume bot"},
    "paused": {"uz": "Bot 1 soatga to'xtatildi", "ru": "Бот на паузе 1 час", "tj": "Бот 1 соат боздошта шуд", "en": "Bot paused for 1 hour"},
    "resumed": {"uz": "Bot yoqildi", "ru": "Бот включён", "tj": "Бот фаъол шуд", "en": "Bot resumed"},
    "sent": {"uz": "✅ Yuborildi", "ru": "✅ Отправлено", "tj": "✅ Фиристода шуд", "en": "✅ Sent"},
    "window": {"uz": "⚠️ Yuborilmadi: mijoz yozganiga 24 soatdan oshdi, Instagram ruxsat bermaydi.",
               "ru": "⚠️ Не отправлено: прошло больше 24 часов с сообщения клиента — Instagram не разрешает.",
               "tj": "⚠️ Фиристода нашуд: аз паёми мизоҷ зиёда аз 24 соат гузашт — Instagram иҷозат намедиҳад.",
               "en": "⚠️ Not sent: more than 24 hours since the customer's message — Instagram doesn't allow it."},
    "plan": {"uz": "⚠️ Tarifingiz tugagan.", "ru": "⚠️ Ваш тариф закончился.", "tj": "⚠️ Тарифи шумо ба охир расид.", "en": "⚠️ Your plan has ended."},
    "failed": {"uz": "⚠️ Yuborilmadi", "ru": "⚠️ Не отправлено", "tj": "⚠️ Фиристода нашуд", "en": "⚠️ Not sent"},
    "help": {"uz": "👋 ChatFlow shu yerga yangi xabarlar va lidlarni yuboradi.\n\nMijozga javob berish uchun uning xabarini «Reply» qiling va javob yozing — u Instagram Direct'da yetib boradi.",
             "ru": "👋 ChatFlow присылает сюда новые сообщения и заявки.\n\nЧтобы ответить клиенту, сделайте «Ответить» (Reply) на его сообщение — ответ уйдёт в Instagram Direct.",
             "tj": "👋 ChatFlow ба ин ҷо паёмҳо ва лидҳои навро мефиристад.\n\nБарои ҷавоб ба мизоҷ ба паёми ӯ «Reply» кунед ва ҷавоб нависед — он ба Instagram Direct мерасад.",
             "en": "👋 ChatFlow sends new messages and leads here.\n\nTo answer a customer, Reply to their message here — your answer goes to Instagram Direct."},
    "reminder": {"uz": "⏰ Eslatma", "ru": "⏰ Напоминание", "tj": "⏰ Ёдраскунӣ", "en": "⏰ Reminder"},
    "new_msg": {"uz": "💬 Yangi xabar", "ru": "💬 Новое сообщение", "tj": "💬 Паёми нав", "en": "💬 New message"},
    "reply_hint": {"uz": "↩️ Javob berish uchun shu xabarga Reply qiling", "ru": "↩️ Чтобы ответить, сделайте Reply на это сообщение",
                   "tj": "↩️ Барои ҷавоб ба ин паём Reply кунед", "en": "↩️ Reply to this message to answer"},
}


def t(account: IGAccount, key: str) -> str:
    lang = account.user.lang if account.user else "en"
    return TXT[key].get(lang) or TXT[key]["en"]


def webhook_url(account: IGAccount) -> str:
    return f"{settings.APP_URL}/tg/{account.id}"


def contact_buttons(account: IGAccount, contact: Contact) -> dict:
    rows = []
    if settings.APP_URL.startswith("https://"):  # Telegram faqat https havolalarni qabul qiladi
        rows.append([{"text": t(account, "chat"), "url": f"{settings.APP_URL}/app/inbox?c={contact.id}"}])
    rows.append([{"text": t(account, "resume" if contact.bot_paused() else "pause"),
                  "callback_data": f"{'r' if contact.bot_paused() else 'p'}:{contact.id}"}])
    return {"inline_keyboard": rows}


def notify(db: Session, account: IGAccount, text: str, contact: Contact | None = None) -> None:
    """Egasiga xabar; kontakt bo'lsa — tugmalar va Reply orqali javob berish imkoni."""
    if not account.tg_chat_id or not account.tg_bot_token_enc:
        return
    if contact:
        text = f"{text}\n\n{t(account, 'reply_hint')}"
    msg_id = services.telegram_send(account.tg_bot_token_enc, account.tg_chat_id, text,
                                    reply_markup=contact_buttons(account, contact) if contact else None)
    if msg_id and contact:
        db.add(TgLink(account_id=account.id, tg_message_id=msg_id, contact_id=contact.id))
        db.commit()


def _reply(account: IGAccount, chat_id, text: str, reply_to: int | None = None) -> None:
    extra = {"reply_parameters": {"message_id": reply_to, "allow_sending_without_reply": True}} if reply_to else {}
    services.telegram_send(account.tg_bot_token_enc, str(chat_id), text, **extra)


def handle_update(db: Session, account: IGAccount, update: dict) -> None:
    from .engine import log_event, record_message  # sikl importdan qochish

    cb = update.get("callback_query")
    if cb:
        if str(((cb.get("message") or {}).get("chat") or {}).get("id")) != account.tg_chat_id:
            return
        action, _, cid = str(cb.get("data") or "").partition(":")
        contact = db.get(Contact, int(cid)) if cid.isdigit() else None
        text = ""
        if contact and contact.account_id == account.id and action in ("p", "r"):
            contact.bot_paused_until = utcnow() + timedelta(minutes=60) if action == "p" else None
            db.commit()
            text = t(account, "paused" if action == "p" else "resumed")
            msg = cb.get("message") or {}
            try:
                services.telegram_call(account.tg_bot_token_enc, "editMessageReplyMarkup", chat_id=account.tg_chat_id,
                                       message_id=msg.get("message_id"), reply_markup=contact_buttons(account, contact))
            except services.TelegramError:
                pass
        try:
            services.telegram_call(account.tg_bot_token_enc, "answerCallbackQuery", callback_query_id=cb.get("id"), text=text)
        except services.TelegramError:
            pass
        return

    message = update.get("message") or {}
    chat_id = str((message.get("chat") or {}).get("id") or "")
    if not message or chat_id != account.tg_chat_id:
        return  # begona chatlardan kelgan xabarlar e'tiborsiz
    text = (message.get("text") or "").strip()
    reply_to = (message.get("reply_to_message") or {}).get("message_id")
    link = db.scalar(select(TgLink).where(TgLink.account_id == account.id, TgLink.tg_message_id == reply_to)) if reply_to else None
    if not link or not text:
        _reply(account, chat_id, t(account, "help"), message.get("message_id"))
        return
    contact = db.get(Contact, link.contact_id)
    if not contact:
        return
    if not is_active(account.user):
        _reply(account, chat_id, t(account, "plan"), message.get("message_id"))
        return
    if not contact.can_message():
        _reply(account, chat_id, t(account, "window"), message.get("message_id"))
        return
    try:
        ig.send_dm(decrypt(account.access_token_enc), contact.igsid, {"text": text[:1000]})
    except ig.IGError as e:
        _reply(account, chat_id, f"{t(account, 'failed')}: {e}"[:300], message.get("message_id"))
        return
    log_event(db, account, contact, "agent_reply", "", text)
    record_message(db, account.id, contact, "out", text, "agent")
    until = utcnow() + timedelta(minutes=60)
    if not contact.bot_paused_until or contact.bot_paused_until < until:
        contact.bot_paused_until = until
    db.commit()
    _reply(account, chat_id, t(account, "sent"), message.get("message_id"))

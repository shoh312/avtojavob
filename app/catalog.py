"""Mahsulot katalogi: AI uchun matn, Instagram mahsulot kartochkalari (generic template), buyurtma tugmasi."""

import hashlib
import json
import logging
import re
import threading

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import services
from .config import settings
from .models import IGAccount, Product

log = logging.getLogger("chatflow.catalog")
LANGS = ("uz", "ru", "tj", "en")
LANG_NAMES = {"uz": "Uzbek (Latin script)", "ru": "Russian", "tj": "Tajik (Cyrillic script)", "en": "English"}
TRANSLATE_SYSTEM = (
    "You translate a product card of an online shop. Translate the values of \"name\", \"price\" and \"description\" "
    "into {lang}. Keep brand names, model names, numbers, sizes, currencies and emojis exactly as they are; keep line breaks. "
    "Do not add anything. If a value is empty, keep it empty. "
    "Answer only with JSON: {{\"name\": \"...\", \"price\": \"...\", \"description\": \"...\"}}"
)

ORDER_PREFIX = "O:"
TAG = re.compile(r"\[\[\s*product\s*:\s*(\d+)\s*\]\]", re.I)

TXT = {
    "order_btn": {"uz": "🛒 Buyurtma berish", "ru": "🛒 Заказать", "tj": "🛒 Фармоиш додан", "en": "🛒 Order"},
    "more_btn": {"uz": "Batafsil", "ru": "Подробнее", "tj": "Муфассал", "en": "Details"},
    "ask_phone": {"uz": "Ajoyib tanlov! 🙌 «{p}» uchun ismingiz, telefon raqamingiz va email'ingizni yozing — menejerimiz tez orada bog'lanadi.",
                  "ru": "Отличный выбор! 🙌 Чтобы оформить «{p}», напишите ваше имя, телефон и email — менеджер скоро свяжется.",
                  "tj": "Интихоби олӣ! 🙌 Барои «{p}» ном, рақами телефон ва email-и худро нависед — менеҷер ба зудӣ тамос мегирад.",
                  "en": "Great choice! 🙌 To order “{p}”, send your name, phone number and email — our manager will contact you shortly."},
    "thanks": {"uz": "Rahmat! «{p}» bo'yicha buyurtmangiz qabul qilindi — menejerimiz tez orada bog'lanadi ✅",
               "ru": "Спасибо! Заявка на «{p}» принята — менеджер скоро свяжется ✅",
               "tj": "Ташаккур! Фармоиши «{p}» қабул шуд — менеҷер ба зудӣ тамос мегирад ✅",
               "en": "Thank you! Your order for “{p}” is received — our manager will contact you shortly ✅"},
}


def t(account: IGAccount, key: str, lang: str | None = None, **kw) -> str:
    lang = lang or (account.user.lang if account.user else "en")
    return (TXT[key].get(lang) or TXT[key]["en"]).format(**kw)


def active_products(db: Session, account_id: int) -> list[Product]:
    return db.scalars(select(Product).where(Product.account_id == account_id, Product.active.is_(True))
                      .order_by(Product.sort, Product.id)).all()


def catalog_text(products: list[Product]) -> str:
    """AI uchun katalog: id, nom, narx, tavsif."""
    if not products:
        return ""
    lines = []
    for p in products:
        line = f"- [id {p.id}] {p.name}"
        if p.price:
            line += f" — {p.price}"
        if p.description:
            line += f": {p.description.strip()}"
        lines.append(line[:600])
    return "\n".join(lines)


def split_tags(text: str) -> tuple[str, list[int]]:
    """AI javobidan [[product:ID]] teglarini ajratadi -> (toza matn, id'lar)."""
    ids: list[int] = []
    for m in TAG.finditer(text or ""):
        pid = int(m.group(1))
        if pid not in ids:
            ids.append(pid)
    clean = re.sub(r"[ \t]+\n", "\n", TAG.sub("", text or "")).strip()
    return clean, ids[:10]


def image_url(p: Product) -> str | None:
    if not p.image:
        return None
    if p.image.startswith(("https://", "http://")):
        return p.image
    return f"{settings.APP_URL}/uploads/{p.image}"


def _src_hash(p: Product) -> str:
    return hashlib.sha1(f"{p.name}\n{p.price}\n{p.description}".encode()).hexdigest()[:12]


def source_lang(p: Product) -> str | None:
    lang = services.detect_lang(f"{p.name}\n{p.description}")
    return services.LANG_CODES.get(lang) if lang else None


def _parse_json(text: str) -> dict | None:
    text = re.sub(r"^```(?:json)?|```$", "", (text or "").strip(), flags=re.M).strip()
    try:
        data = json.loads(text)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def localized(db: Session, p: Product, lang: str | None) -> dict:
    """Mahsulot nomi/narxi/tavsifi mijoz tilida. AI bilan bir marta tarjima qilinadi va keshlanadi;
    tarjima qilib bo'lmasa (AI yo'q, xato) — asl matn."""
    orig = {"name": p.name, "price": p.price or "", "description": p.description or ""}
    if lang not in LANGS or source_lang(p) == lang:
        return orig
    h = _src_hash(p)
    try:
        cache = json.loads(p.i18n_json or "{}")
    except ValueError:
        cache = {}
    hit = cache.get(lang)
    if isinstance(hit, dict) and hit.get("h") == h:
        return {k: str(hit.get(k) or orig[k]) for k in orig}
    if not services.ai_available(db):
        return orig
    text, error = services.ai_complete(db, TRANSLATE_SYSTEM.format(lang=LANG_NAMES[lang]),
                                       json.dumps(orig, ensure_ascii=False), json_mode=True, max_tokens=2048)
    data = _parse_json(text or "")
    if not data or not str(data.get("name") or "").strip():
        log.info("translate product %s → %s failed: %s", p.id, lang, error)
        return orig
    out = {"name": str(data.get("name") or "").strip()[:80],
           "price": str(data.get("price") or "").strip()[:60] if orig["price"] else "",
           "description": str(data.get("description") or "").strip()[:1000] if orig["description"] else ""}
    cache = {k: v for k, v in cache.items() if isinstance(v, dict) and v.get("h") == h}
    cache[lang] = {**out, "h": h}
    p.i18n_json = json.dumps(cache, ensure_ascii=False)
    db.commit()
    return out


def prewarm(product_id: int) -> None:
    """Mahsulot saqlanganda boshqa tillarga oldindan tarjima (mijozga kartochka kutmasdan ketsin)."""
    def run():
        from .db import SessionLocal
        with SessionLocal() as db:
            p = db.get(Product, product_id)
            if not p or not services.ai_available(db):
                return
            for lang in LANGS:
                try:
                    localized(db, p, lang)
                except Exception:  # noqa: BLE001
                    db.rollback()
                    log.exception("prewarm product %s %s", product_id, lang)
    threading.Thread(target=run, daemon=True).start()


def product_cards(account: IGAccount, products: list[Product], lang: str | None = None,
                  db: Session | None = None) -> dict:
    """Instagram generic template (karusel): rasm, nom, narx, tugmalar — mijoz tilida (db berilsa)."""
    elements = []
    for p in products[:10]:
        loc = localized(db, p, lang) if db is not None else {"name": p.name, "price": p.price, "description": p.description}
        el = {"title": loc["name"][:80], "subtitle": " · ".join(x for x in (loc["price"], loc["description"]) if x)[:80] or " "}
        img = image_url(p)
        if img:
            el["image_url"] = img
        buttons = [{"type": "postback", "title": t(account, "order_btn", lang)[:20], "payload": f"{ORDER_PREFIX}{p.id}"}]
        if p.url:
            buttons.append({"type": "web_url", "title": t(account, "more_btn", lang)[:20], "url": p.url})
            el["default_action"] = {"type": "web_url", "url": p.url}
        el["buttons"] = buttons
        elements.append(el)
    return {"attachment": {"type": "template", "payload": {"template_type": "generic", "elements": elements}}}

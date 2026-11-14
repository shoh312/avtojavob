"""Mahsulot katalogi: AI uchun matn, Instagram mahsulot kartochkalari (generic template), buyurtma tugmasi."""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import IGAccount, Product

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


def product_cards(account: IGAccount, products: list[Product], lang: str | None = None) -> dict:
    """Instagram generic template (karusel): rasm, nom, narx, tugmalar."""
    elements = []
    for p in products[:10]:
        el = {"title": p.name[:80], "subtitle": " · ".join(x for x in (p.price, p.description) if x)[:80] or " "}
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
